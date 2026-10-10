import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config";
import type { Classification, QualifyRequest } from "./types";

// Only these two files are ever sent to the model. classifier_context.md already encodes Nikhil's rubric
// (qualified.md), which is not sent because it contains a rupee example. pricing.md is never read.
const PROMPT_FILES = ["classifier_context.md", "services.md"] as const;

let _system: string | null = null;
function systemPrompt(): string {
  if (_system) return _system;
  const dir = path.join(process.cwd(), "context");
  const [classifier, services] = PROMPT_FILES.map((f) => readFileSync(path.join(dir, f), "utf8"));
  const text = `${classifier}\n\n---\n# Studio services, area and timelines (services.md)\n${services}`;
  // Guard: the model must never see a price.
  if (/₹|\blakh|\brs\.?\s*\d/i.test(text)) throw new Error("Price-like content found in classifier prompt");
  _system = text;
  return text;
}

export interface ClassifyResult { data: Classification; tokensIn: number; tokensOut: number }

export async function classify(req: QualifyRequest): Promise<ClassifyResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const input = {
    stage: req.stage ?? "progress",
    language: req.language ?? null,
    fields: req.fields ?? {},
    confirmed: req.confirmed ?? [],
    questions_asked: req.questions_asked ?? [],
    today: new Date().toISOString().slice(0, 10),
    transcript: req.transcript ?? "",
  };

  const generationConfig: Record<string, unknown> = { responseMimeType: "application/json" };
  // Keep latency low for a live call: minimal thinking.
  generationConfig.thinkingConfig = config.geminiModel.includes("2.5") ? { thinkingBudget: 0 } : { thinkingLevel: "low" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt() }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
          generationConfig,
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    const text: string = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    const data = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim()) as Classification;
    return {
      data,
      tokensIn: body?.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: (body?.usageMetadata?.candidatesTokenCount ?? 0) + (body?.usageMetadata?.thoughtsTokenCount ?? 0),
    };
  } finally {
    clearTimeout(timer);
  }
}
