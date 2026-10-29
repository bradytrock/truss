/**
 * Seed catalog — the one place to add, rename, reorder, or hide a seed
 * (the "Seed" field on New lead, also called the lead source).
 *
 * Add:     append `{ value: "my_key", label: "My Label" }`. The value is what is
 *          stored on the lead; use lowercase snake_case and never change it later.
 * Hide:    add `hidden: true`. Hidden seeds leave every picker (New lead, job
 *          Details, automations, the assistant) but leads that already carry them
 *          keep their label on boards, reports, and Home.
 * Unhide:  remove `hidden: true`.
 * Reorder: pickers list seeds in this order.
 *
 * Do not delete a row once leads have been saved with it — hide it instead, so the
 * stored value still has a label.
 */
export const LEAD_SOURCE_CATALOG = [
  { value: "podium", label: "Podium" },
  { value: "website", label: "Website" },
  { value: "google_ad", label: "Google Ad" },
  { value: "phone", label: "Phone" },
  { value: "angies_list", label: "Angie's List" },
  { value: "realtor", label: "Realtor" },
  { value: "referral", label: "Referral" },
  { value: "sales_team", label: "Sales Team" },
  { value: "text_main_line", label: "Text Main Line" },
  { value: "past_client", label: "Past Client" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "social_media", label: "Social Media" },

  // Older books still store these. Hidden so new leads cannot pick them.
  { value: "google", label: "Google search", hidden: true },
  { value: "facebook", label: "Facebook", hidden: true },
  { value: "instagram", label: "Instagram", hidden: true },
  { value: "yard_sign", label: "Yard sign", hidden: true },
  { value: "truck", label: "Truck / wrap", hidden: true },
  { value: "storm", label: "Storm canvass", hidden: true },
  { value: "insurance", label: "Insurance adjuster", hidden: true },
  { value: "repeat", label: "Repeat customer", hidden: true },
  { value: "neighbor", label: "Neighbor", hidden: true },
  { value: "other", label: "Other", hidden: true },
] as const satisfies readonly LeadSourceEntry[];

export type LeadSourceEntry = {
  value: string;
  label: string;
  hidden?: boolean;
};

/** Every seed value the app knows, hidden ones included. */
export type LeadSource = (typeof LEAD_SOURCE_CATALOG)[number]["value"];

/** Seeds offered in pickers, in catalog order. Hidden seeds are left out. */
export const LEAD_SOURCES: readonly LeadSource[] = LEAD_SOURCE_CATALOG.filter(
  (entry: LeadSourceEntry) => !entry.hidden,
).map((entry) => entry.value);

/** Label for every seed value, hidden ones included, so old leads still read well. */
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = Object.fromEntries(
  LEAD_SOURCE_CATALOG.map((entry) => [entry.value, entry.label]),
) as Record<LeadSource, string>;

export function isLeadSource(value: string | null | undefined): value is LeadSource {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LEAD_SOURCE_LABELS, value);
}

/** True when the seed can still be picked for a new lead. */
export function isPickableLeadSource(value: string | null | undefined): value is LeadSource {
  return typeof value === "string" && (LEAD_SOURCES as readonly string[]).includes(value);
}
