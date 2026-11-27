import { catalogProposalUnitPrice } from "@/lib/catalog-margin";
import { acceptedAmountForJob, roundMoney } from "@/lib/estimate-totals";
import type { CatalogItem, CompanySettings, Estimate, EstimateLine, JobMarket } from "@/lib/types";

export const CHANGE_ORDER_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "void",
] as const;

export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number];

export const CHANGE_ORDER_STATUS_LABELS: Record<ChangeOrderStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Signed",
  declined: "Declined",
  void: "Void",
};

export type ChangeOrder = {
  id: string;
  number: string;
  jobId: string;
  estimateId: string;
  opportunityId: string | null;
  clientId: string | null;
  reason: string;
  notes: string;
  status: ChangeOrderStatus;
  /** Tax percent copied from the signed estimate. Residential stays 0. */
  taxRate: number;
  /** Original signed contract, before any change order. */
  baseTotal: number;
  shareToken: string;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  signatureName: string;
  signatureImage: string;
  invoiceId: string | null;
  createdBy: string;
  createdAt: string;
};

export type ChangeOrderLine = {
  id: string;
  changeOrderId: string;
  catalogItemId: string | null;
  title: string;
  description: string;
  quantity: number;
  unit: string;
  /** Homeowner price. Negative is a credit. */
  unitCost: number;
  taxable: boolean;
  sortOrder: number;
};

export function parseChangeOrderStatus(value: unknown): ChangeOrderStatus {
  return CHANGE_ORDER_STATUSES.includes(value as ChangeOrderStatus)
    ? (value as ChangeOrderStatus)
    : "draft";
}

export function changeOrderEditable(status: ChangeOrderStatus) {
  return status === "draft";
}

export function changeOrderSignable(status: ChangeOrderStatus) {
  return status === "draft" || status === "sent" || status === "viewed";
}

export function linesForChangeOrder(lines: ChangeOrderLine[], changeOrderId: string) {
  return lines
    .filter((line) => line.changeOrderId === changeOrderId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

export function changeOrderLineAmount(line: Pick<ChangeOrderLine, "quantity" | "unitCost">) {
  return roundMoney(line.quantity * line.unitCost);
}

export function changeOrderTotals(
  order: Pick<ChangeOrder, "taxRate">,
  lines: Array<Pick<ChangeOrderLine, "quantity" | "unitCost" | "taxable">>,
) {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + changeOrderLineAmount(line), 0));
  const taxable = roundMoney(
    lines.filter((line) => line.taxable).reduce((sum, line) => sum + changeOrderLineAmount(line), 0),
  );
  const tax = roundMoney(taxable * ((Number(order.taxRate) || 0) / 100));
  return {
    subtotal,
    taxable,
    tax,
    total: roundMoney(subtotal + tax),
  };
}

export function acceptedChangeOrders(jobId: string, orders: ChangeOrder[]) {
  return orders.filter((order) => order.jobId === jobId && order.status === "accepted");
}

export function acceptedChangeOrderDelta(jobId: string, orders: ChangeOrder[], lines: ChangeOrderLine[]) {
  return roundMoney(
    acceptedChangeOrders(jobId, orders).reduce(
      (sum, order) => sum + changeOrderTotals(order, linesForChangeOrder(lines, order.id)).total,
      0,
    ),
  );
}

/** Original signed total plus every accepted change order. Declined and void stay off. */
export function revisedContractTotal(jobId: string, orders: ChangeOrder[], lines: ChangeOrderLine[]) {
  const related = orders.filter((order) => order.jobId === jobId);
  const base = related.find((order) => order.baseTotal > 0)?.baseTotal ?? 0;
  return roundMoney(base + acceptedChangeOrderDelta(jobId, related, lines));
}

/**
 * What the job card should show. The signed proposal stays the base. Accepted
 * change orders add to it. Once that sum is already on the job, the saved
 * contract is the same number.
 */
export function soldWithChangeOrders(
  job: { id: string; opportunityId?: string | null; contractValue?: number | null; market?: JobMarket | "" | null },
  estimates: Estimate[],
  estimateLines: EstimateLine[],
  orders: ChangeOrder[],
  lines: ChangeOrderLine[],
) {
  return displayContractAmount({
    signedTotal: acceptedAmountForJob(job, estimates, estimateLines, job.market),
    contractValue: Number(job.contractValue) || 0,
    jobId: job.id,
    orders,
    lines,
  });
}

