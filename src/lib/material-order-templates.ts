import type {
  CatalogItem,
  MaterialOrder,
  MaterialOrderLine,
  MaterialOrderTemplate,
  MaterialOrderTemplateLine,
} from "@/lib/types";
import { materialOrderLinesFor, materialOrderTotal } from "@/lib/material-orders";
import { lineAmount, sumLines } from "@/lib/money";

export const MATERIAL_ORDER_TEMPLATES_SQL = "supabase/migrations/20260828130000_material_order_templates.sql";

export function isMissingMaterialOrderTemplates(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  const mentionsTable =
    message.includes("material_order_templates") ||
    message.includes("material_order_template_lines") ||
    message.includes("material_order_template");
  return (
    (code === "pgrst205" && mentionsTable) ||
    ((message.includes("schema cache") || message.includes("could not find the")) && mentionsTable)
  );
}

export function missingMaterialOrderTemplatesMessage() {
  return `Saved in this browser. Run ${MATERIAL_ORDER_TEMPLATES_SQL} in the SQL editor (or a fresh bootstrap) so material order templates persist for the office.`;
}

export type MaterialOrderTemplateDraft = Partial<MaterialOrderTemplate> &
  Pick<MaterialOrderTemplate, "id" | "name">;

export type MaterialOrderTemplateLineDraft = Partial<MaterialOrderTemplateLine> &
  Pick<MaterialOrderTemplateLine, "id" | "templateId" | "name">;

export function fillMaterialOrderTemplate(template: MaterialOrderTemplateDraft): MaterialOrderTemplate {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? "",
    vendor: template.vendor ?? "",
    notes: template.notes ?? "",
    createdAt: template.createdAt ?? new Date().toISOString(),
    updatedAt: template.updatedAt ?? template.createdAt ?? new Date().toISOString(),
  };
}

export function fillMaterialOrderTemplateLine(line: MaterialOrderTemplateLineDraft): MaterialOrderTemplateLine {
  return {
    id: line.id,
    templateId: line.templateId,
    catalogItemId: line.catalogItemId ?? null,
    name: line.name,
    quantity: Number.isFinite(line.quantity) ? Number(line.quantity) : 1,
    unit: line.unit?.trim() || "EA",
    unitCost: Number.isFinite(line.unitCost) ? Number(line.unitCost) : 0,
    sortOrder: line.sortOrder ?? 0,
  };
}

export function materialOrderTemplateLinesFor(templateId: string, lines: MaterialOrderTemplateLine[]) {
  return [...lines]
    .filter((line) => line.templateId === templateId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

export function materialOrderTemplateTotal(lines: MaterialOrderTemplateLine[]) {
  return sumLines(lines);
}

export function materialOrderTemplateLineAmount(line: MaterialOrderTemplateLine) {
  return lineAmount(line);
}

export function templateLineFromCatalogItem(
  templateId: string,
  item: CatalogItem,
  sortOrder: number,
): MaterialOrderTemplateLine {
  return fillMaterialOrderTemplateLine({
    id: crypto.randomUUID(),
    templateId,
    catalogItemId: item.id,
    name: item.name,
    quantity: 1,
    unit: item.unit || "EA",
    unitCost: item.unitCost,
    sortOrder,
  });
}

export function templateFromMaterialOrder(
  order: MaterialOrder,
  lines: MaterialOrderLine[],
  extras: { id: string; name: string },
) {
  const now = new Date().toISOString();
  const template = fillMaterialOrderTemplate({
    id: extras.id,
    name: extras.name.trim() || `${order.number} template`,
    description: "",
    vendor: order.vendor,
    notes: order.notes,
    createdAt: now,
    updatedAt: now,
  });
  const templateLines = materialOrderLinesFor(order.id, lines).map((line, index) =>
    fillMaterialOrderTemplateLine({
      id: crypto.randomUUID(),
      templateId: template.id,
      catalogItemId: line.catalogItemId,
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      unitCost: line.unitCost,
      sortOrder: index + 1,
    }),
  );
  return { template, lines: templateLines };
}

export function materialOrderLinesFromTemplate(
  templateId: string,
  orderId: string,
  lines: MaterialOrderTemplateLine[],
) {
  return materialOrderTemplateLinesFor(templateId, lines).map((line, index) => ({
    id: crypto.randomUUID(),
    materialOrderId: orderId,
    catalogItemId: line.catalogItemId,
    name: line.name,
    quantity: line.quantity,
    unit: line.unit,
    unitCost: line.unitCost,
    sortOrder: index + 1,
  }));
}

export function amountForMaterialOrderTemplate(
  templateId: string,
  lines: MaterialOrderTemplateLine[],
) {
  return materialOrderTemplateTotal(materialOrderTemplateLinesFor(templateId, lines));
}

export function amountForMaterialOrder(orderId: string, lines: MaterialOrderLine[]) {
  return materialOrderTotal(materialOrderLinesFor(orderId, lines));
}
