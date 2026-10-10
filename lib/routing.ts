// Plain rules, not AI. Takes Gemini's per-criterion judgement and decides the route.
// Sources: classifier_context.md "Routes", rubric_v3.md §5-6, build_config.md §1-3.
import { config } from "./config";
import { CLOSE_LINES, ESCALATE_LINE, FOLLOW_UP, GENERIC_CLOSE } from "./lines";
import type { Classification, QualifyRequest, Route, Status } from "./types";

const GATE = ["real_project", "service_area", "timeline"] as const; // criteria 1 to 3
type Gate = (typeof GATE)[number];

export interface Decision {
  route: Route;
  urgent: boolean;
  flags: string[];
  close_reason: string | null;
  next_question: string | null;
  say_line: string | null; // scripted line for the voice agent, when there is one
  statuses: Record<string, Status>;
  priority: string | null;
}

// build_config.md §1: start later than the window → early_stage; finish sooner than MIN_PROJECT_WEEKS → timeline_tight.
// Neither closes. Only TIMELINE_CLOSE_WEEKS (Nikhil to decide, empty by default) can make the timeline fail.
export function timelineCheck(c: Classification["criteria"]["timeline"]): { status: Status; flags: string[] } {
  const finish = c?.weeks_to_finish ?? null;
  const start = c?.start_weeks ?? null;
  const flags: string[] = [];
  if (finish !== null && config.timelineCloseWeeks !== null && finish < config.timelineCloseWeeks) return { status: "fail", flags };
  if (start !== null && start > config.startWindowWeeks) flags.push("early_stage");
  if ((finish !== null && finish < config.minProjectWeeks) || c?.status === "tight") flags.push("timeline_tight");
  if (finish === null && start === null && c?.status !== "pass" && c?.status !== "tight") return { status: "unclear", flags };
  return { status: flags.includes("timeline_tight") ? "tight" : "pass", flags };
}

// build_config.md §2: floor = fraction x lower-bound cost for the scope. Unknown area/rooms → cannot fail.
export function budgetFloor(b: Classification["criteria"]["budget"]): number | null {
  const f = config.budgetFloor;
  if (f.fraction === null) return null;
  const s = b?.scope_for_budget; if (!s) return null;
  if (s.kind === "commercial") return s.area_sqft && f.commercialPerSqft !== null ? f.fraction * f.commercialPerSqft * s.area_sqft : null;
  if (s.kind === "rooms" && s.rooms && f.perRoom !== null) return f.fraction * f.perRoom * s.rooms;
  if (s.area_sqft && f.residentialPerSqft !== null) return f.fraction * f.residentialPerSqft * s.area_sqft;
  if (s.rooms && f.perRoom !== null) return f.fraction * f.perRoom * s.rooms;
  return null;
}

export function budgetStatus(b: Classification["criteria"]["budget"]): "pass" | "unclear" | "fail" {
  if (!b || b.amount_stated === null || b.amount_stated === undefined) return "pass"; // not mentioned → qualified
  const floor = budgetFloor(b);
  if (floor === null) return "unclear"; // a number without a clear scope → flag budget_unclear
  return b.amount_stated < floor ? "fail" : "pass";
}

// `confirmed` may hold criterion keys or short read-back facts ("locality: Nashik"). Plain keyword match.
const CONFIRM_WORDS: Record<Gate, RegExp> = {
  real_project: /real_project|scope|advice|ideas|project|type|restaurant|gym|retail|hotel/i,
  service_area: /service_area|area|locality|location|city|nashik|mumbai|talegaon|lonavala/i,
  timeline: /timeline|date|ready|finish|weeks|start/i,
};
function isConfirmed(k: Gate, confirmed: string[], g: Classification): boolean {
  return confirmed.some((c) => CONFIRM_WORDS[k].test(c) ||
    (k === "service_area" && !!g.criteria?.service_area?.locality && c.toLowerCase().includes(g.criteria.service_area.locality.toLowerCase())));
}

function closeReason(k: Gate, g: Classification): string {
  if (k === "service_area") return "area";
  if (k === "timeline") return "timeline";
  return g.close_reason === "advice_only" || g.close_reason === "out_of_scope_type" ? g.close_reason : "scope";
}