export function displayContractAmount(input: {
  signedTotal: number;
  contractValue: number;
  jobId: string;
  orders: ChangeOrder[];
  lines: ChangeOrderLine[];
}) {
  const delta = acceptedChangeOrderDelta(input.jobId, input.orders, input.lines);
  if (input.signedTotal > 0) return roundMoney(input.signedTotal + delta);
  const contract = Number(input.contractValue) || 0;
  return contract > 0 ? contract : 0;
}

export function changeOrderContractFigures(
  order: ChangeOrder,
  orders: ChangeOrder[],
  lines: ChangeOrderLine[],
) {
  const others = roundMoney(
    acceptedChangeOrders(order.jobId, orders)
      .filter((item) => item.id !== order.id)
      .reduce(
        (sum, item) => sum + changeOrderTotals(item, linesForChangeOrder(lines, item.id)).total,
        0,
      ),
  );
  const delta = changeOrderTotals(order, linesForChangeOrder(lines, order.id)).total;
  const before = roundMoney(order.baseTotal + others);
  const applies = order.status !== "declined" && order.status !== "void";
  return {
    before,
    delta,
    after: applies ? roundMoney(before + delta) : before,
  };
}

export function nextChangeOrderNumber(existing: string[]) {
  let max = 0;
  for (const number of existing) {
    const match = /^CO-(\d+)$/i.exec(number.trim());
    if (!match) continue;
    max = Math.max(max, Number(match[1]));
  }
  return `CO-${max + 1}`;
}

export function signedEstimateForJob(
  job: { id: string; opportunityId?: string | null },
  estimates: Estimate[],
) {
  const related = estimates.filter(
    (estimate) =>
      !estimate.archivedAt &&
      estimate.status === "accepted" &&
      (estimate.jobId === job.id ||
        Boolean(job.opportunityId && estimate.opportunityId === job.opportunityId)),
  );
  if (related.length === 0) return null;
  return [...related].sort((a, b) => (b.acceptedAt ?? "").localeCompare(a.acceptedAt ?? ""))[0] ?? null;
}

export function baseTotalForJob(
  job: { id: string; opportunityId?: string | null; contractValue?: number | null; market?: JobMarket | "" | null },
  estimates: Estimate[],
  estimateLines: EstimateLine[],
) {
  const signed = acceptedAmountForJob(job, estimates, estimateLines, job.market);
  if (signed > 0) return signed;
  const contract = Number(job.contractValue) || 0;
  return contract > 0 ? contract : 0;
}

export function invoiceLinesFromChangeOrder(order: ChangeOrder, lines: ChangeOrderLine[]) {
  const scoped = linesForChangeOrder(lines, order.id);
  const totals = changeOrderTotals(order, scoped);
  const out = scoped.map((line, index) => ({
    description: [line.title.trim(), line.description.trim()].filter(Boolean).join(" — ") || "Change",
    quantity: line.quantity,
    unit: line.unit,
    unitCost: line.unitCost,
    sortOrder: index,
  }));
  if (totals.tax !== 0) {
    out.push({
      description: `Tax (${order.taxRate}%)`,
      quantity: 1,
      unit: "",
      unitCost: totals.tax,
      sortOrder: out.length,
    });
  }
  return out;
}

export function changeOrderSellPrice(
  item: Pick<CatalogItem, "unitCost" | "marginPercent">,
  company: Pick<CompanySettings, "minimumMarginPercent"> | null | undefined,
) {
  return catalogProposalUnitPrice(item, company);
}

export function acceptedChangeOrderCost(
  jobId: string,
  orders: ChangeOrder[],
  lines: ChangeOrderLine[],
  catalog: Array<Pick<CatalogItem, "id" | "unitCost">>,
) {
  let sum = 0;
  for (const order of acceptedChangeOrders(jobId, orders)) {
    for (const line of linesForChangeOrder(lines, order.id)) {
      const item = line.catalogItemId
        ? catalog.find((entry) => entry.id === line.catalogItemId)
        : undefined;
      sum += item
        ? roundMoney(Math.max(0, item.unitCost) * line.quantity)
        : changeOrderLineAmount(line);
    }
  }
  return roundMoney(sum);
}
