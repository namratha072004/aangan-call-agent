// Replays the 40 sample enquiries through /api/qualify as test calls (is_test = true).
// Pass 1 = mid-call (nothing confirmed, no follow-up asked yet). Pass 2 = end of call (facts read back, one follow-up used).
// Usage: npm run replay            (local, http://localhost:3000)
//        BASE=https://... npm run replay
import { writeFileSync } from "node:fs";
import { parseSamples } from "./parse-samples.mjs";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const GATE = ["real_project", "service_area", "timeline"];
const samples = parseSamples();

async function qualify(s, pass) {
  const body = {
    call_id: `test-${s.id}`,
    stage: pass === 1 ? "progress" : "final",
    caller: { name: s.name ?? undefined },
    fields: {},
    confirmed: pass === 1 ? [] : GATE,
    questions_asked: pass === 1 ? [] : GATE,
    transcript: s.turns,
    call_started_at: s.started_at,
    answered_at: s.started_at, // simulation assumption for test rows only: agent picks up on the first ring
    is_test: true,
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${BASE}/api/qualify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-aangan-secret": process.env.QUALIFY_SECRET ?? "" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json;
    if (attempt === 3) return { route: `HTTP ${res.status}`, error: json.error };
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const p1 = await pool(samples, 4, (s) => qualify(s, 1));
const p2 = await pool(samples, 4, (s) => qualify(s, 2));

const rows = samples.map((s, i) => ({
  id: s.id, mid_call: p1[i]?.route, mid_question: p1[i]?.next_question ?? "", final: p2[i]?.route,
  close_reason: p2[i]?.close_reason ?? "", urgent: !!p2[i]?.urgent, flags: (p2[i]?.flags ?? []).join(","),
  pricing_disclosed: p1[i]?.pricing_disclosed || p2[i]?.pricing_disclosed,
}));
console.table(rows.map(({ mid_question, ...r }) => r));
const disclosed = rows.filter((r) => r.pricing_disclosed !== false);
console.log(`\npricing_disclosed false on ${rows.length - disclosed.length}/${rows.length}${disclosed.length ? " — CHECK: " + disclosed.map((r) => r.id).join(", ") : ""}`);
const counts = rows.reduce((a, r) => ((a[r.final] = (a[r.final] ?? 0) + 1), a), {});
console.log("Final routes:", counts);
writeFileSync(new URL("../test-report/replay.json", import.meta.url), JSON.stringify(rows, null, 2));
