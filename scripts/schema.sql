-- One row per call. Upserted on every /api/qualify request for that call_id.
CREATE TABLE IF NOT EXISTS calls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id             text UNIQUE NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  call_started_at     timestamptz NOT NULL DEFAULT now(),
  answered_at         timestamptz,
  answered_within_5m  boolean,
  after_hours         boolean NOT NULL DEFAULT false,
  is_test             boolean NOT NULL DEFAULT false,
  stage               text,
  caller_name         text,
  caller_phone        text,
  call_type           text,
  language            text,
  fields              jsonb,
  criteria            jsonb,
  discovery           jsonb,
  route               text,
  close_reason        text,
  next_question       text,
  priority            text,
  flags               text[] NOT NULL DEFAULT '{}',
  urgent              boolean NOT NULL DEFAULT false,
  summary             text,
  transcript          jsonb,
  pricing_asked_count int NOT NULL DEFAULT 0,
  pricing_disclosed   boolean NOT NULL DEFAULT false,
  booking             jsonb,
  slot_start          timestamptz,
  outputs             jsonb NOT NULL DEFAULT '{}',
  duration_sec        int,
  gemini_tokens_in    int NOT NULL DEFAULT 0,
  gemini_tokens_out   int NOT NULL DEFAULT 0,
  cost_inr            numeric,
  picked_up_at        timestamptz,
  picked_up_by        text,
  resolved_at         timestamptz
);
CREATE INDEX IF NOT EXISTS calls_started_idx ON calls (call_started_at DESC);
CREATE INDEX IF NOT EXISTS calls_route_idx ON calls (route);

-- Nikhil's inputs for the value estimate (conversion rate, average project value).
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
