// Values from build_config.md (Nikhil can change any of them in env without touching prompts or code).
// The budget floor figures are NOT committed: they live in env only, because they derive from the internal pricing guide.

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const config = {
  // build_config.md §1
  startWindowWeeks: num(process.env.START_WINDOW_WEEKS) ?? 10, // later start → flag early_stage, never close
  minProjectWeeks: num(process.env.MIN_PROJECT_WEEKS) ?? 11, // sooner finish → flag timeline_tight, never close
  timelineCloseWeeks: num(process.env.TIMELINE_CLOSE_WEEKS), // NIKHIL TO DECIDE. Empty = timeline never closes a call
  budgetCloseEnabled: process.env.BUDGET_CLOSE_ENABLED === "true", // OFF until Nikhil approves the floor numbers
  repeatCallerDays: num(process.env.REPEAT_CALLER_DAYS) ?? 7,
  // build_config.md §2 budget floor = fraction x lower bound for the scope. Empty = the check cannot fail.
  budgetFloor: {
    fraction: num(process.env.BUDGET_FLOOR_FRACTION),
    residentialPerSqft: num(process.env.BUDGET_FLOOR_RES_PER_SQFT),
    perRoom: num(process.env.BUDGET_FLOOR_PER_ROOM),
    commercialPerSqft: num(process.env.BUDGET_FLOOR_COM_PER_SQFT),
  },
  // Cost per call. build_config.md §5: voice cost should come from Vaani call history by call_id (not yet confirmed).
  // Until then, rates are PLACEHOLDERS: empty = dashboard shows "Set your inputs".
  vaaniInrPerMin: num(process.env.VAANI_INR_PER_MIN),
  geminiInrPer1mIn: num(process.env.GEMINI_INR_PER_1M_INPUT),
  geminiInrPer1mOut: num(process.env.GEMINI_INR_PER_1M_OUTPUT),
  // Mid-call (stage "progress") checks use the fast model; the final check, which sets the stored route,
  // Telegram and HubSpot, uses the more accurate one.
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
  geminiModelFinal: process.env.GEMINI_MODEL_FINAL || "gemini-3.8-flash",
  baseUrl: (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
  studioTz: "Asia/Kolkata",
};
