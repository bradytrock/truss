import { cardUrl } from "@/lib/card";
import type { MarketingMergeContext } from "@/lib/marketing/types";
import type { CompanySettings, Contact, Job, StaffMember } from "@/lib/types";

export function emptyMarketingMerge(): MarketingMergeContext {
  return {
    companyName: "Your company",
    companyPhone: "",
    companyEmail: "",
    companyWebsite: "",
    companyLicense: "",
    companyLogoUrl: "",
    staffName: "",
    staffTitle: "",
    staffPhone: "",
    staffEmail: "",
    staffCardUrl: "",
    jobName: "",
    jobCode: "",
    jobAddress: "",
    jobCity: "",
    jobScope: "roofing project",
    contactName: "",
    contactPhone: "",
    partnerName: "",
    partnerTitle: "",
    reviewUrl: "",
    portalHint: "Share your client portal link to send a referral.",
  };
}

export function buildMarketingMerge(input: {
  company: CompanySettings;
  staff?: StaffMember | null;
  job?: Job | null;
  contact?: Contact | null;
  partner?: Contact | null;
  reviewUrl?: string;
  origin?: string;
}): MarketingMergeContext {
  const { company, staff, job, contact, partner } = input;
  const address = job
    ? [job.street, job.city, job.state, job.postalCode].filter(Boolean).join(", ") || job.location
    : "";
  const card =
    company.slug && staff?.cardSlug
      ? cardUrl(company.slug, staff.cardSlug, input.origin || "")
      : "";

  return {
    companyName: company.name || "Your company",
    companyPhone: company.phone || "",
    companyEmail: company.email || "",
    companyWebsite: company.website || "",
    companyLicense: company.licenseNumber || "",
    companyLogoUrl: company.cardLogoUrl || company.logoUrl || "",
    staffName: staff?.name || "",
    staffTitle: staff?.title || "",
    staffPhone: staff?.phone || company.phone || "",
    staffEmail: staff?.email || company.email || "",
    staffCardUrl: card,
    jobName: job?.name || "",
    jobCode: job?.code || "",
    jobAddress: address,
    jobCity: job?.city || "",
    jobScope: job?.projectType ? String(job.projectType).replaceAll("_", " ") : "roofing project",
    contactName: contact?.name || "",
    contactPhone: contact?.phone || "",
    partnerName: partner?.name || "",
    partnerTitle: partner?.title || "Realtor",
    reviewUrl: input.reviewUrl || "",
    portalHint: "Share your client portal link to send a referral.",
  };
}

export function applyMarketingMerge(template: string, ctx: MarketingMergeContext) {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const value = ctx[key as keyof MarketingMergeContext];
      return value?.trim() ? value : "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
