import Link from "next/link";

export const ROUTE_LABEL: Record<string, string> = {
  qualified: "Qualified", qualified_flagged: "Flagged", close: "Closed", non_lead: "Closed · not a lead",
  dropped: "Closed · dropped", ask_question: "In progress", escalate_human: "Escalated",
};

export function RoutePill({ route }: { route: string | null }) {
  const r = route ?? "ask_question";
  return <span className={`route r-${r}`}>{ROUTE_LABEL[r] ?? r}</span>;
}

export function Def({ children }: { children: React.ReactNode }) {
  return (
    <span className="def" tabIndex={0} aria-label="Definition">
      i<span className="tip" role="tooltip">{children}</span>
    </span>
  );
}

export function Toggle({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="pills">
      {items.map((i) => (
        <Link key={i.key} href={i.href} className="pill-btn" aria-current={i.key === current ? "true" : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
