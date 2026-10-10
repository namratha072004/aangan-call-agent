# Connecting Vaani Labs to `/api/qualify`

The voice agent calls one endpoint mid-call (build_config.md §5). Menu names below are generic; match them to the Vaani app.

## 1. System prompt
Paste the whole of `context/voice_agent_context.md` into the agent's system prompt / instructions. Do not paste `rubric_v3.md`, `build_config.md` or `pricing.md`.

Add these lines at the end (tool mechanics only; no studio facts):

```
While waiting for the qualify tool, say one short line such as "One moment while I note that down."
Send `caller_words` as the conversation so far, each turn as {"role": "caller" | "agent", "text": "..."}.
When the caller confirms a read-back fact (for example the locality), add it to `confirmed` (for example "service_area" or "locality: Nashik").
When you ask the follow-up question for a criterion, add that criterion to `questions_asked`.
When the caller picks a slot from `slots`, call qualify again with `book_slot` set to that slot.
```

## 2. Custom tool (function / webhook)

| Setting | Value |
|---|---|
| Name | `qualify` |
| Description | Judge the lead and get the route to follow. Call with stage "progress" once name, locality and project are known, again as timeline and decision-maker are learned, and once with stage "final" before ending any call that got past the greeting. |
| Method | `POST` |
| URL | `https://aangan-call-agent-sandy.vercel.app/api/qualify` |
| Header | `x-aangan-secret: <QUALIFY_SECRET from Vercel env>` |
| Header | `content-type: application/json` |
| Timeout | 15 seconds (typical reply 4 to 6 s) |
| Run during call | yes (synchronous; the agent waits for the reply) |

Parameters (JSON schema):

```json
{
  "type": "object",
  "required": ["call_id", "stage"],
  "properties": {
    "call_id":        {"type": "string", "description": "Vaani's call ID, same for every qualify call in this call"},
    "caller_number":  {"type": "string", "description": "Caller ID of the incoming call"},
    "language":       {"type": "string", "enum": ["en", "hi", "mr", "mixed"]},
    "stage":          {"type": "string", "enum": ["progress", "final"]},
    "caller":         {"type": "object", "properties": {"name": {"type": "string"}}},
    "fields_so_far":  {"type": "object", "properties": {
        "property_type":   {"type": "string", "description": "home or office"},
        "locality":        {"type": "string"},
        "scope":           {"type": "string"},
        "completion_date": {"type": "string"},
        "decision_maker":  {"type": "string"},
        "budget":          {"type": "string", "description": "only if the caller volunteered it"}
    }},
    "confirmed":       {"type": "array", "items": {"type": "string"}},
    "questions_asked": {"type": "array", "items": {"type": "string"}},
    "caller_words":    {"type": "array", "items": {"type": "object", "properties": {"role": {"type": "string"}, "text": {"type": "string"}}}},
    "call_started_at": {"type": "string", "description": "ISO time the call started ringing, if Vaani exposes it"},
    "answered_at":     {"type": "string", "description": "ISO time the agent picked up, if Vaani exposes it"},
    "duration_sec":    {"type": "number", "description": "on the final call, if available"},
    "book_slot":       {"type": "string", "description": "ISO start of the slot the caller chose from `slots`"}
  }
}
```

If Vaani offers call variables, map `call_id`, `caller_number`, `call_started_at` and `answered_at` from them rather than asking the model to fill them.

## 3. What the agent does with the reply

| `route` | Agent does |
|---|---|
| `qualified` / `qualified_flagged` | Go to booking. Offer 2 or 3 of `slots`; call again with `book_slot`. `booking.confirmed: true` → read back the slot |
| `ask_question` | Ask `next_question` in its own friendly words, then call `qualify` again |
| `close` | Say `say_line` exactly, then end warmly |
| `escalate_human` | Say `say_line` ("I'll note that and have someone senior call you back."), take the number, end |
| `non_lead` / `dropped` | End politely |

`pricing_lines.level1` / `level2` are the only words to use for a price question.

## 4. Sample request

```bash
curl -X POST https://aangan-call-agent-sandy.vercel.app/api/qualify \
  -H "content-type: application/json" \
  -H "x-aangan-secret: $QUALIFY_SECRET" \
  -d @scripts/sample-request.json
```

`scripts/sample-request.json` is marked `is_test: true`, so it is excluded from Nikhil's numbers and sends no Telegram, Cal.com or HubSpot output. Remove `is_test` for a real end-to-end check.

## 5. Still to confirm in Vaani
- Whether call timing (ring start, pick-up) and cost per call can be read by `call_id`. Until then the dashboard's "Answered within 5 minutes" uses `call_started_at`/`answered_at` if sent, and cost shows "Set your inputs".
- The tool timeout limit; the reply takes 4 to 6 seconds (Gemini).
