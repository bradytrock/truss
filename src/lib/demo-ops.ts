import type { CrmState } from "@/lib/types";
import {
  ESTIMATE_LINE_EXTRAS,
  ESTIMATE_RECORD_EXTRAS,
  fillEstimate,
  fillEstimateLine,
} from "@/lib/estimate-totals";
import {
  extraCatalog,
  extraEstimateLines,
  extraEstimates,
  extraEvents,
  extraInvoiceLines,
  extraInvoices,
  extraPayments,
  extraPhotos,
} from "@/lib/demo-ops-extra";
import { extraExpenses, seedPaymentsFromExtra } from "@/lib/demo-financials";
import { fillInvoiceQb } from "@/lib/job-financials";
import { fillCatalogItem, type CatalogItemDraft } from "@/lib/catalog-margin";
import { seedShareToken } from "@/lib/share";

const catalogCore: Array<CatalogItemDraft & { id: string }> = [
  { id: "cat_sog", name: "Place & finish slab on grade", kind: "labor", unit: "sf", unitCost: 4.85, costCode: "03 30 00" },
  { id: "cat_mix", name: "Ready-mix 4000 psi", kind: "material", unit: "cy", unitCost: 168, costCode: "03 30 00" },
  { id: "cat_steel", name: "Structural steel package", kind: "subcontract", unit: "LS", unitCost: 2180000, costCode: "05 12 00" },
  { id: "cat_carp", name: "Rough carpentry", kind: "labor", unit: "lf", unitCost: 12.4, costCode: "06 10 00" },
  { id: "cat_insul", name: "Batt insulation", kind: "material", unit: "sf", unitCost: 1.85, costCode: "07 21 00" },
  { id: "cat_tpo", name: "TPO roofing", kind: "subcontract", unit: "sf", unitCost: 8.75, costCode: "07 54 00" },
  { id: "cat_doors", name: "HM doors & frames", kind: "material", unit: "ea", unitCost: 980, costCode: "08 11 00" },
  { id: "cat_dw", name: "Drywall hang, tape & finish", kind: "labor", unit: "sf", unitCost: 3.65, costCode: "09 29 00" },
  { id: "cat_paint", name: "Interior paint", kind: "labor", unit: "sf", unitCost: 1.95, costCode: "09 91 00" },
  { id: "cat_elec", name: "Electrical rough & trim", kind: "subcontract", unit: "sf", unitCost: 14.5, costCode: "26 05 00" },
  { id: "cat_plumb", name: "Plumbing rough", kind: "subcontract", unit: "sf", unitCost: 9.8, costCode: "22 00 00" },
  { id: "cat_hvac", name: "HVAC package", kind: "subcontract", unit: "sf", unitCost: 18.2, costCode: "23 00 00" },
  { id: "cat_temp", name: "Temporary facilities", kind: "allowance", unit: "mo", unitCost: 4200, costCode: "01 50 00" },
  { id: "cat_crane", name: "Tower crane", kind: "equipment", unit: "mo", unitCost: 28500, costCode: "01 54 00" },
  { id: "cat_demo", name: "Selective demolition", kind: "labor", unit: "sf", unitCost: 6.4, costCode: "02 41 00" },
  { id: "cat_gc", name: "General conditions", kind: "allowance", unit: "LS", unitCost: 1240000, costCode: "01 11 00" },
  { id: "cat_mep_pkg", name: "MEP design-assist package", kind: "subcontract", unit: "LS", unitCost: 6850000, costCode: "21 00 00" },
  { id: "cat_env", name: "Envelope & waterproofing", kind: "subcontract", unit: "LS", unitCost: 1960000, costCode: "07 10 00" },
  { id: "cat_int", name: "Interiors package", kind: "subcontract", unit: "LS", unitCost: 3410000, costCode: "09 00 00" },
  { id: "cat_conc_pkg", name: "Concrete package", kind: "subcontract", unit: "LS", unitCost: 1240000, costCode: "03 00 00" },
];

export const demoOps: Pick<
  CrmState,
  | "catalog"
  | "estimates"
  | "estimateLines"
  | "invoices"
  | "invoiceLines"
  | "payments"
  | "expenses"
  | "events"
  | "photos"
> = {
  catalog: [...catalogCore, ...extraCatalog].map((item) => fillCatalogItem({ ...item, id: item.id })),
  estimates: extraEstimates.map((estimate) =>
    fillEstimate({ ...estimate, ...ESTIMATE_RECORD_EXTRAS[estimate.id] }),
  ),
  estimateLines: extraEstimateLines.map((line) =>
    fillEstimateLine({ ...line, ...ESTIMATE_LINE_EXTRAS[line.id] }),
  ),
  invoices: extraInvoices.map((invoice) =>
    fillInvoiceQb({
      ...invoice,
      shareToken: seedShareToken("i", invoice.number),
    }),
  ),
  invoiceLines: extraInvoiceLines,
  payments: seedPaymentsFromExtra(extraPayments),
  expenses: extraExpenses,
  events: extraEvents,
  photos: extraPhotos,
};
