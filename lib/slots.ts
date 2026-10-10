// Plain rule: match the caller's chosen time to exactly one of the slots the backend offered.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function resolveSlot(raw: string | undefined, latestCallerText: string, offered: string[]): string | null {
  if (raw && /^\d{4}-\d{2}-\d{2}T/.test(raw) && !Number.isNaN(Date.parse(raw))) return raw;
  const text = (raw || latestCallerText || "").toLowerCase();
  if (!text || !offered.length) return null;
  // Times count only with am/pm or hh:mm, so "1,200 sq ft" or "3BHK" never match.
  const times = [...text.matchAll(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?(?=\W|$)/g)]
    .filter((m) => m[2] || m[3])
    .map((m) => {
      let h = Number(m[1]) % 12; if (m[3]?.startsWith("p")) h += 12; if (!m[3] && Number(m[1]) === 12) h = 12;
      return { h, min: m[2] ? Number(m[2]) : 0, ampm: !!m[3], raw12: Number(m[1]) % 12 };
    });
  if (!times.length) return null;
  const day = WEEKDAYS.find((d) => text.includes(d));
  const ist = (iso: string) => {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "numeric", weekday: "long", hour12: false }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return { h: Number(get("hour")) % 24, min: Number(get("minute")), day: get("weekday").toLowerCase() };
  };
  const matches = offered.filter((iso) => {
    const s = ist(iso);
    if (day && s.day !== day) return false;
    return times.some((t) => t.min === s.min && (t.ampm ? t.h === s.h : t.raw12 === s.h % 12));
  });
  return matches.length === 1 ? matches[0] : null;
}
