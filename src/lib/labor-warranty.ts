import { isGbbEstimate, scopedEstimateLines } from "@/lib/estimate-packages";
import { lineIncluded } from "@/lib/estimate-totals";
import { formatDate, formatPhone, localYmd } from "@/lib/format";
import { isJobFileField } from "@/lib/job-files";
import type {
  CatalogItem,
  CompanySettings,
  Estimate,
  EstimateLine,
  Job,
  JobCustomField,
  MaterialOrder,
  MaterialOrderLine,
} from "@/lib/types";

export type LaborWarranty = {
  companyName: string;
  jobName: string;
  ownerName: string;
  shingle: string;
  /** YYYY-MM-DD. Printed as a date on the warranty. */
  installDate: string;
  projectManager: string;
  signedBy: string;
};

export type LaborWarrantySection = {
  number: string;
  text: string;
  items: { letter: string; text: string }[];
};

type WarrantyEstimate = Pick<
  Estimate,
  "id" | "status" | "acceptedAt" | "createdAt" | "packageMode" | "selectedPackage"
> & { archivedAt?: string | null };

type WarrantyLine = Pick<
  EstimateLine,
  "estimateId" | "title" | "description" | "optional" | "selected" | "sortOrder" | "quantity"
> &
  Partial<Pick<EstimateLine, "package" | "catalogItemId">>;

type WarrantyCatalogItem = Pick<CatalogItem, "id" | "name"> &
  Partial<Pick<CatalogItem, "kind" | "description">>;

type WarrantyOrder = Pick<MaterialOrder, "id" | "jobId" | "status" | "createdAt"> & {
  archivedAt?: string | null;
};

type WarrantyOrderLine = Pick<MaterialOrderLine, "materialOrderId" | "name" | "quantity" | "sortOrder">;

const ORDER_RANK: Record<string, number> = {
  delivered: 3,
  confirmed: 2,
  sent: 1,
  draft: 0,
};

export function laborWarrantyFilename(jobName: string) {
  const base = jobName.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Job";
  return `${base} lifetime labor warranty.pdf`;
}

export function laborWarrantyDateLabel(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  const formatted = formatDate(raw);
  return formatted === "—" ? raw : formatted;
}

export function laborWarrantyCompanyName(name: string) {
  return name.trim() || "the contractor";
}

