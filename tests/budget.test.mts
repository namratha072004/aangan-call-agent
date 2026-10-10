// Budget floor (build_config.md §2) with the proposed values from local .env. Run: npx tsx --env-file=.env tests/budget.test.mts
import assert from "node:assert/strict";
const { budgetStatus, decide } = await import("../lib/routing");
const b = (amount: number | null, rooms: number | null, area: number | null, kind: string) =>
  ({ status: "unclear" as const, evidence: "", amount_stated: amount, scope_for_budget: { rooms, area_sqft: area, kind } });
assert.ok(process.env.BUDGET_FLOOR_FRACTION, "floor values not set in .env");
assert.equal(budgetStatus(b(150000, 2, 550, "rooms")), "fail"); console.log("✓ T10: ₹1.5L for 2 rooms → fail");
assert.equal(budgetStatus(b(500000, 2, 875, "rooms")), "pass"); console.log("✓ F08: ₹5L for 2 rooms → pass");
assert.equal(budgetStatus(b(4000000, null, 1950, "full_home")), "pass"); console.log("✓ F06: ₹40L for 1,950 sq ft → pass");
assert.equal(budgetStatus(b(2200000, null, 1300, "full_home")), "pass"); console.log("✓ F10: ₹22L for 1,300 sq ft → pass");
assert.equal(budgetStatus(b(8000000, null, 2200, "commercial")), "pass"); console.log("✓ F05: ₹80L for 2,200 sq ft office → pass");
assert.equal(budgetStatus(b(150000, null, null, "unknown")), "unclear"); console.log("✓ budget with unknown scope → unclear (cannot fail)");
assert.equal(budgetStatus(b(null, null, null, "unknown")), "pass"); console.log("✓ no budget → pass");
const g: any = { call_type: "new_enquiry", criteria: { real_project: { status: "pass" }, service_area: { status: "pass" },
  timeline: { status: "pass", weeks_to_finish: 20, start_weeks: null }, budget: b(150000, 2, 550, "rooms"), decision_maker: { status: "pass" } }, flags: [] };
const d = decide(g, { call_id: "t" }, false);
assert.equal(d.route, "qualified_flagged"); assert.ok(d.flags.includes("budget_mismatch"));
console.log("✓ budget fail with BUDGET_CLOSE_ENABLED off → qualified_flagged + budget_mismatch");
