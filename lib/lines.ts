// Scripted lines, quoted verbatim from the context files. The model never writes these.

// voice_agent_context.md: pricing, level 1 and level 2 (no number, ever)
export const PRICING_LINES = {
  level1: "Pricing depends on the site, the materials you choose, and the scope, so I don't want to give you a number that wouldn't mean anything. Your designer will walk you through it in detail at the consultation.",
  level2: "I understand it's useful to know early. Every project here is specific to the site and the specification, so the honest answer is that it can't be answered well on a phone call. A designer can give you a proper picture at the consultation, and I can book that now.",
};

// build_config.md §3
export const CLOSE_LINES: Record<string, string> = {
  area: "Thank you for calling. We currently work only in Pune and PCMC because our execution depends on our own contractor network, so I'm sorry we can't take this one on. If you ever have a project in our area, we'd be glad to help.",
  scope: "Thank you for explaining. We're a full design-and-execution studio, so I don't think we'd be the right fit for this. Please do reach out if your plans change.",
  timeline: "I want to be honest with you: a project of this kind needs more time for design and execution than that, and I wouldn't want to rush it. If you can start later, we'd be glad to help.",
  out_of_scope_type: "Thank you for thinking of us. That kind of space is outside what we do, and I'd rather say so than promise something we can't deliver well.",
  budget: "Thank you for being open about that. I want to be upfront so I don't waste your time: we take on complete design-and-execution projects, and from what you've described I don't think we'd be the right fit right now. If your plans change, we'd be glad to hear from you.",
};
CLOSE_LINES.advice_only = CLOSE_LINES.scope;
// build_config.md §3: generic close (Nikhil's wording)
export const GENERIC_CLOSE = "This sounds like it may not be the right fit for us right now, but feel free to reach out if your timeline or scope changes.";

// classifier_context.md: one short direct question for the first unclear criterion
export const FOLLOW_UP: Record<"real_project" | "service_area" | "timeline", string> = {
  real_project: "Are you looking for the complete design and execution, or more for ideas and advice?",
  service_area: "Which locality, exactly?",
  timeline: "When would you like it ready?",
};

// rubric_v3.md §7 / voice_agent_context.md: "I'll note that and have someone senior call you back."
export const ESCALATE_LINE = "I'll note that and have someone senior call you back.";
