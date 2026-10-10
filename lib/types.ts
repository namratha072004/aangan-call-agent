export type Status = "pass" | "unclear" | "fail" | "tight" | "not_shared";
export type Route = "qualified" | "qualified_flagged" | "ask_question" | "close" | "escalate_human" | "non_lead" | "dropped";
export type CriterionKey = "real_project" | "service_area" | "timeline" | "budget" | "decision_maker";

export interface Turn { role: "caller" | "agent"; text: string }

// What Vaani sends mid-call. Only call_id is required.
export interface QualifyRequest {
  call_id: string;
  stage?: "progress" | "final";
  caller?: { name?: string; phone?: string };
  fields?: {
    property_type?: string; // home or office
    locality?: string;
    scope?: string;
    completion_date?: string;
    decision_maker?: string;
    budget?: string;
    [k: string]: unknown;
  };
  confirmed?: string[]; // criterion keys the caller confirmed on read-back
  questions_asked?: string[]; // criterion keys the agent already asked one follow-up on
  transcript?: Turn[] | string;
  call_started_at?: string; // when the phone started ringing (ISO)
  answered_at?: string; // when the agent picked up (ISO)
  duration_sec?: number;
  vaani_cost_inr?: number; // if Vaani reports cost per call, it is used directly
  book_slot?: string; // ISO start of the slot the caller chose
  attendee_email?: string;
  is_test?: boolean;
  language?: string;
  // build_config.md §5 contract names (accepted as aliases)
  caller_number?: string;
  fields_so_far?: QualifyRequest["fields"];
  caller_words?: Turn[] | string;
}

export interface Classification {
  call_type: "new_enquiry" | "existing_client" | "non_lead" | "dropped";
  language: string;
  criteria: {
    real_project: { status: Status; evidence: string };
    service_area: { status: Status; evidence: string; locality?: string };
    timeline: { status: Status; evidence: string; start_weeks: number | null; weeks_to_finish: number | null };
    budget: {
      status: Status; evidence: string; amount_stated: number | null;
      scope_for_budget?: { rooms: number | null; area_sqft: number | null; kind: string };
    };
    decision_maker: { status: Status; evidence: string };
  };
  route: Route;
  close_reason: string | null;
  next_question: string | null;
  priority: "P1" | "P2" | "P3" | null;
  discovery: Record<string, unknown>;
  flags: string[];
  pricing_asked_count: number;
  pricing_disclosed: boolean;
  summary: string;
  next_step: string;
}
