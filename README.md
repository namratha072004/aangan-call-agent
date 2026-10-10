# Aangan Studio: AI inbound call agent

Every incoming call to Aangan Studio is answered by a Vaani Labs voice agent, day or night. Mid-call, the agent asks this backend to judge the lead; Gemini Flash checks Nikhil's five criteria, plain rules pick the route, and the outputs (Neon row, Telegram handoff, Cal.com booking, HubSpot deal) run in parallel. Nikhil and the designers see it all on one dashboard.

| | |
|---|---|
| Live dashboard | https://aangan-call-agent-sandy.vercel.app (user `aangan`, password = `DASHBOARD_PASSWORD` env) |
| Vaani endpoint | `POST https://aangan-call-agent-sandy.vercel.app/api/qualify` with header `x-aangan-secret` |
| Vaani connection steps | [VAANI.md](VAANI.md) |
| Stack | Next.js 16 + TypeScript on Vercel (Singapore), Neon Postgres, Gemini `gemini-3.8-flash`, Telegram, Cal.com, HubSpot |

## How it follows the component map

1. **Trigger**: a phone call. Nothing else starts work.
2. **Vaani** runs the conversation using `context/voice_agent_context.md` and calls `/api/qualify` mid-call (`stage: progress`) and once before hanging up (`stage: final`).
3. **AI judgement 1 of 2**: Vaani conversation. **AI judgement 2 of 2**: Gemini checks the five criteria ([lib/classifier.ts](lib/classifier.ts)). Gemini sees only `classifier_context.md` + `services.md`; a runtime guard refuses to send any ₹ figure.
4. **Routing is plain code** ([lib/routing.ts](lib/routing.ts)), from `classifier_context.md` and `build_config.md`:
   - all pass → `qualified`
   - criteria 1–3 unclear → `ask_question` (one fixed question); still unclear after it → `qualified_flagged`
   - timeline tight / early stage, budget unclear or below floor, decision-maker unclear → `qualified_flagged`
   - criteria 1–3 fail, confirmed by the caller on read-back → `close` with the scripted line for that reason
   - complaint, existing client, asks for a human or Nikhil, abusive → `escalate_human`, urgent
   - vendor / wrong number → `non_lead`; no caller words → `dropped` + `callback_needed`
5. **Outputs, isolated** ([lib/outputs](lib/outputs)): each output is wrapped so a failure is logged and never stops the others or the call.
   - Neon: one row per call (upsert by `call_id`)
   - Telegram: handoff note as soon as a lead qualifies, urgent for escalations, with a **Taken** button
   - Cal.com: offers slots, books the chosen slot during the call
   - HubSpot: contact + deal on `final`, new qualified callers only, never test rows
6. **Review Gate (human only)**: price, commitments, complaints and exceptions stay with designers and Nikhil. The agent never states a price; price questions get the fixed lines from `voice_agent_context.md`.

## Dashboard

- **Nikhil view** (default Last 7 days; Today / 7 / 30 days): calls received + after hours (7pm–10am IST), answered within 5 minutes vs the 48% baseline, qualified leads + rate (qualified + flagged ÷ new enquiries), consultations booked, cost per call + total, value estimate (booked × your conversion rate × your average project value, "Set your inputs" until set). "Needs you": escalations waiting, leads not yet Taken. Calls-by-hour chart and recent calls. Every number has a hover definition.
- **Designer view**: qualified, flagged and escalated calls; each opens answers, summary, the five criteria with evidence, and the transcript.
- Test rows (`is_test`) are excluded unless "Show test calls" is on. Sage and Blush design, works at 375px.

## Test report

