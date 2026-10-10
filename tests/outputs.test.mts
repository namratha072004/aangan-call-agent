// A failing or unconfigured output must never stop the others. Run: npx tsx tests/outputs.test.mts
import assert from "node:assert/strict";

async function run(label: string) {
  const { safely } = await import("../lib/outputs/result");
  const { sendHandoff } = await import("../lib/outputs/telegram");
  const { book } = await import("../lib/outputs/calcom");
  const { createLead } = await import("../lib/outputs/hubspot");
  const row = { id: "00000000-0000-0000-0000-000000000000", caller_name: "Test", caller_phone: "+910000000000", route: "qualified",
    urgent: false, after_hours: false, priority: "P2", flags: [], summary: "test", slot_start: null, fields: {}, call_started_at: new Date().toISOString(), is_test: true };
  const results = await Promise.all([
    safely("telegram", () => sendHandoff(row)),
    safely("calcom", () => book({ start: new Date(Date.now() + 864e5).toISOString(), name: "Test", email: "test@example.com", callId: "t" })),
    safely("hubspot", () => createLead({ name: "Test", phone: "+910000000000", summary: "", route: "qualified", callUrl: "" })),
  ]);
  console.log(label, results.map((r) => ({ ok: r.ok, skipped: !!r.skipped, reason: String(r.reason).slice(0, 70) })));
  assert.equal(results.length, 3);
  results.forEach((r) => assert.equal(r.ok, false));
  return results;
}

// 1. Missing credentials: each output is skipped and logged.
for (const k of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "CALCOM_API_KEY", "CALCOM_EVENT_TYPE_ID", "HUBSPOT_TOKEN"]) delete process.env[k];
const a = await run("missing creds:");
a.forEach((r) => assert.equal(r.skipped, true));

// 2. Wrong credentials: each output fails on its own; all three still return.
Object.assign(process.env, { TELEGRAM_BOT_TOKEN: "000:bad", TELEGRAM_CHAT_ID: "1", CALCOM_API_KEY: "bad", CALCOM_EVENT_TYPE_ID: "1", HUBSPOT_TOKEN: "bad" });
const b = await run("bad creds:");
b.forEach((r) => assert.ok(!r.skipped && r.reason));
console.log("\n✓ every output failed independently; none stopped another");