export function decide(g: Classification, req: QualifyRequest, pricingDisclosed: boolean): Decision {
  const flags = new Set<string>(Array.isArray(g.flags) ? g.flags : []);
  if (pricingDisclosed) flags.add("pricing_disclosed");
  const confirmed = (req.confirmed ?? []).map(String);
  const asked = new Set(req.questions_asked ?? []);
  const tl = timelineCheck(g.criteria?.timeline);

  const statuses: Record<string, Status> = {
    real_project: g.criteria?.real_project?.status ?? "unclear",
    service_area: g.criteria?.service_area?.status ?? "unclear",
    timeline: tl.status,
    budget: budgetStatus(g.criteria?.budget),
    decision_maker: g.criteria?.decision_maker?.status === "pass" ? "pass" : "unclear", // never fail
  };

  const out = (route: Route, extra: Partial<Decision> = {}): Decision => ({
    route, urgent: false, flags: [...flags], close_reason: null, next_question: null, say_line: null, statuses,
    priority: route === "qualified" || route === "qualified_flagged" ? g.priority ?? null : null, ...extra,
  });

  // 1. Complaint, existing client, request for a human or Nikhil, abusive or distressed: a human handles it, urgent.
  if (g.call_type === "existing_client" || g.route === "escalate_human" || flags.has("abusive")) {
    return out("escalate_human", { urgent: true, say_line: ESCALATE_LINE });
  }
  // 2. Vendor, job seeker, media, wrong number, spam.
  if (g.call_type === "non_lead" || g.route === "non_lead") return out("non_lead");
  // 3. Silent line or call dropped before anything useful was said.
  if (g.call_type === "dropped") { flags.add("callback_needed"); return out("dropped"); }

  // 4. Criteria 1 to 3 fail: counts only once the caller has confirmed the fact on read-back (CLOSE_ON_SINGLE_FAIL on).
  for (const k of GATE) {
    if (statuses[k] !== "fail") continue;
    if (isConfirmed(k, confirmed, g)) {
      const reason = closeReason(k, g);
      return out("close", { close_reason: reason, say_line: CLOSE_LINES[reason] ?? GENERIC_CLOSE });
    }
    const loc = g.criteria?.service_area?.locality;
    const readBack = g.next_question || (k === "service_area" && loc ? `Just to confirm, that is in ${loc}?` : FOLLOW_UP[k]);
    return out("ask_question", { next_question: readBack });
  }

  // 5. Criteria 1 to 3 unclear: one direct question; if still unclear after it, qualify with a flag.
  for (const k of GATE) {
    if (statuses[k] !== "unclear") continue;
    if (!asked.has(k)) return out("ask_question", { next_question: FOLLOW_UP[k] });
    flags.add(`${k}_unclear`);
  }

  // 6. Timeline tight / early stage, budget, decision-maker: never block. Qualified but flagged.
  tl.flags.forEach((f) => flags.add(f));
  if (statuses.budget === "unclear") flags.add("budget_unclear");
  if (statuses.budget === "fail") {
    if (config.budgetCloseEnabled) return out("close", { close_reason: "budget", say_line: CLOSE_LINES.budget });
    flags.add("budget_mismatch");
  }
  if (statuses.decision_maker === "unclear") flags.add("decision_maker_unclear");
  // Gemini may also mark these; only code-confirmed ones count.
  if (statuses.budget !== "unclear") flags.delete("budget_unclear");
  if (statuses.budget !== "fail") flags.delete("budget_mismatch");

  const flagging = ["timeline_tight", "budget_unclear", "budget_mismatch", "decision_maker_unclear",
    "real_project_unclear", "service_area_unclear", "timeline_unclear"];
  return out(flagging.some((f) => flags.has(f)) ? "qualified_flagged" : "qualified");
}

// Belt and braces: catch any price, range, per-sq-ft figure or cost judgement in the agent's own words.
const PRICE_RE = /(₹|\brs\.?\s*\d|\binr\b|\d[\d,.]*\s*(lakh|lac|lakhs|crore|cr\b|k\b)|per\s*sq\.?\s*(ft|feet|foot)|rates?\s+start|starts?\s+(at|from)\s+\d|around\s+\d|\d+\s*x\s+the\s+cost|\b\d+×|(that'?s|sounds|is)\s+(low|high|cheap|expensive|affordable|enough|fine)\b)/i;

export function agentDisclosedPrice(transcript: QualifyRequest["transcript"]): boolean {
  if (!Array.isArray(transcript)) return false;
  return transcript.some((t) => t.role === "agent" && PRICE_RE.test(t.text ?? ""));
}