| Check | Result |
|---|---|
| 40 sample enquiries replayed (local) | 11 qualified, 20 flagged, 6 closed, 2 escalated, 1 non-lead; `pricing_disclosed` false on 40/40 ([test-report/replay.json](test-report/replay.json)) |
| 40 sample enquiries replayed (live Vercel) | 8 qualified, 24 flagged, 5 closed, 2 escalated, 1 dropped; `pricing_disclosed` false on 40/40 ([test-report/replay-live.txt](test-report/replay-live.txt)) |
| Run-to-run consistency | 11 of 40 routes differ between the two runs, almost all qualified ↔ flagged on a borderline `decision_maker_unclear`. No call moved between "reaches a designer" and "closed" except T18 (180 sq ft pod), which the rubric itself calls unclear. Closes, escalations and pricing never varied |
| Routing rules, every route | 16/16 pass (`npx tsx tests/routing.test.ts`) |
| Budget floor (build_config.md §2) | 8/8 pass: T10 fails, F05/F06/F08/F10 pass (`npx tsx --env-file=.env tests/budget.test.mts`) |
| Output failure isolation | missing keys → each skipped; wrong keys → each fails alone; none blocks another (`npx tsx tests/outputs.test.mts`) |
| Live `/api/qualify` | HTTP 200, `qualified`, P2, `pricing_asked`, `pricing_disclosed: false`, 4–6 s |
| Live Telegram handoff | delivered (message id returned, stored in the call row) |
| Live HubSpot access | service key authorised for contacts and deals (read verified); no seed data written |
| Live Cal.com booking | `/api/qualify` offered 3 slots; booking the first returned `confirmed: true` (Mon 12 Oct, 9:00 IST, test booking) |
| Dashboard | six numbers, test rows excluded, "Set your inputs" shown, no horizontal scroll at 375px |

## Run locally

```bash
npm install
cp .env.example .env   # fill DATABASE_URL, GEMINI_API_KEY, secrets
npm run db:schema
npm run dev
npm run replay         # 40 sample enquiries as test calls
```

## Decisions made in the build

- Gemini `gemini-3.8-flash` (2.5 is closed to new keys); lowest supported thinking level. Replies take 4–6 s, so the agent says a short filler line while waiting.
- `qualified.md` is not sent to Gemini (it holds a ₹ example); `classifier_context.md` already encodes it.
- `pricing.md` and `build_config.md` are never committed or deployed; the budget floor numbers live only in env.
- Timeline never closes a call (`TIMELINE_CLOSE_WEEKS` is Nikhil's call); a low budget is flagged `budget_mismatch`, not closed, while `BUDGET_CLOSE_ENABLED` is off.
- If the classifier fails, the call is escalated for a callback (not urgent) rather than guessed.
- A repeat caller is detected by phone number in Neon (7 days); HubSpot skips them.
- One shared dashboard password; a shared secret header for Vaani; a separate secret for the Telegram webhook.
- Telegram goes to a direct chat with the principal designer (one person); a group can replace it by changing `TELEGRAM_CHAT_ID`.
- Cal.com bookings use a studio inbox (`CALCOM_ATTENDEE_FALLBACK_EMAIL`) because phone callers rarely give an email.

## Not done / to confirm

- **HubSpot is connected** (service key with contacts and deals read/write; access verified live). No test contact or deal was created, per the brief's "no seed data"; the first real new qualified caller creates the first record.
- **Cal.com uses the "30 min meeting" event as a placeholder** (no consultation event or length in the files). Create a "Design consultation" event with the studio's hours (10am–7pm) and set `CALCOM_EVENT_TYPE_ID`.
- **Vaani call timing and cost by `call_id`**: not confirmed. Until then cost per call shows "Set your inputs" and "answered within 5 minutes" uses timing only when Vaani sends it.
- **Gemini varies on borderline decision-maker calls** (qualified ↔ flagged). Both still reach a designer; tightening the decision-maker wording in `classifier_context.md` would steady it.
- **T16 (frustrated new lead) is escalated by Gemini**; the rubric says treat as a new P1 enquiry. Fix by tightening `classifier_context.md`.
- Not built: dropped-call cron alert, re-send of un-Taken leads to the next designer, WhatsApp and web-form intake (future extensions).
- For Nikhil: approve the budget floor values, decide `TIMELINE_CLOSE_WEEKS`, set conversion rate and average project value on the dashboard.
