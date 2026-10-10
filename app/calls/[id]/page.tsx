import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { fmtIst } from "@/lib/time";
import { RoutePill } from "../../ui";

export const dynamic = "force-dynamic";

const CRITERIA: [string, string][] = [
  ["real_project", "1. Real project with execution"], ["service_area", "2. In Pune or PCMC"], ["timeline", "3. Workable timeline"],
  ["budget", "4. Budget (only if volunteered)"], ["decision_maker", "5. Decision-maker on the call"],
];

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c] = await sql()`SELECT * FROM calls WHERE id = ${id}`;
  if (!c) notFound();
  const fields = (c.fields ?? {}) as Record<string, unknown>;
  const crit = (c.criteria ?? {}) as Record<string, { status?: string; evidence?: string }> & { code_status?: Record<string, string> };
  const transcript = Array.isArray(c.transcript) ? (c.transcript as { role: string; text: string }[]) : null;

  return (
    <main className="wrap">
      <p><Link href="/?view=designer">← Back to leads</Link></p>
      <header className="top">
        <div>
          <h1>{c.caller_name || "Unknown caller"}</h1>
          <p className="sub">{fmtIst(c.call_started_at)}{c.after_hours ? " · after hours" : ""}{c.is_test ? " · test call" : ""}</p>
        </div>
        <div><RoutePill route={c.route} /> {c.urgent && <span className="route r-escalate_human">Urgent</span>}</div>
      </header>
      <div className="grid">
        <section className="card">
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Answers</h2>
          <dl className="kv">
            <dt>Phone</dt><dd>{c.caller_phone || "—"}</dd>
            {Object.entries(fields).map(([k, v]) => <Fragment key={k}><dt>{k.replace(/_/g, " ")}</dt><dd>{String(v ?? "—")}</dd></Fragment>)}
            <dt>Slot</dt><dd>{c.slot_start ? fmtIst(c.slot_start, { weekday: "long" }) : "Not booked"}</dd>
            <dt>Priority</dt><dd>{c.priority || "—"}</dd>
            <dt>Flags</dt><dd>{(c.flags as string[]).join(", ") || "—"}</dd>
            <dt>Taken by</dt><dd>{c.picked_up_by || "Not yet"}</dd>
          </dl>
        </section>
        <section className="card">
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Summary</h2>
          <p style={{ marginTop: 0 }}>{c.summary || "—"}</p>
          <h3 style={{ fontSize: 17, margin: "12px 0 6px" }}>Five criteria</h3>
          <dl className="kv">
            {CRITERIA.map(([k, label]) => <Fragment key={k}><dt>{label}</dt><dd><strong>{crit.code_status?.[k] ?? crit[k]?.status ?? "—"}</strong>{crit[k]?.evidence ? ` · “${crit[k]?.evidence}”` : ""}</dd></Fragment>)}
          </dl>
        </section>
      </div>
      <section className="card section transcript">
        <h2 style={{ fontSize: 20 }}>Transcript</h2>
        {transcript ? transcript.map((t, i) => <p key={i}><span className="who">{t.role === "agent" ? "Agent" : "Caller"}:</span> {t.text}</p>)
          : typeof c.transcript === "string" ? <p style={{ whiteSpace: "pre-wrap" }}>{c.transcript}</p> : <p className="empty">No transcript received.</p>}
      </section>
    </main>
  );
}
