// Deterministic checks of the plain-rules router (no Gemini, no network). Run: npx tsx tests/routing.test.ts
import assert from "node:assert/strict";
import { agentDisclosedPrice, decide } from "../lib/routing";
import type { Classification } from "../lib/types";

const base = (o: Partial<Classification["criteria"]> = {}, extra: Partial<Classification> = {}): Classification => ({
  call_type: "new_enquiry", language: "en",
  criteria: {
    real_project: { status: "pass", evidence: "" },
    service_area: { status: "pass", evidence: "", locality: "Kothrud" },
    timeline: { status: "pass", evidence: "", start_weeks: null, weeks_to_finish: 24 },
    budget: { status: "not_shared", evidence: "", amount_stated: null },
    decision_maker: { status: "pass", evidence: "" },
    ...o,
  },
  route: "qualified", close_reason: null, next_question: null, priority: "P2", discovery: {}, flags: [],
  pricing_asked_count: 0, pricing_disclosed: false, summary: "", next_step: "", ...extra,
});
const R = (call_id = "t") => ({ call_id });
let n = 0; const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("all pass → qualified", () => assert.equal(decide(base(), R(), false).route, "qualified"));
t("area unclear → ask one question (fixed line)", () => {
  const d = decide(base({ service_area: { status: "unclear", evidence: "near Pune" } }), R(), false);
  assert.equal(d.route, "ask_question"); assert.equal(d.next_question, "Which locality, exactly?");
});
t("scope unclear after one follow-up → flagged", () => {
  const d = decide(base({ real_project: { status: "unclear", evidence: "" } }), { call_id: "t", questions_asked: ["real_project"] }, false);
  assert.equal(d.route, "qualified_flagged"); assert.ok(d.flags.includes("real_project_unclear"));
});
t("timeline with no date → ask 'When would you like it ready?'", () => {
  const d = decide(base({ timeline: { status: "unclear", evidence: "", start_weeks: null, weeks_to_finish: null } }), R(), false);
  assert.equal(d.next_question, "When would you like it ready?");
});
t("decision-maker unclear → qualified but flagged", () => {
  const d = decide(base({ decision_maker: { status: "unclear", evidence: "for my parents" } }), R(), false);
  assert.equal(d.route, "qualified_flagged"); assert.ok(d.flags.includes("decision_maker_unclear"));
});
t("budget volunteered, no floor configured → flagged budget_unclear, not closed", () => {
  const d = decide(base({ budget: { status: "unclear", evidence: "", amount_stated: 150000, scope_for_budget: { rooms: 2, area_sqft: 550, kind: "rooms" } } }), R(), false);
  assert.equal(d.route, "qualified_flagged"); assert.ok(d.flags.includes("budget_unclear"));
});
t("start in 16 weeks → early_stage flag", () => {
  const d = decide(base({ timeline: { status: "pass", evidence: "", start_weeks: 16, weeks_to_finish: 30 } }), R(), false);
  assert.ok(d.flags.includes("early_stage"));
});
t("finish in 8 weeks → tight → flagged", () => {
  const d = decide(base({ timeline: { status: "pass", evidence: "", start_weeks: null, weeks_to_finish: 8 } }), R(), false);
  assert.equal(d.route, "qualified_flagged"); assert.ok(d.flags.includes("timeline_tight"));
});
t("area fail, not yet confirmed → read-back question", () => {
  const d = decide(base({ service_area: { status: "fail", evidence: "Nashik", locality: "Nashik" } }), R(), false);
  assert.equal(d.route, "ask_question"); assert.match(d.next_question!, /Nashik/);
});
t("area fail, confirmed → close gracefully with the rubric line", () => {
  const d = decide(base({ service_area: { status: "fail", evidence: "Nashik" } }), { call_id: "t", confirmed: ["service_area"] }, false);
  assert.equal(d.route, "close"); assert.equal(d.close_reason, "area"); assert.match(d.say_line!, /only in Pune and PCMC/);
});
t("finish in 3 weeks, confirmed → flagged timeline_tight, NOT closed (TIMELINE_CLOSE_WEEKS unset)", () => {
  const d = decide(base({ timeline: { status: "tight", evidence: "before Diwali", start_weeks: null, weeks_to_finish: 3 } }), { call_id: "t", confirmed: ["timeline"] }, false);
  assert.equal(d.route, "qualified_flagged"); assert.ok(d.flags.includes("timeline_tight"));
});
t("confirmed as free text ('locality: Nashik') counts as confirmed", () => {
  const d = decide(base({ service_area: { status: "fail", evidence: "Nashik", locality: "Nashik" } }), { call_id: "t", confirmed: ["Nashik"] }, false);
  assert.equal(d.route, "close"); assert.match(d.say_line!, /Pune and PCMC/);
});
t("complaint → escalate_human, urgent", () => {
  const d = decide(base({}, { call_type: "existing_client", route: "escalate_human" }), R(), false);
  assert.equal(d.route, "escalate_human"); assert.equal(d.urgent, true);
});
t("vendor → non_lead", () => assert.equal(decide(base({}, { call_type: "non_lead", route: "non_lead" }), R(), false).route, "non_lead"));
t("dropped call → dropped + callback_needed", () => {
  const d = decide(base({}, { call_type: "dropped" }), R(), false); assert.equal(d.route, "dropped"); assert.ok(d.flags.includes("callback_needed"));
});
t("price guard catches agent figures, ignores the fixed line", () => {
  assert.equal(agentDisclosedPrice([{ role: "agent", text: "It's around 2,000 per sq ft." }]), true);
  assert.equal(agentDisclosedPrice([{ role: "agent", text: "For a 2BHK it's typically 8 lakh" }]), true);
  assert.equal(agentDisclosedPrice([{ role: "agent", text: "Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like." }]), false);
  assert.equal(agentDisclosedPrice([{ role: "caller", text: "my budget is 5 lakh" }]), false);
});
console.log(`\n${n} routing checks passed`);
