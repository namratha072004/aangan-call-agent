// Turns context/sample_enquiries.txt (text of the September PDF) into 40 caller-side test calls.
// Only the caller's own words are kept: front-desk lines, staff notes and status lines are dropped,
// because in the replay our agent (not the old front desk) is the one speaking.
import { readFileSync } from "node:fs";

const MONTH_SHIFT_DAYS = 14; // moves Sep 2-26 into the last 30 days so test rows show on the dashboard when "Show test calls" is on

export function parseSamples(path = new URL("../context/sample_enquiries.txt", import.meta.url)) {
  const raw = readFileSync(path, "utf8").replace(/\r/g, "");
  const parts = raw.split(/\n(?=(?:T|W|F)\d\d · )/).slice(1);
  return parts.map((block) => {
    const text = block.replace(/\nSECTION \d[\s\S]*$/, "");
    const [header, ...rest] = text.split("\n");
    const id = header.slice(0, 3);
    const m = header.match(/(\d{1,2})(?:–\d+)? September(?: · (\d{1,2}):(\d{2})\s*(am|pm))?/);
    const day = Number(m?.[1] ?? 1);
    let hour = Number(m?.[2] ?? 12) % 12; if (m?.[4] === "pm") hour += 12;
    const minute = Number(m?.[3] ?? 0);
    // WhatsApp/web form first message time
    const wt = text.match(/(\d{1,2}) Sept, (\d{1,2}):(\d{2})(am|pm)/);
    const ft = header.match(/(\d{1,2}):(\d{2})(am|pm)/);
    if (!m?.[2] && (wt || ft)) {
      const t = wt ? [wt[2], wt[3], wt[4]] : [ft[1], ft[2], ft[3]];
      hour = (Number(t[0]) % 12) + (t[2] === "pm" ? 12 : 0);
    }
    const started = new Date(Date.UTC(2026, 8, day + MONTH_SHIFT_DAYS, hour, minute) - 5.5 * 3600e3);

    const body = rest.join("\n");
    const turns = [];
    let name = null;
    if (id[0] === "T") {
      let cur = null;
      for (const line of body.split("\n")) {
        const sp = line.match(/^(Front Desk|Caller|Note|First call|Second call)\b:?\s*(.*)$/);
        if (sp) { cur = sp[1] === "Caller" ? { role: "caller", text: sp[2] } : null; if (cur) turns.push(cur); continue; }
        if (cur && line.trim()) cur.text += " " + line.trim();
      }
      if (/MISSED CALL/.test(header)) turns.length = 0;
    } else if (id[0] === "W") {
      let cur = null;
      for (const line of body.split("\n")) {
        const sp = line.match(/^\d{1,2} Sept, [\d:]+(?:am|pm)(?: \(\w+\))? — ([^:]+): (.*)$/);
        if (sp) { cur = sp[1].trim() === "Front Desk" ? null : { role: "caller", text: sp[2] }; if (cur) { turns.push(cur); name ??= sp[1].trim() === "Unknown number" ? null : sp[1].trim(); } continue; }
        if (/^\[|^Status:|^Note:/.test(line.trim())) { cur = null; continue; }
        if (cur && line.trim()) cur.text += " " + line.trim();
      }
    } else {
      const flat = body.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
      turns.push({ role: "caller", text: `[Web form, read out as if spoken] ${flat}` });
      const n = flat.match(/^Name: (.+?) Phone:/); name = n ? n[1].replace(/\s*\(.*\)$/, "") : null;
    }
    if (!name) {
      const all = turns.map((t) => t.text).join(" ");
      const n = all.match(/(?:I[’']m|this is|My name is|I am) ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/) || turns.map((t) => t.text.match(/^([A-Z][a-z]+ [A-Z][a-z]+)\. /)).find(Boolean);
      name = n ? n[1] : null;
    }
    return { id, name, started_at: started.toISOString(), turns };
  });
}

if (process.argv[1]?.endsWith("parse-samples.mjs")) {
  const s = parseSamples();
  console.log(s.length, "samples");
  for (const x of s) console.log(x.id, x.started_at, x.name, x.turns.length, (x.turns[0]?.text ?? "").slice(0, 70));
}
