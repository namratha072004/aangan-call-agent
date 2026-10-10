export interface OutputResult { ok: boolean; skipped?: boolean; reason?: string; at: string; [k: string]: unknown }

export const skipped = (reason: string): OutputResult => {
  console.warn(`[output skipped] ${reason}`);
  return { ok: false, skipped: true, reason, at: new Date().toISOString() };
};

// Runs one output; a failure is logged and returned, never thrown, so it cannot stop the others or the call.
export async function safely(name: string, fn: () => Promise<OutputResult>): Promise<OutputResult> {
  try {
    return await fn();
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`[output failed] ${name}: ${reason}`);
    return { ok: false, reason, at: new Date().toISOString() };
  }
}
