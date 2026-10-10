import { config } from "../config";
import { fmtIst } from "../time";
import { OutputResult, skipped } from "./result";

export interface CallRow {
  id: string | null; caller_name: string | null; caller_phone: string | null; route: string; urgent: boolean;
  after_hours: boolean; priority: string | null; flags: string[]; summary: string | null;
  slot_start: string | null; fields: Record<string, unknown> | null; call_started_at: string; is_test: boolean;
  discovery?: Record<string, unknown> | null;
  failures?: string[]; // systems that failed on this call (build_config.md §4 fallback)
  update?: string; // short follow-up note instead of a full handoff
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

const api = (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

export async function sendHandoff(row: CallRow): Promise<OutputResult> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return skipped("Telegram: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");

  const f = row.fields ?? {};
  const label = row.priority ? ` [${row.priority}]` : "";
  const head = row.update ? `📅 <b>${esc(row.update)}</b>` : row.urgent ? "🔴 <b>URGENT — needs a senior person</b>" : row.route === "qualified_flagged" ? `🟡 <b>NEW LEAD${label} (flagged)</b>` : `🟢 <b>NEW LEAD${label}</b>`;
  const lines = [
    head + (row.is_test ? " [TEST]" : ""),
    `<b>Caller:</b> ${esc(row.caller_name) || "not given"} · ${esc(row.caller_phone) || "no number"}`,
    `<b>Called:</b> ${fmtIst(row.call_started_at)}${row.after_hours ? " (after hours)" : ""}`,
    `<b>Project:</b> ${esc(f.property_type ?? row.discovery?.project_type ?? "")} · ${esc(f.scope ?? "")} · ${esc(f.locality ?? "")}`,
    f.completion_date ? `<b>Wants it ready:</b> ${esc(f.completion_date)}` : "",
    f.decision_maker ? `<b>Decision-maker:</b> ${esc(f.decision_maker)}` : "",
    `<b>Slot:</b> ${row.slot_start ? fmtIst(row.slot_start, { weekday: "short" }) : "not booked"}`,
    row.failures?.length ? `⚠️ <b>System issue:</b> ${row.failures.join(", ")} failed on this call; details may be incomplete` : "",
    row.flags.length ? `<b>Flags:</b> ${row.flags.map(esc).join(", ")}` : "",
    row.summary ? `\n${esc(row.summary)}` : "",
    row.id ? `\n<a href="${config.baseUrl}/calls/${row.id}">Answers and transcript</a>` : "",
  ].filter(Boolean);

  const res = await api("sendMessage", {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: lines.join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(row.id && !row.update ? { reply_markup: { inline_keyboard: [[{ text: "Taken", callback_data: `take:${row.id}` }]] } } : {}),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`Telegram: ${body.description ?? res.status}`);
  return { ok: true, message_id: body.result?.message_id, at: new Date().toISOString() };
}

export async function markTaken(chatId: number, messageId: number, by: string, callbackId: string) {
  await api("answerCallbackQuery", { callback_query_id: callbackId, text: `Taken by ${by}` });
  await api("editMessageReplyMarkup", {
    chat_id: chatId, message_id: messageId,
    reply_markup: { inline_keyboard: [[{ text: `✅ Taken by ${by}`, callback_data: "noop" }]] },
  });
}
