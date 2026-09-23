import { scopedEstimateLines } from "./estimate-packages";
import { estimateTotals, lineAmount, lineIncluded, toClientFacingProposal } from "./estimate-totals";
import { proposalLineSummary } from "./line-format";
import type { Estimate, EstimateLine } from "./types";

export type ProposalSummaryLine = {
  label: string;
  amount: number | null;
};

export function proposalShareSummary(
  estimate: Pick<
    Estimate,
    | "taxRate"
    | "discountKind"
    | "discountValue"
    | "depositKind"
    | "depositValue"
    | "hideLinePrices"
  > &
    Partial<Pick<Estimate, "packageMode" | "selectedPackage" | "subtotalOverride" | "marginPercent">>,
  lines: Array<
    Pick<
      EstimateLine,
      "title" | "description" | "quantity" | "unit" | "unitCost" | "optional" | "selected" | "taxable"
    > &
      Partial<Pick<EstimateLine, "package">>
  >,
): {
  lines: ProposalSummaryLine[];
  total: number;
  hideLinePrices: boolean;
} {
  const client = toClientFacingProposal(estimate, lines);
  const visible = scopedEstimateLines(client.estimate, client.lines);
  const hideLinePrices = Boolean(client.estimate.hideLinePrices);
  return {
    hideLinePrices,
    total: estimateTotals(client.estimate, visible).total,
    lines: visible.filter(lineIncluded).map((line) => ({
      label: proposalLineSummary(line),
      amount: hideLinePrices ? null : lineAmount(line),
    })),
  };
}
