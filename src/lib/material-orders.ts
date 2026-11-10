import type {
  CatalogItem,
  MaterialOrder,
  MaterialOrderFulfillment,
  MaterialOrderLine,
  MaterialOrderStatus,
  MaterialOrderWindow,
} from "@/lib/types";
import { lineAmount, sumLines } from "@/lib/money";

export function parseMaterialOrderStatus(value: unknown): MaterialOrderStatus {
  return value === "sent" || value === "confirmed" || value === "delivered" ? value : "draft";
}

export function parseMaterialOrderFulfillment(value: unknown): MaterialOrderFulfillment {
  return value === "pickup" ? "pickup" : "delivery";
}

export function parseMaterialOrderWindow(value: unknown): MaterialOrderWindow {
  return value === "afternoon" || value === "anytime" ? value : "morning";
}

export function parseQuickNotes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function serializeQuickNotes(notes: string[]) {
  return notes.map((item) => item.trim()).filter(Boolean).join("\n");
}

export type MaterialOrderDraft = Partial<MaterialOrder> &
  Pick<MaterialOrder, "id" | "number" | "jobId">;

export type MaterialOrderLineDraft = Partial<MaterialOrderLine> &
  Pick<MaterialOrderLine, "id" | "materialOrderId" | "name">;

export function fillMaterialOrder(order: MaterialOrderDraft): MaterialOrder {
  return {
    id: order.id,
    number: order.number,
    jobId: order.jobId,
    vendor: order.vendor ?? "",
    notes: order.notes ?? "",
    neededBy: order.neededBy ?? null,
    createdBy: order.createdBy ?? "",
    createdAt: order.createdAt ?? new Date().toISOString(),
    archivedAt: order.archivedAt ?? null,
    status: parseMaterialOrderStatus(order.status),
    fulfillment: parseMaterialOrderFulfillment(order.fulfillment),
    window: parseMaterialOrderWindow(order.window),
    onCalendar: order.onCalendar !== false,
    quickNotes: parseQuickNotes(order.quickNotes),
    sentAt: order.sentAt ?? null,
    branch: order.branch ?? "",
    accountNumber: order.accountNumber ?? "",
  };
}

export function fillMaterialOrderLine(line: MaterialOrderLineDraft): MaterialOrderLine {
  return {
    id: line.id,
    materialOrderId: line.materialOrderId,
    catalogItemId: line.catalogItemId ?? null,
    name: line.name,
    quantity: Number.isFinite(line.quantity) ? Number(line.quantity) : 1,
    unit: line.unit?.trim() || "EA",
    unitCost: Number.isFinite(line.unitCost) ? Number(line.unitCost) : 0,
    sortOrder: line.sortOrder ?? 0,
  };
}

export function materialOrderLinesFor(orderId: string, lines: MaterialOrderLine[]) {
  return [...lines]
    .filter((line) => line.materialOrderId === orderId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

export function materialOrderTotal(lines: MaterialOrderLine[]) {
  return sumLines(lines);
}

export function materialOrderLineAmount(line: MaterialOrderLine) {
  return lineAmount(line);
}

export function lineFromCatalogItem(
  orderId: string,
  item: CatalogItem,
  sortOrder: number,
): MaterialOrderLine {
  return fillMaterialOrderLine({
    id: crypto.randomUUID(),
    materialOrderId: orderId,
    catalogItemId: item.id,
    name: item.name,
    quantity: 1,
    unit: item.unit || "EA",
    unitCost: item.unitCost,
    sortOrder,
  });
}
