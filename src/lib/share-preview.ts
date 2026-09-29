import { formatJobSite } from "@/lib/leads";

/** Names that are placeholders, not something a homeowner would recognize in a preview. */
const GENERIC_TITLES = new Set(["proposal", "estimate", "untitled", "untitled proposal"]);

export type EstimateSharePreviewSource = {
  company?: { name?: string | null } | null;
  estimate: {
    name?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  };
};

/**
 * Title and description for the public estimate link.
 * Texts and emails unfurl from these strings, so the title is the property
 * address rather than the app name.
 */
export function estimateSharePreview(input: EstimateSharePreviewSource) {
  const address = formatJobSite({
    street: input.estimate.street ?? "",
    city: input.estimate.city ?? "",
    state: input.estimate.state ?? "",
    postalCode: input.estimate.postalCode ?? "",
  });
  const name = input.estimate.name?.trim() ?? "";
  const company = input.company?.name?.trim() ?? "";
  const named = name && !GENERIC_TITLES.has(name.toLowerCase()) ? name : "";
  const fromCompany = company ? `Proposal from ${company}` : "";
  const title = address || named || fromCompany || "Proposal";
  const description = address ? fromCompany || named || "Proposal" : fromCompany || "Proposal";
  return {
    title,
    description,
    siteName: company,
  };
}
