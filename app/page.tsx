import Link from "next/link";
import { designerLeads, inr, nikhilMetrics, projectLabel, Range } from "@/lib/metrics";
import { fmtIst, istHour } from "@/lib/time";
import { Def, RoutePill, Toggle } from "./ui";

export const dynamic = "force-dynamic";

type SP = Promise<{ range?: string; view?: string; test?: string; saved?: string }>;

function greeting(): string {
  const h = istHour(new Date());
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const range: Range = sp.range === "today" || sp.range === "30d" ? sp.range : "7d";
  const view = sp.view === "designer" ? "designer" : "nikhil";
  const includeTest = sp.test === "1";
  const q = (o: Record<string, string>) => "/?" + new URLSearchParams({ range, view, ...(includeTest ? { test: "1" } : {}), ...o }).toString();

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>{greeting()}{view === "nikhil" ? ", Nikhil" : ""}</h1>
          <p className="sub">Aangan Studio · AI call agent{includeTest ? " · including test calls" : ""}</p>
        </div>
        <Toggle current={view} items={[
          { key: "nikhil", label: "Nikhil view", href: q({ view: "nikhil" }) },
          { key: "designer", label: "Designer view", href: q({ view: "designer" }) },
        ]} />
      </header>
      <div style={{ marginBottom: 20 }}>
        <Toggle current={range} items={[
          { key: "today", label: "Today", href: q({ range: "today" }) },
          { key: "7d", label: "Last 7 days", href: q({ range: "7d" }) },
          { key: "30d", label: "Last 30 days", href: q({ range: "30d" }) },
        ]} />
      </div>
      {view === "nikhil" ? <NikhilView range={range} includeTest={includeTest} saved={sp.saved === "1"} /> : <DesignerView range={range} includeTest={includeTest} />}
      <p className="sub" style={{ marginTop: 32, fontSize: 14 }}>
        Test calls from the 40 sample enquiries are {includeTest ? "included" : "excluded"}. <Link href={q({ test: includeTest ? "0" : "1" })}>{includeTest ? "Hide test calls" : "Show test calls"}</Link>
      </p>
    </main>
  );
}

