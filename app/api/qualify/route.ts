import { after, NextRequest, NextResponse } from "next/server";
import { classify, ClassifyResult } from "@/lib/classifier";
import { config } from "@/lib/config";
import { sql } from "@/lib/db";
import { PRICING_LINES } from "@/lib/lines";
import { book, nextSlots } from "@/lib/outputs/calcom";
import { createLead } from "@/lib/outputs/hubspot";
import { OutputResult, safely } from "@/lib/outputs/result";
import { CallRow, sendHandoff } from "@/lib/outputs/telegram";
import { decide, Decision, pricingDisclosed as pricingCheck } from "@/lib/routing";
import { isAfterHours } from "@/lib/time";
import { resolveSlot } from "@/lib/slots";
import type { QualifyRequest, Turn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const LEAD_ROUTES = new Set(["qualified", "qualified_flagged"]);

function authorised(req: NextRequest): boolean {
  const secret = process.env.QUALIFY_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // open only on a dev machine
  return req.headers.get("x-aangan-secret") === secret;
}

// Accept this build's field names, build_config.md §5 names, and the flat all-string form voice tools send
// (caller as a name, fields_so_far as text, confirmed / questions_asked as comma lists, caller_words as text).
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean) : [];

function normalise(raw: QualifyRequest): QualifyRequest {
  const b = raw as QualifyRequest & { caller?: unknown; fields_so_far?: unknown; caller_name?: string };
  const caller = typeof b.caller === "string" ? { name: b.caller } : (b.caller as QualifyRequest["caller"]) ?? {};
  const fieldsRaw: unknown = b.fields ?? b.fields_so_far;
  const fields = typeof fieldsRaw === "string" ? (fieldsRaw.trim() ? { summary: fieldsRaw } : {}) : (fieldsRaw as QualifyRequest["fields"]) ?? {};
  return {
    ...b,
    caller: { ...caller, name: caller.name || b.caller_name || undefined, phone: caller.phone ?? b.caller_number },
    fields,
    confirmed: list(b.confirmed),
    questions_asked: list(b.questions_asked),
    book_slot: b.book_slot?.trim() || undefined,
    transcript: b.transcript ?? b.caller_words ?? "",
  };
}

// Voice agents often send only the latest turn and partial fields on each mid-call request.
// Keep the whole call: append new lines to the stored transcript and merge fields, confirmed facts and questions asked.
const asText = (t: unknown): string => {
  if (Array.isArray(t)) return t.map((x) => (typeof x === "object" && x ? `${(x as Turn).role}: ${(x as Turn).text}` : String(x))).join("\n");
  return typeof t === "string" ? t : "";
};

function mergeWithPrevious(b: QualifyRequest, prev: Record<string, any>): QualifyRequest {
  const before = asText(prev.transcript).trim();
  const now = asText(b.transcript).trim();
  const transcript = !before ? now : !now || before.includes(now) ? before : now.includes(before) ? now : `${before}\n${now}`;
  const prevFields = (prev.fields ?? {}) as Record<string, unknown>;
  const newFields = Object.fromEntries(Object.entries(b.fields ?? {}).filter(([, v]) => v !== "" && v !== null && v !== undefined));
  const union = (a: unknown, c: string[] | undefined) => [...new Set([...(Array.isArray(a) ? a.map(String) : []), ...(c ?? [])])];
  const confirmed = union(prevFields._confirmed, b.confirmed);
  const asked = union(prevFields._asked, b.questions_asked);
  return {
    ...b,
    caller: { ...b.caller, name: b.caller?.name || prev.caller_name || undefined },
    transcript,
    confirmed,
    questions_asked: asked,
    fields: { ...prevFields, ...newFields, _confirmed: confirmed, _asked: asked },
  };
}

function callerText(t: unknown): string {
  return asText(t).split("\n").filter((l) => !/^\s*(agent|assistant|ai|bot)\s*:/i.test(l)).join("\n");
}

