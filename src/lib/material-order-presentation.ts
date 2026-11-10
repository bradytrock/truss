import type { CatalogItem, MaterialOrder, MaterialOrderLine, MaterialOrderWindow } from "@/lib/types";
import { materialOrderLineAmount } from "@/lib/material-orders";

export const MATERIAL_ORDER_QUICK_NOTES = [
  "Ground drop",
  "Call 30 min before",
  "Keep driveway clear",
] as const;

export const MATERIAL_SECTIONS = [
  "Shingles",
  "Underlayment",
  "Ventilation",
  "Flashing & metal",
  "Fasteners & sealants",
] as const;

export const MATERIAL_SECTION_OTHER = "Other";

const SECTION_ORDER = [...MATERIAL_SECTIONS, MATERIAL_SECTION_OTHER];

export function materialSectionForName(name: string) {
  const text = name.toLowerCase();
  if (/\b(nail|nails|screw|screws|staple|staples|sealant|caulk|cement|fastener|fasteners)\b/.test(text)) {
    return "Fasteners & sealants";
  }
  if (/\bvents?\b|\bvent\b|ventilation|turbine|soffit/.test(text)) return "Ventilation";
  if (/drip|flash|pipe jack|\bboot\b|valley|step metal|coil stock|gutter apron/.test(text)) {
    return "Flashing & metal";
  }
  if (/underlay|felt|ice\s*(&|and)\s*water|synthetic/.test(text)) return "Underlayment";
  if (/shingle|hip|ridge|starter|\bcap\b/.test(text)) return "Shingles";
  return MATERIAL_SECTION_OTHER;
}

export type PresentedMaterialLine = MaterialOrderLine & {
  detail: string;
  sku: string;
  section: string;
  subtitle: string;
  amount: number;
};

export function presentMaterialLine(
  line: MaterialOrderLine,
  catalog?: Pick<CatalogItem, "description" | "costCode"> | null,
): PresentedMaterialLine {
  const detail = catalog?.description?.trim() ?? "";
  const sku = catalog?.costCode?.trim() ?? "";
  return {
    ...line,
    detail,
    sku,
    section: materialSectionForName(line.name),
    subtitle: [detail, sku].filter(Boolean).join(" · "),
    amount: materialOrderLineAmount(line),
  };
}

export function groupPresentedLines<T extends { section: string }>(lines: T[]) {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const section = SECTION_ORDER.includes(line.section as (typeof SECTION_ORDER)[number])
      ? line.section
      : MATERIAL_SECTION_OTHER;
    const bucket = groups.get(section) ?? [];
    bucket.push(line);
    groups.set(section, bucket);
  }
  return SECTION_ORDER.filter((section) => groups.has(section)).map((section) => ({
    section,
    lines: groups.get(section) ?? [],
  }));
}

export function supplierShortName(vendor: string) {
  const name = vendor.trim();
  if (!name) return "supplier";
  const parts = name.split(/\s+/);
  if (parts.length >= 3) return parts[0] ?? name;
  return name;
}

export function materialOrderStatusLabel(status: MaterialOrder["status"]) {
  if (status === "sent") return "Sent";
  if (status === "confirmed") return "Confirmed";
  if (status === "delivered") return "Delivered";
  return "Draft";
}

export function materialOrderWindowLabel(window: MaterialOrderWindow) {
  if (window === "afternoon") return "Afternoon";
  if (window === "anytime") return "Anytime";
  return "Morning";
}

function parseWhen(iso: string | null | undefined) {
  if (!iso) return null;
  const date = iso.includes("T") ? new Date(iso) : new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMaterialOrderDay(iso: string | null | undefined) {
  const date = parseWhen(iso);
  if (!date) return "";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatMaterialOrderIssued(iso: string | null | undefined) {
  const date = parseWhen(iso);
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function materialOrderWhenLabel(input: {
  neededBy: string | null;
  window: MaterialOrderWindow;
  fulfillment: MaterialOrder["fulfillment"];
}) {
  const day = formatMaterialOrderDay(input.neededBy);
  const window = materialOrderWindowLabel(input.window);
  if (!day) return input.fulfillment === "pickup" ? "Pick a pickup day" : "Pick a day";
  return `${day} · ${window}`;
}

export function materialOrderBranchLine(branch: string, accountNumber: string) {
  const branchLabel = branch.trim() || "[BRANCH]";
  const accountLabel = accountNumber.trim() || "[ACCOUNT #]";
  return `Branch ${branchLabel} · Acct ${accountLabel}`;
}

export function materialOrderItemSummary(lines: Array<{ name: string; unitCost: number }>) {
  const named = lines.filter((line) => line.name.trim());
  if (named.length === 0) return { ready: false, label: "None yet" };
  const unpriced = named.filter((line) => !(line.unitCost > 0)).length;
  if (unpriced > 0) return { ready: false, label: `${named.length} · add prices` };
  return { ready: true, label: `${named.length} · priced` };
}

export function sectionAmount(lines: Array<{ amount: number }>) {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}
