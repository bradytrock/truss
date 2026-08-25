import { DEFAULT_ESTIMATE_TERMS } from "@/lib/estimate-totals";

export { DEFAULT_ESTIMATE_TERMS };

export const DEFAULT_INVOICE_TERMS =
  "Payment is due on the date shown. Any deposit on this invoice is due before remaining work continues. Past-due balances may pause the job until paid.";

function firstCopiedTerms(...candidates: Array<string | null | undefined>) {
  for (const value of candidates) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function resolveEstimateTerms(input: {
  explicit?: string | null;
  templateTerms?: string | null;
  companyDefault?: string | null;
}) {
  return (
    firstCopiedTerms(input.explicit, input.templateTerms, input.companyDefault) ?? DEFAULT_ESTIMATE_TERMS
  );
}

export function resolveInvoiceTerms(input: {
  explicit?: string | null;
  companyDefault?: string | null;
}) {
  return firstCopiedTerms(input.explicit, input.companyDefault) ?? DEFAULT_INVOICE_TERMS;
}
