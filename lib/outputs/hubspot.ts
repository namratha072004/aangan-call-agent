import { OutputResult, skipped } from "./result";

const BASE = "https://api.hubapi.com";
const h = () => ({ Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, "content-type": "application/json" });

// Contact + deal, only for NEW qualified callers. An existing contact (same phone) is left alone.
export async function createLead(args: {
  name: string | null; phone: string | null; locality?: string; summary: string | null; route: string; callUrl: string;
}): Promise<OutputResult> {
  if (!process.env.HUBSPOT_TOKEN) return skipped("HubSpot: HUBSPOT_TOKEN not set");

  // With a number, an existing contact means a repeat caller: leave it alone. Without one (some voice
  // platforms do not pass caller ID), the lead is still created so it is not lost; the call_id prevents duplicates.
  if (args.phone) {
    const search = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
      method: "POST", headers: h(),
      body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: args.phone }] }], limit: 1 }),
    });
    const found = await search.json();
    if (!search.ok) throw new Error(`HubSpot search: ${found?.message ?? search.status}`);
    if (found.total > 0) return { ok: true, skipped: true, reason: "existing contact, not a new caller", at: new Date().toISOString() };
  }

  const [first, ...rest] = (args.name ?? "").trim().split(/\s+/);
  const contactRes = await fetch(`${BASE}/crm/v3/objects/contacts`, {
    method: "POST", headers: h(),
    body: JSON.stringify({ properties: { firstname: first || "Caller", lastname: rest.join(" "), ...(args.phone ? { phone: args.phone } : {}), city: args.locality ?? "" } }),
  });
  const contact = await contactRes.json();
  if (!contactRes.ok) throw new Error(`HubSpot contact: ${contact?.message ?? contactRes.status}`);

  const dealRes = await fetch(`${BASE}/crm/v3/objects/deals`, {
    method: "POST", headers: h(),
    body: JSON.stringify({
      properties: {
        dealname: `${args.name || "Caller"} · ${args.locality || "Pune"} (phone enquiry)`,
        pipeline: "default", dealstage: "appointmentscheduled",
        description: `${args.route === "qualified_flagged" ? "[Flagged] " : ""}${args.summary ?? ""}\n${args.callUrl}`,
      },
      // 3 = HubSpot-defined deal-to-contact association
      associations: [{ to: { id: contact.id }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }],
    }),
  });
  const deal = await dealRes.json();
  if (!dealRes.ok) throw new Error(`HubSpot deal: ${deal?.message ?? dealRes.status}`);
  return { ok: true, contact_id: contact.id, deal_id: deal.id, at: new Date().toISOString() };
}