function costInr(r: QualifyRequest, durationSec: number | null, tokensIn: number, tokensOut: number): number | null {
  const voice = typeof r.vaani_cost_inr === "number" ? r.vaani_cost_inr
    : config.vaaniInrPerMin !== null && durationSec !== null ? (durationSec / 60) * config.vaaniInrPerMin : null;
  const llm = config.geminiInrPer1mIn !== null && config.geminiInrPer1mOut !== null
    ? (tokensIn / 1e6) * config.geminiInrPer1mIn + (tokensOut / 1e6) * config.geminiInrPer1mOut : null;
  if (voice === null || llm === null) return null; // incomplete inputs: "Set your inputs", never a half number
  return Math.round((voice + llm) * 100) / 100;
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });

  let body: QualifyRequest;
  try { body = normalise(await req.json()); } catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  if (!body?.call_id || typeof body.call_id !== "string") return NextResponse.json({ ok: false, error: "call_id is required" }, { status: 400 });

  const now = new Date();
  const db = sql();
  let dbOk = true;
  const logFail = (what: string) => (e: unknown) => { dbOk = false; console.error(`[qualify] ${what} failed for call ${body.call_id}: ${e instanceof Error ? e.message : e}`); return [] as Record<string, any>[]; };

  // Previous state of this call, and whether the same number has an open lead in the last REPEAT_CALLER_DAYS.
  const [[prev], [repeat]] = await Promise.all([
    db`SELECT id, call_started_at, booking, outputs, gemini_tokens_in, gemini_tokens_out, transcript, fields, caller_name
         FROM calls WHERE call_id = ${body.call_id}`.catch(logFail("read")),
    body.caller?.phone
      ? db`SELECT id FROM calls WHERE caller_phone = ${body.caller.phone} AND call_id <> ${body.call_id} AND NOT is_test
             AND call_started_at >= now() - make_interval(days => ${config.repeatCallerDays}) LIMIT 1`.catch(logFail("repeat check"))
      : Promise.resolve([]),
  ]);
  const prevOutputs: Record<string, OutputResult> = prev?.outputs ?? {};
  const latestCallerText = callerText(body.transcript); // this request only, before merging
  const offeredSlots: string[] = Array.isArray(prev?.fields?._slots) ? prev.fields._slots : [];
  if (prev) body = mergeWithPrevious(body, prev);
  // Plain rule: book when book_slot (ISO or loose, e.g. "Monday 10 AM") or the caller's latest words match exactly one offered slot.
  const chosenSlot = resolveSlot(body.book_slot, latestCallerText, offeredSlots);

  // 1. AI judgement: Gemini checks the five criteria.
  // Start fetching Cal.com slots now, in parallel with the classifier; used only if the lead qualifies.
  const testOutputsHeader = req.headers.get("x-test-outputs") === "true";
  const slotsPrefetch: Promise<string[]> | null = (!body.is_test || testOutputsHeader) && !prev?.booking?.ok && !chosenSlot
    ? nextSlots().catch((e) => { console.error(`[output failed] calcom slots: ${e.message}`); return []; })
    : null;
  let cls: ClassifyResult | null = null;
  let decision: Decision;
  const callerSpoke = Array.isArray(body.transcript)
    ? body.transcript.some((t) => t.role === "caller" && t.text?.trim())
    : typeof body.transcript === "string" && body.transcript.split("\n").some((l) => !/^\s*(agent|assistant|ai|bot)\s*:/i.test(l) && l.replace(/^\s*\w+\s*:/, "").trim() !== "");
  const realFields = Object.entries(body.fields ?? {}).filter(([k, v]) => !k.startsWith("_") && v !== "" && v != null);
  if (!callerSpoke && realFields.length === 0) {
    // Plain rule: silent line or dropped before the caller said anything. No classifier call needed.
    decision = { route: "dropped", urgent: false, flags: ["callback_needed"], close_reason: null, next_question: null,
      say_line: null, statuses: {}, priority: null };
  } else try {
    cls = await classify(body);
    const disclosed = pricingCheck(cls.data.pricing_disclosed === true, body.transcript);
    decision = decide(cls.data, body, disclosed);
  } catch (e) {
    // Classifier down: never guess. A person calls back (not marked urgent).
    console.error(`[qualify] classifier failed for call ${body.call_id}: ${e instanceof Error ? e.message : e}`);
    decision = { route: "escalate_human", urgent: false, flags: ["callback_needed", "classifier_error"], close_reason: null,
      next_question: null, say_line: null, statuses: {}, priority: null };
  }
  if (repeat) decision.flags = [...new Set([...decision.flags, "repeat_caller"])];
  const g = cls?.data;
  const pricingDisclosed = decision.flags.includes("pricing_disclosed");

  // 2. Cal.com: offer slots, or book the slot the caller chose. Qualified routes only.
  let booking = prev?.booking ?? null;
  let slots: string[] = [];
  const isLead = LEAD_ROUTES.has(decision.route);
  const outputsAllowed = !body.is_test || req.headers.get("x-test-outputs") === "true";
  let justBooked = false;
  if (isLead && outputsAllowed && !booking?.ok) {
    if (chosenSlot) {
      booking = await safely("calcom", () => book({
        start: chosenSlot, name: body.caller?.name ?? "", phone: body.caller?.phone, email: body.attendee_email, callId: body.call_id,
      }));
      justBooked = booking.ok;
    } else {
      slots = (await slotsPrefetch) ?? [];
      if (slots.length) body.fields = { ...(body.fields ?? {}), _slots: slots }; // remembered so a later pick can be matched
    }
  }

  // 3. Timing and cost.
  const startedAt = body.call_started_at ? new Date(body.call_started_at) : prev?.call_started_at ? new Date(prev.call_started_at) : now;
  const answeredAt = body.answered_at ? new Date(body.answered_at) : null;
  // With ring start but no pick-up time, the first mid-call request is an upper bound on pick-up.
  const answeredWithin5m = body.call_started_at ? ((answeredAt ?? now).getTime() - startedAt.getTime()) <= 5 * 60e3 : null;
  const durationSec = typeof body.duration_sec === "number" ? body.duration_sec : null;
  const tokensIn = (prev?.gemini_tokens_in ?? 0) + (cls?.tokensIn ?? 0);
  const tokensOut = (prev?.gemini_tokens_out ?? 0) + (cls?.tokensOut ?? 0);
  const cost = costInr(body, durationSec, tokensIn, tokensOut);
  const slotStart = booking?.ok ? (booking.start as string) : null;

  // 4. One row per call in Neon. A failed write is logged and never stops the call or the handoff.
  const [row] = await db`
    INSERT INTO calls (call_id, call_started_at, answered_at, answered_within_5m, after_hours, is_test, stage, caller_name, caller_phone,
      call_type, language, fields, criteria, discovery, route, close_reason, next_question, priority, flags, urgent, summary, transcript,
      pricing_asked_count, pricing_disclosed, booking, slot_start, duration_sec, gemini_tokens_in, gemini_tokens_out, cost_inr)
    VALUES (${body.call_id}, ${startedAt.toISOString()}, ${answeredAt?.toISOString() ?? null}, ${answeredWithin5m}, ${isAfterHours(startedAt)},
      ${!!body.is_test}, ${body.stage ?? "progress"}, ${body.caller?.name ?? null}, ${body.caller?.phone ?? null},
      ${g?.call_type ?? null}, ${g?.language ?? body.language ?? null}, ${JSON.stringify(body.fields ?? {})}::jsonb,
      ${JSON.stringify({ ...(g?.criteria ?? {}), code_status: decision.statuses })}::jsonb, ${JSON.stringify(g?.discovery ?? {})}::jsonb,
      ${decision.route}, ${decision.close_reason}, ${decision.next_question}, ${decision.priority}, ${decision.flags}, ${decision.urgent},
      ${g?.summary ?? null}, ${JSON.stringify(body.transcript ?? null)}::jsonb, ${g?.pricing_asked_count ?? 0}, ${pricingDisclosed},
      ${booking ? JSON.stringify(booking) : null}::jsonb, ${slotStart}, ${durationSec}, ${tokensIn}, ${tokensOut}, ${cost})
    ON CONFLICT (call_id) DO UPDATE SET
      updated_at = now(), answered_at = COALESCE(EXCLUDED.answered_at, calls.answered_at),
      answered_within_5m = COALESCE(EXCLUDED.answered_within_5m, calls.answered_within_5m),
      stage = EXCLUDED.stage, caller_name = COALESCE(EXCLUDED.caller_name, calls.caller_name),
      caller_phone = COALESCE(EXCLUDED.caller_phone, calls.caller_phone), call_type = EXCLUDED.call_type, language = EXCLUDED.language,
      fields = EXCLUDED.fields, criteria = EXCLUDED.criteria, discovery = EXCLUDED.discovery, route = EXCLUDED.route,
      close_reason = EXCLUDED.close_reason, next_question = EXCLUDED.next_question, priority = EXCLUDED.priority, flags = EXCLUDED.flags,
      urgent = calls.urgent OR EXCLUDED.urgent, summary = EXCLUDED.summary, transcript = EXCLUDED.transcript,
      pricing_asked_count = EXCLUDED.pricing_asked_count, pricing_disclosed = calls.pricing_disclosed OR EXCLUDED.pricing_disclosed,
      booking = EXCLUDED.booking, slot_start = EXCLUDED.slot_start, duration_sec = COALESCE(EXCLUDED.duration_sec, calls.duration_sec),
      gemini_tokens_in = EXCLUDED.gemini_tokens_in, gemini_tokens_out = EXCLUDED.gemini_tokens_out, cost_inr = EXCLUDED.cost_inr
    RETURNING id, call_started_at, after_hours`.catch(logFail("write"));

  // 5. Handoff (build_config.md §5): Telegram as soon as the route is qualified/flagged, or on escalation (urgent).
  //    HubSpot on stage final, qualified routes, new callers only. Both run after the reply, in parallel, isolated.
  const telegramDue = (isLead || decision.route === "escalate_human") && !prevOutputs.telegram?.ok;
  const hubspotDue = isLead && (body.stage === "final" || justBooked) && !body.is_test && !prevOutputs.hubspot?.ok && !repeat; // repeat = same number seen in Neon, not the model's guess
  if (outputsAllowed && (telegramDue || hubspotDue || justBooked)) {
    after(async () => {
      const callRow: CallRow = {
        id: row?.id ?? null, caller_name: body.caller?.name ?? null, caller_phone: body.caller?.phone ?? null, route: decision.route,
        urgent: decision.urgent, after_hours: row?.after_hours ?? isAfterHours(startedAt), priority: decision.priority, flags: decision.flags,
        summary: g?.summary ?? null, slot_start: slotStart, fields: (body.fields ?? {}) as Record<string, unknown>,
        call_started_at: row?.call_started_at ?? startedAt.toISOString(), is_test: !!body.is_test, discovery: g?.discovery ?? null,
        failures: [!dbOk && "logging", booking && !booking.ok && !booking.skipped && "calendar"].filter(Boolean) as string[],
      };
      const tasks: Record<string, Promise<OutputResult>> = {};
      if (telegramDue) tasks.telegram = safely("telegram", () => sendHandoff(callRow));
      else if (justBooked) tasks.telegram_booking = safely("telegram", () => sendHandoff({ ...callRow, update: "Slot booked" }));
      if (hubspotDue) {
        tasks.hubspot = safely("hubspot", () => createLead({
          name: callRow.caller_name, phone: callRow.caller_phone, locality: String(body.fields?.locality ?? g?.criteria?.service_area?.locality ?? ""),
          summary: callRow.summary, route: decision.route, callUrl: row?.id ? `${config.baseUrl}/calls/${row.id}` : "",
        }));
      }
      const names = Object.keys(tasks);
      const results = await Promise.all(Object.values(tasks));
      const patch = Object.fromEntries(names.map((n, i) => [n, results[i]]));
      if (row?.id && names.length) await db`UPDATE calls SET outputs = outputs || ${JSON.stringify(patch)}::jsonb WHERE id = ${row.id}`.catch(logFail("outputs write"));
    });
  }

  // 6. Reply to the voice agent (build_config.md §5): the route it must follow, plus any scripted line.
  return NextResponse.json({
    ok: true,
    call_id: body.call_id,
    route: decision.route,
    say_line: decision.say_line,
    next_question: decision.next_question,
    priority: decision.priority,
    flags: decision.flags,
    close_reason: decision.close_reason,
    urgent: decision.urgent,
    slots,
    booking: booking?.ok ? { confirmed: true, start: slotStart } : booking ? { confirmed: false } : null,
    pricing_lines: PRICING_LINES,
    pricing_disclosed: pricingDisclosed,
  });
}
