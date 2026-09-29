/** Names substituted when a company name was not actually stored. */
const PLACEHOLDER_COMPANY = new Set(["contractor", "your contractor"]);

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
