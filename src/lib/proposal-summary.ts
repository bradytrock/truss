import {
  cheapestOptionKey,
  isGbbEstimate,
  listEstimateOptions,
  optionHighlightLabels,
  recommendedOptionKey,
  resolveSelectedPackage,
  scopedEstimateLines,
} from "./estimate-packages";
import { estimateTotals, lineAmount, lineIncluded, toClientFacingProposal, totalsForPackage } from "./estimate-totals";
import { proposalLineSummary } from "./line-format";
import type { Estimate, EstimateLine } from "./types";

export type ProposalSummaryLine = {
  label: string;
  amount: number | null;
};

export type ProposalOptionSummary = {
  name: string;
  total: number;
  selected: boolean;
  recommended: boolean;
  highlights: string[];
  delta: number | null;
  vs: string | null;
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
  options: ProposalOptionSummary[];
} {
  const client = toClientFacingProposal(estimate, lines);
  const visible = scopedEstimateLines(client.estimate, client.lines);
  const hideLinePrices = Boolean(client.estimate.hideLinePrices);
  const listed = listEstimateOptions(client.lines);
  const selected = resolveSelectedPackage(client.estimate, client.lines);
  const recommended = recommendedOptionKey(listed);
  const totalFor = (key: string) => totalsForPackage(client.estimate, client.lines, key).total;
  const baseline = cheapestOptionKey(listed, totalFor);
  const baselineName = listed.find((item) => item.key === baseline)?.name ?? null;
  const options = isGbbEstimate(client.estimate)
    ? listed.map((option) => {
        const total = totalFor(option.key);
        const delta = baseline && option.key !== baseline ? total - totalFor(baseline) : null;
        return {
          name: option.name,
          total,
          selected: option.key === selected,
          recommended: option.key === recommended,
          highlights: optionHighlightLabels(client.lines, option.key),
          delta: delta != null && delta > 0 ? delta : null,
          vs: delta != null && delta > 0 ? baselineName : null,
        };
      })
    : [];
  return {
    hideLinePrices,
    total: estimateTotals(client.estimate, visible).total,
    options,
    lines: visible.filter(lineIncluded).map((line) => ({
      label: proposalLineSummary(line),
      amount: hideLinePrices ? null : lineAmount(line),
    })),
  };
}
