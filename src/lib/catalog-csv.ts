import {
  CATALOG_KIND_LABELS,
  CATALOG_KINDS,
  type CatalogItem,
  type CatalogKind,
} from "@/lib/types";
import { clampMarginPercent } from "@/lib/catalog-margin";

export type CatalogImportDraft = {
  name: string;
  kind: CatalogKind;
  unit: string;
  unitCost: number;
  marginPercent: number;
  costCode: string;
};

export type CatalogImportIssue = {
  line: number;
  message: string;
};

export type CatalogImportPreview = {
  rows: CatalogImportDraft[];
  issues: CatalogImportIssue[];
};

export const CATALOG_CSV_HEADERS = ["name", "kind", "unit", "unit_cost", "cost_code", "margin_percent"] as const;

const NAME_HEADERS = new Set(["name", "item", "item name", "description", "title"]);
const KIND_HEADERS = new Set(["kind", "type", "category", "class"]);
const UNIT_HEADERS = new Set(["unit", "uom", "u m"]);
const COST_HEADERS = new Set(["unit cost", "cost", "price", "unit price", "rate", "amount"]);
const CODE_HEADERS = new Set(["cost code", "code", "sku", "item code"]);
const MARGIN_HEADERS = new Set(["margin", "margin percent", "margin_percent", "markup", "markup percent", "markup %"]);

const KIND_ALIASES: Record<string, CatalogKind> = {
  labor: "labor",
  labour: "labor",
  lab: "labor",
  material: "material",
  materials: "material",
  mat: "material",
  mats: "material",
  equipment: "equipment",
  equip: "equipment",
  eq: "equipment",
  allowance: "allowance",
  allow: "allowance",
  allowances: "allowance",
  subcontract: "subcontract",
  sub: "subcontract",
  subcontractor: "subcontract",
  subcontractors: "subcontract",
  subs: "subcontract",
  "sub contract": "subcontract",
};

export const CATALOG_CSV_TEMPLATE = `${CATALOG_CSV_HEADERS.join(",")}
Architectural shingles,material,sq,425.00,07 31 13,25
Tear-off,labor,sq,85.00,07 31 13.L,20
Dumpster,equipment,ea,450.00,,15
`;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseKind(raw: string): CatalogKind | null {
  const trimmed = raw.trim();
  if (!trimmed) return "material";
  const key = normalizeHeader(trimmed);
  if (KIND_ALIASES[key]) return KIND_ALIASES[key];
  for (const kind of CATALOG_KINDS) {
    if (kind === key || CATALOG_KIND_LABELS[kind].toLowerCase() === key) return kind;
  }
  return null;
}

function parseCost(raw: string) {
  const trimmed = raw.trim().replace(/[$,]/g, "");
  if (!trimmed) return 0;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function parseMargin(raw: string) {
  const trimmed = raw.trim().replace(/%/g, "");
  if (!trimmed) return 0;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return clampMarginPercent(amount);
}

function detectDelimiter(firstLine: string) {
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  if (tabs > commas && tabs > semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}

export function parseDelimited(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!src.trim()) return [];
  const firstLine = src.split("\n")[0] ?? "";
  const sep = delimiter ?? detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < src.length) {
    const char = src[i] ?? "";
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === sep) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (inQuotes) throw new Error("The file has a quote that never closes. Save again as CSV.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim()));
}

function columnIndex(headers: string[], aliases: Set<string>) {
  return headers.findIndex((header) => aliases.has(header));
}

export function parseCatalogCsv(text: string): CatalogImportPreview {
  if (text.includes("\u0000")) {
    throw new Error("This looks like an Excel workbook. Save it as CSV (UTF-8) and upload that file.");
  }
  const table = parseDelimited(text);
  if (table.length === 0) throw new Error("The file is empty.");

  const first = (table[0] ?? []).map(normalizeHeader);
  const named = {
    name: columnIndex(first, NAME_HEADERS),
    kind: columnIndex(first, KIND_HEADERS),
    unit: columnIndex(first, UNIT_HEADERS),
    unitCost: columnIndex(first, COST_HEADERS),
    costCode: columnIndex(first, CODE_HEADERS),
    marginPercent: columnIndex(first, MARGIN_HEADERS),
  };
  const hasHeader = named.name >= 0;
  const body = hasHeader ? table.slice(1) : table;
  const cols = hasHeader
    ? named
    : { name: 0, kind: 1, unit: 2, unitCost: 3, costCode: 4, marginPercent: 5 };

  if (cols.name < 0) {
    throw new Error("Add a name column. Use headers name, kind, unit, unit_cost, cost_code, margin_percent.");
  }

  const rows: CatalogImportDraft[] = [];
  const issues: CatalogImportIssue[] = [];
  const startLine = hasHeader ? 2 : 1;

  body.forEach((cells, index) => {
    const line = startLine + index;
    const name = (cells[cols.name] ?? "").trim();
    if (!name) {
      issues.push({ line, message: "Name is missing." });
      return;
    }
    const kindRaw = cols.kind >= 0 ? (cells[cols.kind] ?? "") : "";
    const kind = parseKind(kindRaw);
    if (!kind) {
      issues.push({ line, message: `Kind “${kindRaw.trim()}” is not labor, material, equipment, allowance, or subcontract.` });
      return;
    }
    const costRaw = cols.unitCost >= 0 ? (cells[cols.unitCost] ?? "") : "";
    const unitCost = parseCost(costRaw);
    if (unitCost == null) {
      issues.push({ line, message: `Unit cost “${costRaw.trim()}” is not a number.` });
      return;
    }
    const marginRaw = cols.marginPercent >= 0 ? (cells[cols.marginPercent] ?? "") : "";
    const marginPercent = parseMargin(marginRaw);
    if (marginPercent == null) {
      issues.push({ line, message: `Margin “${marginRaw.trim()}” is not a percent.` });
      return;
    }
    rows.push({
      name,
      kind,
      unit: (cols.unit >= 0 ? (cells[cols.unit] ?? "") : "").trim() || "ea",
      unitCost,
      marginPercent,
      costCode: (cols.costCode >= 0 ? (cells[cols.costCode] ?? "") : "").trim(),
    });
  });

  return { rows, issues };
}

export function catalogToCsv(items: CatalogItem[]) {
  const lines = [
    CATALOG_CSV_HEADERS.join(","),
    ...items.map((item) =>
      [item.name, item.kind, item.unit, item.unitCost.toFixed(2), item.costCode, item.marginPercent.toFixed(2)]
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function downloadCatalogCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function matchCatalogItem(catalog: CatalogItem[], row: CatalogImportDraft) {
  const code = row.costCode.trim().toLowerCase();
  if (code) {
    const byCode = catalog.find((item) => item.costCode.trim().toLowerCase() === code);
    if (byCode) return byCode;
  }
  const name = row.name.trim().toLowerCase();
  return catalog.find((item) => item.name.trim().toLowerCase() === name && item.kind === row.kind);
}