async function NikhilView({ range, includeTest, saved }: { range: Range; includeTest: boolean; saved: boolean }) {
  const { m, byHour, needs, recent, settings } = await nikhilMetrics(range, includeTest);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");
  const conv = settings.conversion_pct ?? null;
  const avg = settings.avg_project_value_inr ?? null;
  const value = conv !== null && avg !== null ? m.booked * (conv / 100) * avg : null;
  const costReady = m.calls > 0 && m.costed === m.calls;
  const max = Math.max(1, ...byHour);

  return (
    <>
      <section className="grid" aria-label="Top numbers">
        <div className="tile t-sky">
          <span className="label">Calls received <Def>Every incoming phone call the agent answered in this period. After hours means 7pm to 10am.</Def></span>
          <span className="num">{m.calls}</span>
          <span className="note">{m.after_hours} after hours</span>
        </div>
        <div className="tile t-sage">
          <span className="label">Answered within 5 minutes <Def>Share of calls picked up within 5 minutes of ringing, using Vaani's call timing. Calls with no timing data are left out.</Def></span>
          <span className="num">{pct(m.answered5, m.timed)}</span>
          <span className="muted">Before the agent: about 48% went unanswered within 48 hours</span>
        </div>
        <div className="tile t-butter">
          <span className="label">Qualified leads <Def>Qualified plus flagged, divided by new enquiries. Complaints, vendors, wrong numbers and dropped calls are not new enquiries.</Def></span>
          <span className="num">{m.qualified}</span>
          <span className="note">{pct(m.qualified, m.new_enquiries)} of {m.new_enquiries} new enquiries · {m.flagged} flagged</span>
        </div>
        <div className="tile t-lav">
          <span className="label">Consultations booked <Def>Designer consultations booked in Cal.com during the call.</Def></span>
          <span className="num">{m.booked}</span>
        </div>
        <div className="tile t-stone">
          <span className="label">Cost per call <Def>Vaani voice minutes plus Gemini classifier usage, at the rates set in the deployment settings. Shown only when every call in the period has a cost.</Def></span>
          {costReady ? (<><span className="num">{inr(m.cost_total / m.calls)}</span><span className="note">{inr(m.cost_total)} total this period</span></>)
            : m.calls === 0 ? <span className="num">—</span>
            : (<><span className="num" style={{ fontSize: 28 }}>Set your inputs</span><span className="muted">Cost rates for Vaani and Gemini are not set yet</span></>)}
        </div>
        <div className="tile t-blush">
          <span className="label">Value generated <Def>Consultations booked × your conversion rate to a signed project × your average project value. An estimate, based on your inputs below.</Def></span>
          {value !== null ? (<><span className="num">{inr(value)}</span><span className="muted">Estimate, based on your inputs</span></>)
            : (<><span className="num" style={{ fontSize: 28 }}>Set your inputs</span><span className="muted">Add conversion rate and average project value below</span></>)}
        </div>
      </section>

      <section className="section" aria-label="Needs you">
        <h2>Needs you</h2>
        <div className="needs">
          <div className="need urgent">
            <span><strong>Complaints and escalations waiting</strong><br /><span style={{ fontSize: 14 }}>Urgent · nobody has tapped Taken yet</span></span>
            <span className="num">{needs.escalations}</span>
          </div>
          <div className="need waiting">
            <span><strong>Qualified leads not yet picked up</strong><br /><span style={{ fontSize: 14 }}>No designer has tapped Taken in Telegram</span></span>
            <span className="num">{needs.untaken}</span>
          </div>
        </div>
      </section>

      <section className="section card" aria-label="When calls come in">
        <h2>When calls come in <Def>Calls per hour of the day (India time) in this period. Studio hours are 10am to 7pm.</Def></h2>
        <div className="legend">
          <span><span className="swatch" style={{ background: "var(--mark-studio)" }} />Studio hours</span>
          <span><span className="swatch" style={{ background: "var(--mark-after)" }} />After hours</span>
        </div>
        <div className="chart" role="img" aria-label="Calls by hour of day">
          {byHour.map((n, h) => {
            const after = h < 10 || h >= 19;
            return (
              <div className="bar-wrap" key={h} tabIndex={0}>
                <div className={`bar ${after ? "after" : "studio"}`} style={{ height: `${(n / max) * 100}%`, opacity: n ? 1 : 0.25 }} />
                <span className="tip">{h}:00–{h + 1}:00 · {n} call{n === 1 ? "" : "s"}</span>
              </div>
            );
          })}
        </div>
        <div className="axis" aria-hidden>{byHour.map((_, h) => <span key={h}>{h % 3 === 0 ? h : ""}</span>)}</div>
        <details style={{ marginTop: 8 }}><summary>Show as table</summary>
          <table className="list"><thead><tr><th>Hour</th><th>Calls</th><th>Period</th></tr></thead><tbody>
            {byHour.map((n, h) => n ? <tr key={h}><td>{h}:00</td><td>{n}</td><td>{h < 10 || h >= 19 ? "After hours" : "Studio hours"}</td></tr> : null)}
          </tbody></table>
        </details>
      </section>

      <section className="section card" aria-label="Recent calls">
        <h2>Recent calls</h2>
        {recent.length === 0 ? <p className="empty">No calls in this period yet.</p> : (
          <table className="list">
            <thead><tr><th>Time</th><th>Caller</th><th>Project</th><th>Route</th><th>Slot</th></tr></thead>
            <tbody>{recent.map((c) => (
              <tr key={c.id}>
                <td data-k="Time">{fmtIst(c.call_started_at)} {c.after_hours && <span className="tag after">After hours</span>}{c.is_test && <span className="tag">Test</span>}</td>
                <td data-k="Caller"><Link href={`/calls/${c.id}`}>{c.caller_name || "Unknown caller"}</Link></td>
                <td data-k="Project">{projectLabel(c.fields, c.discovery)}</td>
                <td><RoutePill route={c.route} /></td>
                <td data-k="Slot">{c.slot_start ? fmtIst(c.slot_start, { weekday: "short" }) : "—"}</td>
              </tr>))}
            </tbody>
          </table>)}
      </section>

      <section className="section card settings" aria-label="Your inputs">
        <h2>Your inputs for the value estimate</h2>
        <p className="sub" style={{ marginBottom: 12 }}>The brief gives only a range of Rs 8 to 14 lakh for an average project. Set your own figures; leave a box empty to hide the estimate.{saved ? " Saved." : ""}</p>
        <form method="post" action="/api/settings">
          <label>Conversion to signed project (%)<input name="conversion_pct" inputMode="decimal" defaultValue={conv ?? ""} placeholder="e.g. your rate" /></label>
          <label>Average project value (₹)<input name="avg_project_value_inr" inputMode="numeric" defaultValue={avg ?? ""} placeholder="your figure" /></label>
          <button className="pill-btn btn-solid" type="submit">Save inputs</button>
        </form>
      </section>
    </>
  );
}

async function DesignerView({ range, includeTest }: { range: Range; includeTest: boolean }) {
  const leads = await designerLeads(range, includeTest);
  return (
    <section className="card" aria-label="Your leads">
      <h2 style={{ marginBottom: 8 }}>Your leads</h2>
      {leads.length === 0 ? <p className="empty">No qualified or flagged calls in this period.</p> : (
        <table className="list">
          <thead><tr><th>Caller</th><th>Project</th><th>Time</th><th>Route</th><th>Slot</th><th>Flags</th></tr></thead>
          <tbody>{leads.map((c) => (
            <tr key={c.id}>
              <td data-k="Caller"><Link href={`/calls/${c.id}`}>{c.caller_name || "Unknown caller"}</Link>{c.priority && <span className="tag">{c.priority}</span>}</td>
              <td data-k="Project">{projectLabel(c.fields, c.discovery)}</td>
              <td data-k="Time">{fmtIst(c.call_started_at)} {c.after_hours && <span className="tag after">After hours</span>}{c.is_test && <span className="tag">Test</span>}</td>
              <td><RoutePill route={c.route} />{c.picked_up_by && <div style={{ fontSize: 13 }}>Taken by {c.picked_up_by}</div>}</td>
              <td data-k="Slot">{c.slot_start ? fmtIst(c.slot_start, { weekday: "short" }) : "—"}</td>
              <td data-k="Flags">{(c.flags as string[]).length ? (c.flags as string[]).map((f) => <span key={f} className="tag">{f.replace(/_/g, " ")}</span>) : "—"}</td>
            </tr>))}
          </tbody>
        </table>)}
    </section>
  );
}
