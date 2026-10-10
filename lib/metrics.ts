import { sql } from "./db";
import { config } from "./config";

export type Range = "today" | "7d" | "30d";

export function since(range: Range): Date {
  if (range === "today") {
    const ist = new Date(Date.now() + 5.5 * 3600e3); // IST midnight, expressed in UTC
    ist.setUTCHours(0, 0, 0, 0);
    return new Date(ist.getTime() - 5.5 * 3600e3);
  }
  return new Date(Date.now() - (range === "7d" ? 7 : 30) * 864e5);
}

const NOT_NEW = ["escalate_human", "non_lead", "dropped"];

export async function nikhilMetrics(range: Range, includeTest: boolean) {
  const db = sql();
  const from = since(range).toISOString();
  const [m] = await db`
    SELECT count(*)::int AS calls,
      count(*) FILTER (WHERE after_hours)::int AS after_hours,
      count(*) FILTER (WHERE answered_within_5m)::int AS answered5,
      count(*) FILTER (WHERE answered_within_5m IS NOT NULL)::int AS timed,
      count(*) FILTER (WHERE route <> ALL(${NOT_NEW}) AND call_type IS DISTINCT FROM 'existing_client')::int AS new_enquiries,
      count(*) FILTER (WHERE route IN ('qualified','qualified_flagged'))::int AS qualified,
      count(*) FILTER (WHERE route = 'qualified_flagged')::int AS flagged,
      count(*) FILTER (WHERE slot_start IS NOT NULL)::int AS booked,
      count(*) FILTER (WHERE cost_inr IS NOT NULL)::int AS costed,
      COALESCE(sum(cost_inr), 0)::float AS cost_total,
      count(*) FILTER (WHERE pricing_disclosed)::int AS pricing_disclosed
    FROM calls WHERE call_started_at >= ${from} AND (${includeTest} OR NOT is_test)`;

  const hours = await db`
    SELECT extract(hour FROM call_started_at AT TIME ZONE ${config.studioTz})::int AS h, count(*)::int AS n
    FROM calls WHERE call_started_at >= ${from} AND (${includeTest} OR NOT is_test) GROUP BY 1`;

  const [needs] = await db`
    SELECT count(*) FILTER (WHERE route = 'escalate_human' AND picked_up_at IS NULL AND resolved_at IS NULL)::int AS escalations,
      count(*) FILTER (WHERE route IN ('qualified','qualified_flagged') AND picked_up_at IS NULL)::int AS untaken
    FROM calls WHERE (${includeTest} OR NOT is_test) AND call_started_at >= now() - interval '30 days'`;

  const recent = await db`
    SELECT id, call_started_at, caller_name, fields, discovery, route, slot_start, after_hours, urgent, is_test
    FROM calls WHERE call_started_at >= ${from} AND (${includeTest} OR NOT is_test)
    ORDER BY call_started_at DESC LIMIT 12`;

  const settingsRows = await db`SELECT key, value FROM settings WHERE key IN ('conversion_pct','avg_project_value_inr')`;
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value])) as { conversion_pct?: number | null; avg_project_value_inr?: number | null };

  const byHour = Array.from({ length: 24 }, (_, h) => hours.find((r) => r.h === h)?.n ?? 0);
  return { m, byHour, needs, recent, settings };
}

export async function designerLeads(range: Range, includeTest: boolean) {
  return sql()`
    SELECT id, call_started_at, caller_name, fields, discovery, route, slot_start, after_hours, flags, priority, picked_up_by, is_test
    FROM calls WHERE route IN ('qualified','qualified_flagged','escalate_human')
      AND call_started_at >= ${since(range).toISOString()} AND (${includeTest} OR NOT is_test)
    ORDER BY urgent DESC, call_started_at DESC LIMIT 100`;
}

export const inr = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: n < 100 ? 2 : 0 }).format(n);

export function projectLabel(fields: Record<string, unknown> | null, discovery: Record<string, unknown> | null): string {
  const f = fields ?? {}; const d = discovery ?? {};
  return [f.scope ?? d.project_type ?? f.property_type, f.locality].filter(Boolean).map(String).join(" · ") || "—";
}
