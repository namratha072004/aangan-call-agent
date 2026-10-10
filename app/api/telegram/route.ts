import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { markTaken } from "@/lib/outputs/telegram";

export const runtime = "nodejs";

// Telegram calls this when a designer taps "Taken" on a handoff note.
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ ok: false }, { status: 401 });

  const update = await req.json();
  const cb = update?.callback_query;
  const m = typeof cb?.data === "string" ? cb.data.match(/^take:([0-9a-f-]{36})$/) : null;
  if (!cb || !m) return NextResponse.json({ ok: true });

  const by = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ") || "a designer";
  await sql()`UPDATE calls SET picked_up_at = COALESCE(picked_up_at, now()), picked_up_by = COALESCE(picked_up_by, ${by}) WHERE id = ${m[1]}`;
  try { await markTaken(cb.message.chat.id, cb.message.message_id, by, cb.id); } catch (e) { console.error("[telegram] markTaken failed", e); }
  return NextResponse.json({ ok: true });
}
