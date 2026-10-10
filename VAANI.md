# Connecting Vaani to `/api/qualify` (as configured on app.vaanivoice.ai)

Agent: `aangan-inbound-enquiry-agent` (Design → Agents).

## 1. System prompt
Persona → System Prompt = `vaani/system_prompt.md` (the live version). It is `context/voice_agent_context.md` plus tool mechanics, a limit of about three tool calls per call, and a hard rule that slots and bookings come only from the tool. The previous self-judging prompt is kept in `vaani/system_prompt_before_tool.md`.

Brain (LLM): primary Google `gemini-3.5-flash`, fallback Openai `gpt-4o-mini` (Azure is disabled in Vaani and blocks saving).

## 2. Custom tool (Persona → Actions → Custom Tools) — must be switched ON

| Setting | Value |
|---|---|
| Name | `qualify` |
| Method / URL | `POST https://aangan-call-agent-sandy.vercel.app/api/qualify` |
| Header | `x-aangan-secret` = `QUALIFY_SECRET` from Vercel env |
| Timeout | 15000 ms |
| Toggle | ON (it was saved off once; the agent then invented slots) |

Parameters: all **string** (objects with no sub-fields and arrays with no item type make the model reject the tool):
`call_id`, `caller_number`, `language`, `stage` ("progress" or "final"), `caller` (name), `fields_so_far` (short text), `confirmed` (comma list), `questions_asked` (comma list), `caller_words` (conversation so far; Vaani sends JSON text, which the backend parses), `book_slot` (optional).

## 3. What the backend does with each call
- Keeps the whole call by `call_id` (appends turns, merges fields), so partial requests are fine.
- Returns `route`, `say_line`, `next_question`, `slots`, `booking`, `pricing_lines`.
- Books when the caller's words match exactly one offered slot (for example "10AM, please"), then sends Telegram "Slot booked" and creates the HubSpot contact + deal.

| `route` | Agent does |
|---|---|
| `qualified` / `qualified_flagged` | Offer the returned `slots`; read back the slot only if `booking.confirmed` |
| `ask_question` | Ask `next_question` |
| `close` | Say `say_line` exactly, end warmly |
| `escalate_human` | Say `say_line`, take the number, end |
| `non_lead` / `dropped` | End politely |

## 4. Sample request

```bash
curl -X POST https://aangan-call-agent-sandy.vercel.app/api/qualify \
  -H "content-type: application/json" \
  -H "x-aangan-secret: $QUALIFY_SECRET" \
  -d @scripts/sample-request.json
```

## 5. Still to set in Vaani
- Map Vaani's caller-ID variable into `caller_number` (today it sends a placeholder).
- For real customers, deploy the agent on an inbound number (today it is "phone-Outbound" for testing).
- Call timing and cost per call by `call_id` are not passed, so the dashboard shows "—" for answered-within-5-minutes and "Set your inputs" for cost.
