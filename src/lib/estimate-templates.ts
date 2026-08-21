import { DEFAULT_ESTIMATE_TERMS, estimateTotals, fillEstimateLine, linesForEstimate } from "@/lib/estimate-totals";
import { billingEstimate, defaultTaxRateForMarket, parseMarket } from "@/lib/market";
import type {
  Estimate,
  EstimateLine,
  EstimateTemplate,
  EstimateTemplateLine,
  JobMarket,
} from "@/lib/types";

export const ESTIMATE_TEMPLATES_SQL = "supabase/migrations/20260821190000_estimate_templates.sql";
export const ESTIMATE_TEMPLATES_SQL_RAW =
  "https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821190000_estimate_templates.sql";

export function isMissingEstimateTemplates(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("Could not find the") ||
    message.includes("estimate_templates") ||
    message.includes("estimate_template_lines")
  );
}

export function missingEstimateTemplatesMessage() {
  return `Saved in this browser. Run ${ESTIMATE_TEMPLATES_SQL} in the SQL editor (or a fresh bootstrap) so company templates persist.`;
}

export function fillEstimateTemplate(
  template: Omit<EstimateTemplate, "description" | "intro" | "terms" | "notes" | "taxRate" | "discountKind" | "discountValue" | "depositKind" | "depositValue" | "updatedAt"> &
    Partial<EstimateTemplate>,
): EstimateTemplate {
  const market = parseMarket(template.market);
  return {
    ...template,
    description: template.description ?? "",
    market,
    intro: template.intro ?? "",
    terms: template.terms ?? DEFAULT_ESTIMATE_TERMS,
    notes: template.notes ?? "",
    taxRate: template.taxRate ?? defaultTaxRateForMarket(market),
    discountKind: template.discountKind ?? "percent",
    discountValue: template.discountValue ?? 0,
    depositKind: template.depositKind ?? "percent",
    depositValue: template.depositValue ?? 0,
    updatedAt: template.updatedAt ?? template.createdAt,
  };
}

export function fillEstimateTemplateLine(
  line: Omit<EstimateTemplateLine, "title" | "groupName" | "optional" | "selected" | "taxable"> &
    Partial<EstimateTemplateLine>,
): EstimateTemplateLine {
  const filled = fillEstimateLine({ ...line, estimateId: line.templateId });
  const { estimateId: _estimateId, ...rest } = filled;
  return { ...rest, templateId: line.templateId };
}

export function linesForTemplate(lines: EstimateTemplateLine[], templateId: string) {
  return lines
    .filter((line) => line.templateId === templateId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function amountForTemplate(
  template: Pick<EstimateTemplate, "taxRate" | "discountKind" | "discountValue" | "depositKind" | "depositValue" | "market">,
  lines: EstimateTemplateLine[],
) {
  const billed = billingEstimate(
    {
      taxRate: template.taxRate,
      discountKind: template.discountKind,
      discountValue: template.discountValue,
      depositKind: template.depositKind,
      depositValue: template.depositValue,
    },
    template.market,
  );
  return estimateTotals(billed, lines).total;
}

export function templateFromEstimate(
  estimate: Estimate,
  lines: EstimateLine[],
  extras: { id: string; name: string; market: JobMarket },
) {
  const now = new Date().toISOString();
  const template = fillEstimateTemplate({
    id: extras.id,
    name: extras.name.trim() || estimate.name,
    description: "",
    market: extras.market,
    intro: estimate.intro,
    terms: estimate.terms,
    notes: estimate.notes,
    taxRate: estimate.taxRate,
    discountKind: estimate.discountKind,
    discountValue: estimate.discountValue,
    depositKind: estimate.depositKind,
    depositValue: estimate.depositValue,
    createdAt: now,
    updatedAt: now,
  });
  const templateLines = linesForEstimate(lines, estimate.id).map((line, index) =>
    fillEstimateTemplateLine({
      ...line,
      id: crypto.randomUUID(),
      templateId: template.id,
      sortOrder: index + 1,
    }),
  );
  return { template, lines: templateLines };
}

export function estimateFieldsFromTemplate(template: EstimateTemplate) {
  return {
    intro: template.intro,
    terms: template.terms,
    notes: template.notes,
    taxRate: defaultTaxRateForMarket(template.market) === 0 ? 0 : template.taxRate,
    discountKind: template.discountKind,
    discountValue: template.discountValue,
    depositKind: template.depositKind,
    depositValue: template.depositValue,
    market: template.market,
  };
}

export function estimateLinesFromTemplate(
  templateId: string,
  estimateId: string,
  lines: EstimateTemplateLine[],
): EstimateLine[] {
  return linesForTemplate(lines, templateId).map((line, index) =>
    fillEstimateLine({
      ...line,
      id: crypto.randomUUID(),
      estimateId,
      sortOrder: index + 1,
    }),
  );
}