export function laborWarrantyWebsite(website: string) {
  return website
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/** Phone, then website, as on the warranty letterhead. */
export function laborWarrantyContactLine(company: { phone?: string; website?: string }) {
  const phone = formatPhone(company.phone ?? "");
  return [phone !== "—" ? phone : "", laborWarrantyWebsite(company.website ?? "")].filter(Boolean).join(" · ");
}

/** Company, website, then phone, as on the warranty footer. */
export function laborWarrantyFooterLine(company: { name: string; phone?: string; website?: string }) {
  const phone = formatPhone(company.phone ?? "");
  return [company.name.trim(), laborWarrantyWebsite(company.website ?? ""), phone !== "—" ? phone : ""]
    .filter(Boolean)
    .join(" · ");
}

export function laborWarrantySections(companyName: string): LaborWarrantySection[] {
  const company = laborWarrantyCompanyName(companyName);
  return [
    {
      number: "1",
      text: `${company} warrants to the building Owner ("Owner") that the roof is free of installation errors and will warrant this roof for life from the installation date above. The shingle manufacturer guarantees that the product is non-hazardous, non-carcinogenic, is manufactured to strict quality control standards, and is free of manufacturing defects for life from the date of installation. Should the product prove to be defective in its manufacture, the shingle manufacturer will provide sufficient materials to replace the defective product and cover the cost of ${company} to repair the defect.`,
      items: [],
    },
    {
      number: "2",
      text: "This warranty is expressly conditioned upon:",
      items: [
        {
          letter: "A",
          text: `${company} being paid in full for all materials and labor supplied to the subject project, with all fees and costs paid in full.`,
        },
        {
          letter: "B",
          text: `${company}'s liability to the Owner for any defect, failure, or deficiency covered by this warranty shall be expressly conditioned upon the Owner's obligation to notify ${company} within 48 hours of the time the Owner discovers the defect.`,
        },
        {
          letter: "C",
          text: `${company} shall then have the right to immediately inspect the defect, and if not given this right, the warranty shall be terminated.`,
        },
        {
          letter: "D",
          text: `${company} shall not be responsible for repairs or alterations made by anyone other than ${company}.`,
        },
      ],
    },
    {
      number: "3",
      text: "This warranty does not cover:",
      items: [
        {
          letter: "A",
          text: "Damage to the roof, building or contents caused by fire, settlement, faulty construction or design, misuse of structure, inadequate drainage causing structural damage, or other failure of the structure.",
        },
        {
          letter: "B",
          text: "Damage to the roof due to extraordinary or unusual events or natural causes, including but not limited to lightning, physical encroachment by wind-driven debris or wind-related structural deterioration, earthquake, or other acts of God.",
        },
        {
          letter: "C",
          text: "Damage to the roof resulting from cracks, deterioration or openings in the roof substrate. Physical damage caused by third parties or foreign objects or agents, including plant or animal life, or any organic or inorganic solvents.",
        },
        {
          letter: "D",
          text: "Damage caused by repairs or alterations to, encroachment upon, or erection of any structure on the roof, or any use of the roof other than for its intended purpose at the time the warranty was issued.",
        },
        {
          letter: "E",
          text: "Any damage done to the building exterior or interior or anything therein.",
        },
      ],
    },
    {
      number: "4",
      text: `This warranty is transferable or assignable to appropriate future property owners only upon the prior express written consent signed by ${company}. Transfer fee may apply.`,
      items: [],
    },
    {
      number: "5",
      text: `${company} will not be liable for any direct, indirect, consequential, incidental, special, or general damage of any kind from whatever cause, which may arise as the result of deterioration of the roofing material. This is the sole warranty issued by ${company} and is in lieu of all other warranties, express or implied, including warranties of merchantability or fitness for a particular use.`,
      items: [],
    },
  ];
}

function toYmd(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return localYmd(date);
}

function preferredEstimate(estimates: WarrantyEstimate[]) {
  const open = estimates.filter((estimate) => !estimate.archivedAt && estimate.status !== "declined");
  const accepted = open.filter((estimate) => estimate.status === "accepted");
  const pool = accepted.length > 0 ? accepted : open;
  return pool.slice().sort((a, b) => {
    const aKey = a.acceptedAt || a.createdAt;
    const bKey = b.acceptedAt || b.createdAt;
    return bKey.localeCompare(aKey);
  })[0];
}

function isShingleTypeLabel(label: string) {
  const text = label.trim();
  if (/colou?r/i.test(text)) return false;
  if (/shingle/i.test(text)) return true;
  return /^(roof(?:ing)?\s+)?(product|material)$/i.test(text);
}

function isShingleColorLabel(label: string) {
  const text = label.trim();
  if (!/colou?r/i.test(text)) return false;
  return /shingle|roof|product/i.test(text) || /^colou?r$/i.test(text);
}

function shingleFromFields(fields: JobCustomField[]) {
  const open = fields.filter((field) => !isJobFileField(field) && field.label.trim() && field.value.trim());
  const combined = open.find((field) => /shingle/i.test(field.label) && /colou?r/i.test(field.label));
  if (combined) return combined.value.trim();
  const type = open.find((field) => isShingleTypeLabel(field.label));
  const color = open.find((field) => isShingleColorLabel(field.label));
  const typeValue = type?.value.trim() ?? "";
  const colorValue = color?.value.trim() ?? "";
  if (typeValue && colorValue && !typeValue.toLowerCase().includes(colorValue.toLowerCase())) {
    return `${typeValue} · ${colorValue}`;
  }
  return typeValue || colorValue;
}

function isRemoval(text: string) {
  return /\b(tear-?off|remove|removal|disposal|haul(?:-|\s)?off|dump(?:ster)?)\b/i.test(text);
}

function isShingleProduct(text: string) {
  if (isRemoval(text)) return false;
  const accessory =
    /\b(underlayment|synthetic felt|felt|ice(?:\s|&|and)+water|starter|ridge cap|hip and ridge|flashing|drip edge|pipe boot|ventilation)\b/i;
  const brand = /\b(duration|landmark|timberline|oakridge|camelot|presidential|dynasty|architectural|3-tab|three-tab)\b/i;
  if (accessory.test(text) && !brand.test(text)) return false;
  return /\b(shingles?|architectural|laminated|3-tab|three-tab|duration|landmark|timberline|oakridge|camelot|presidential|dynasty)\b/i.test(
    text,
  );
}

function productLabel(title: string, description: string) {
  const name = title.trim();
  const detail = description.trim();
  const blob = `${name} ${detail}`.trim();
  if (!blob || !isShingleProduct(blob)) return "";
  if (!name) return detail;
  if (!detail || name.toLowerCase().includes(detail.toLowerCase())) return name;
  if (detail.length > 80 || /[.!?]/.test(detail)) return name;
  return `${name} · ${detail}`;
}

function lineShingleLabel(line: WarrantyLine, catalogItem: WarrantyCatalogItem | undefined) {
  const title = line.title.trim();
  const description = line.description.trim();
  if (isRemoval(`${title} ${description}`)) return "";
  const fromLine = productLabel(title, description);
  if (fromLine) return fromLine;
  if (!catalogItem || (catalogItem.kind && catalogItem.kind !== "material")) return "";
  return productLabel(catalogItem.name, description || catalogItem.description?.trim() || "");
}

function shingleFromEstimates(
  estimates: WarrantyEstimate[],
  lines: WarrantyLine[],
  catalog: WarrantyCatalogItem[],
) {
  const chosen = preferredEstimate(estimates);
  if (!chosen) return "";
  const scoped = isGbbEstimate(chosen)
    ? scopedEstimateLines(
        chosen,
        lines.filter((line) => line.estimateId === chosen.id),
      )
    : lines.filter((line) => line.estimateId === chosen.id);
  const ranked = scoped.flatMap((line) => {
    if (!lineIncluded(line)) return [];
    const item = line.catalogItemId ? catalog.find((entry) => entry.id === line.catalogItemId) : undefined;
    const label = lineShingleLabel(line, item);
    if (!label) return [];
    return [{ label, quantity: line.quantity || 0, sortOrder: line.sortOrder || 0 }];
  });
  ranked.sort((a, b) => b.quantity - a.quantity || a.sortOrder - b.sortOrder);
  return ranked[0]?.label ?? "";
}

function shingleFromOrders(jobId: string, orders: WarrantyOrder[], lines: WarrantyOrderLine[]) {
  const ranked: Array<{ label: string; quantity: number; sortOrder: number; status: number; createdAt: string }> = [];
  for (const order of orders) {
    if (order.jobId !== jobId || order.archivedAt) continue;
    const status = ORDER_RANK[order.status] ?? 0;
    for (const line of lines) {
      if (line.materialOrderId !== order.id) continue;
      const label = productLabel(line.name, "");
      if (!label) continue;
      ranked.push({
        label,
        quantity: line.quantity || 0,
        sortOrder: line.sortOrder || 0,
        status,
        createdAt: order.createdAt || "",
      });
    }
  }
  ranked.sort((a, b) => {
    if (b.status !== a.status) return b.status - a.status;
    if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
    return b.quantity - a.quantity || a.sortOrder - b.sortOrder;
  });
  return ranked[0]?.label ?? "";
}

export function laborWarrantyDraft(input: {
  job: Pick<Job, "id" | "name" | "startDate" | "substantialCompletion" | "projectManager" | "customFields">;
  customerName: string;
  company: Pick<CompanySettings, "name">;
  preparedBy: string;
  estimates?: WarrantyEstimate[];
  estimateLines?: WarrantyLine[];
  catalog?: WarrantyCatalogItem[];
  materialOrders?: WarrantyOrder[];
  materialOrderLines?: WarrantyOrderLine[];
  today?: string;
}): LaborWarranty {
  const preparedBy = input.preparedBy.trim();
  const today = input.today?.trim() || localYmd(new Date());
  const manager = input.job.projectManager.trim() || preparedBy;
  const shingle =
    shingleFromFields(input.job.customFields) ||
    shingleFromOrders(input.job.id, input.materialOrders ?? [], input.materialOrderLines ?? []) ||
    shingleFromEstimates(input.estimates ?? [], input.estimateLines ?? [], input.catalog ?? []);
  return {
    companyName: input.company.name.trim(),
    jobName: input.job.name.trim(),
    ownerName: input.customerName.trim(),
    shingle,
    installDate: toYmd(input.job.startDate) || toYmd(input.job.substantialCompletion) || today,
    projectManager: manager,
    signedBy: manager,
  };
}
