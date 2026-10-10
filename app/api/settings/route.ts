import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// Nikhil's inputs for the value estimate. Empty values are stored as null ("Set your inputs").
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const parse = (k: string) => {
    const v = String(form.get(k) ?? "").replace(/,/g, "").trim();
    const n = Number(v);
    return v === "" || !Number.isFinite(n) || n < 0 ? null : n;
  };
  const conversion = parse("conversion_pct");
  const avgValue = parse("avg_project_value_inr");
  const db = sql();
  for (const [key, value] of [["conversion_pct", conversion], ["avg_project_value_inr", avgValue]] as const) {
    await db`INSERT INTO settings (key, value) VALUES (${key}, ${JSON.stringify(value)}::jsonb)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  }
  return NextResponse.redirect(new URL("/?saved=1", req.url), 303);
}
