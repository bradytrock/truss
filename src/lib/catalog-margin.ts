import type { CatalogItem, CompanySettings } from "@/lib/types";

export const MAX_MARGIN_PERCENT = 1000;

export type CatalogItemDraft = Omit<CatalogItem, "id" | "marginPercent" | "description"> & {
  id?: string;
  marginPercent?: number;
  description?: string;
};

/** Product text that copies onto a new estimate or template line. Empty when none is set. */
export function catalogItemDescription(item: Pick<CatalogItem, "description"> | { description?: string | null }) {
  return String(item.description ?? "").trim();
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function clampMarginPercent(value: number | null | undefined) {
  if (!Number.isFinite(value) || (value ?? 0) < 0) return 0;
  return Math.min(MAX_MARGIN_PERCENT, Math.round((value as number) * 100) / 100);
}

export function fillCatalogItem(item: CatalogItemDraft & { id: string }): CatalogItem {
  return {
    ...item,
    description: item.description?.trim() ?? "",
    marginPercent: clampMarginPercent(item.marginPercent),
  };
}

/** Item margin, raised to the company floor. Zero on both sides leaves the unit cost unchanged. */
export function effectiveCatalogMargin(
  itemMargin: number | null | undefined,
  minimumMargin: number | null | undefined,
) {
  return Math.max(clampMarginPercent(itemMargin), clampMarginPercent(minimumMargin));
}

export function catalogSellUnitPrice(unitCost: number, marginPercent: number) {
  const cost = Number.isFinite(unitCost) ? Math.max(0, unitCost) : 0;
  return roundMoney(cost * (1 + clampMarginPercent(marginPercent) / 100));
}

export function catalogProposalUnitPrice(
  item: Pick<CatalogItem, "unitCost" | "marginPercent">,
  company: Pick<CompanySettings, "minimumMarginPercent"> | null | undefined,
) {
  return catalogSellUnitPrice(
    item.unitCost,
    effectiveCatalogMargin(item.marginPercent, company?.minimumMarginPercent),
  );
}

export function formatMarginPercent(value: number) {
  const n = clampMarginPercent(value);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${text}%`;
}
