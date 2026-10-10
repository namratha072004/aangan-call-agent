import { config } from "../config";
import { OutputResult, skipped } from "./result";

const BASE = "https://api.cal.com/v2";
const headers = (version: string) => ({
  Authorization: `Bearer ${process.env.CALCOM_API_KEY}`, "cal-api-version": version, "content-type": "application/json",
});
const ready = () => !!process.env.CALCOM_API_KEY && !!process.env.CALCOM_EVENT_TYPE_ID;

// Next open consultation slots, so the agent can offer them during the call.
export async function nextSlots(limit = 3): Promise<string[]> {
  if (!ready()) { skipped("Cal.com: CALCOM_API_KEY or CALCOM_EVENT_TYPE_ID not set (slots)"); return []; }
  const start = new Date(); const end = new Date(Date.now() + 14 * 864e5);
  const qs = new URLSearchParams({
    eventTypeId: process.env.CALCOM_EVENT_TYPE_ID!, start: start.toISOString(), end: end.toISOString(), timeZone: config.studioTz,
  });
  const res = await fetch(`${BASE}/slots?${qs}`, { headers: headers("2024-09-04") });
  const body = await res.json();
  if (!res.ok) throw new Error(`Cal.com slots: ${body?.error?.message ?? res.status}`);
  const days = Object.values(body.data ?? {}) as { start: string }[][];
  return days.flat().map((s) => s.start).slice(0, limit);
}

export async function book(args: { start: string; name: string; phone?: string; email?: string; callId: string }): Promise<OutputResult> {
  if (!ready()) return skipped("Cal.com: CALCOM_API_KEY or CALCOM_EVENT_TYPE_ID not set (booking)");
  // Callers on the phone rarely give an email; Cal.com requires one, so the studio inbox is used unless the caller gave one.
  const email = args.email || process.env.CALCOM_ATTENDEE_FALLBACK_EMAIL;
  if (!email) return skipped("Cal.com: no attendee email and CALCOM_ATTENDEE_FALLBACK_EMAIL not set");
  const res = await fetch(`${BASE}/bookings`, {
    method: "POST",
    headers: headers("2024-08-13"),
    body: JSON.stringify({
      start: args.start,
      eventTypeId: Number(process.env.CALCOM_EVENT_TYPE_ID),
      attendee: { name: args.name || "Caller", email, timeZone: config.studioTz, ...(args.phone ? { phoneNumber: args.phone } : {}) },
      metadata: { call_id: args.callId },
    }),
  });
  const body = await res.json();
  if (!res.ok || body.status === "error") throw new Error(`Cal.com booking: ${body?.error?.message ?? res.status}`);
  return { ok: true, uid: body.data?.uid, start: body.data?.start ?? args.start, at: new Date().toISOString() };
}
