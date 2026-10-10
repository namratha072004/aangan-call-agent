import { config } from "./config";

// Studio hours are 10am to 7pm (brief). Anything from 7pm to 10am IST is after hours.
export function istHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: config.studioTz }).format(d)) % 24;
}

export function isAfterHours(d: Date): boolean {
  const h = istHour(d);
  return h < 10 || h >= 19;
}

export function fmtIst(d: Date | string | null, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: config.studioTz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", ...opts,
  }).format(new Date(d));
}
