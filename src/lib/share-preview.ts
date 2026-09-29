import { formatJobSite } from "@/lib/leads";

/** Names substituted when a company name was not actually stored. */
const PLACEHOLDER_COMPANY = new Set(["contractor", "your contractor"]);

const FALLBACK_DESCRIPTION = "Review and sign your estimate.";

/** Company name safe to show on a texted link preview. Empty when it is missing. */
export function sharePreviewCompanyName(companyName: string | null | undefined) {
  const company = (companyName ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  if (!company || PLACEHOLDER_COMPANY.has(company.toLowerCase())) return "";
  return company;
}

/**
 * Title iMessage and other link unfurlers show for a shared estimate.
 * Example: "Your Estimate from T-Rock Roofing".
 */
export function estimateSharePreviewTitle(companyName: string | null | undefined) {
  const company = sharePreviewCompanyName(companyName);
  return company ? `Your Estimate from ${company}` : "Your Estimate";
}

export type EstimateSharePreviewSource = {
  companyName?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

/**
 * Title and description for the public estimate link.
 * The title names the company. The description is the property address,
 * so the card is not the app name.
 */
export function estimateSharePreview(input: EstimateSharePreviewSource) {
  const company = sharePreviewCompanyName(input.companyName);
  const address = formatJobSite({
    street: input.street ?? "",
    city: input.city ?? "",
    state: input.state ?? "",
    postalCode: input.postalCode ?? "",
  });
  return {
    title: estimateSharePreviewTitle(company),
    description: address || FALLBACK_DESCRIPTION,
    siteName: company,
  };
}
