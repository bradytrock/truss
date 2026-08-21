import type { Estimate, JobMarket, ProjectType } from "@/lib/types";
import { JOB_MARKETS } from "@/lib/types";

export const DEFAULT_COMMERCIAL_TAX_RATE = 8.31;

const COMMERCIAL_PROJECT_TYPES = new Set<ProjectType>([
  "commercial",
  "multifamily",
  "healthcare",
  "education",
  "industrial",
  "hospitality",
  "civic",
  "tenant_improvement",
]);

export function isJobMarket(value: string | null | undefined): value is JobMarket {
  return JOB_MARKETS.includes(value as JobMarket);
}

export function marketFromProjectType(type?: ProjectType | "" | null): JobMarket {
  if (type && COMMERCIAL_PROJECT_TYPES.has(type)) return "commercial";
  return "residential";
}

export function parseMarket(
  value: string | null | undefined,
  projectType?: ProjectType | "" | null,
): JobMarket {
  if (isJobMarket(value)) return value;
  return marketFromProjectType(projectType);
}

export function workMarket(
  job?: { market?: JobMarket | ""; projectType?: ProjectType | "" } | null,
  opportunity?: { market?: JobMarket | ""; projectType?: ProjectType | "" } | null,
): JobMarket {
  if (isJobMarket(job?.market)) return job.market;
  if (isJobMarket(opportunity?.market)) return opportunity.market;
  return marketFromProjectType(job?.projectType || opportunity?.projectType);
}

export function isResidentialMarket(market?: JobMarket | "" | null) {
  return market !== "commercial";
}

export function defaultTaxRateForMarket(market?: JobMarket | "" | null) {
  return isResidentialMarket(market) ? 0 : DEFAULT_COMMERCIAL_TAX_RATE;
}

export function projectTypeForMarket(market: JobMarket): ProjectType {
  return market === "commercial" ? "commercial" : "restoration";
}

export function billingEstimate<T extends Pick<Estimate, "taxRate">>(estimate: T, market?: JobMarket | "" | null): T {
  if (!isResidentialMarket(market)) return estimate;
  if (estimate.taxRate === 0) return estimate;
  return { ...estimate, taxRate: 0 };
}
