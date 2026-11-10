import assert from "node:assert/strict";
import { extractText } from "unpdf";
import { fillMaterialOrder } from "./material-orders.ts";
import { buildMaterialOrderPdf } from "./material-order-pdf.ts";
import { presentMaterialLine } from "./material-order-presentation.ts";
import type { CatalogItem, CompanySettings, Job, MaterialOrderLine } from "./types.ts";

const company: CompanySettings = {
  name: "T-Rock Roofing & Contracting",
  slug: "t-rock",
  phone: "4697947701",
  email: "office@trockcontracting.com",
  website: "DallasRoofer.com",
  street: "100 Commerce St",
  city: "Dallas",
  state: "TX",
  postalCode: "75201",
  licenseNumber: "",
};

function job(): Job {
  return {
    id: "job-1",
    code: "BJ3102726-B",
    opportunityId: null,
    name: "Campolo residence",
    clientId: null,
    primaryContactId: null,
    status: "scheduled",
    contractValue: 0,
    startDate: "2026-11-12",
    substantialCompletion: null,
    superintendent: "",
    projectManager: "",
    location: "104 West Ash Lane, Euless, TX",
    ownerStaffId: "",
    description: "",
    tags: [],
    street: "104 West Ash Lane",
    city: "Euless",
    state: "TX",
    postalCode: "76039",
    salesRep: "",
    assigned: [],
    subcontractorIds: [],
    relatedContactIds: [],
    customFields: [],
    projectType: "roofing",
    market: "residential",
    trades: [],
    leadSource: "",
    primaryPhotoId: null,
    deletedAt: null,
    deletedReason: "",
    deletedBy: "",
  };
}

function line(
  partial: Pick<MaterialOrderLine, "name" | "quantity" | "unit" | "unitCost"> & { description?: string; sku?: string },
): ReturnType<typeof presentMaterialLine> {
  const catalog: Pick<CatalogItem, "description" | "costCode"> = {
    description: partial.description ?? "",
    costCode: partial.sku ?? "",
  };
  return presentMaterialLine(
    {
      id: partial.name,
      materialOrderId: "mo-1",
      catalogItemId: "cat",
      name: partial.name,
      quantity: partial.quantity,
      unit: partial.unit,
      unitCost: partial.unitCost,
      sortOrder: 1,
    },
    catalog,
  );
}

const order = fillMaterialOrder({
  id: "mo-1",
  number: "MO-104-WEST-ASH-LANE-EULESS-TX-1012",
  jobId: "job-1",
  vendor: "Beacon Roofing Supply",
  notes: "Confirm shingle color is Charcoal before loading — call (469) 794-7701 with any substitutions.",
  neededBy: "2026-11-12",
  createdAt: "2026-11-09T18:00:00.000Z",
  window: "morning",
  fulfillment: "delivery",
  quickNotes: ["Ground drop", "Call 30 min before"],
  branch: "",
  accountNumber: "",
});

const pdf = await buildMaterialOrderPdf({
  order,
  job: job(),
  company,
  orderedBy: "Brady Jones",
  orderedByPhone: "4697947701",
  orderedByEmail: "bjones@trockcontracting.com",
  lines: [
    line({
      name: "Timberline HDZ shingles",
      description: "GAF · Charcoal",
      sku: "GAF-HDZ-CHR",
      quantity: 90,
      unit: "BD",
      unitCost: 41.5,
    }),
    line({
      name: "Cobra ridge vent",
      description: "4 ft section",
      sku: "GAF-CRV4",
      quantity: 10,
      unit: "PC",
      unitCost: 14.25,
    }),
    line({
      name: "Drip edge, 10 ft",
      description: "Aluminum · Brown",
      sku: "DE-10-BRN",
      quantity: 24,
      unit: "PC",
      unitCost: 9.8,
    }),
  ],
});

const extracted = await extractText(new Uint8Array(await pdf.arrayBuffer()));
const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
const text = pages.join("\n");

assert.match(text, /MATERIAL ORDER/);
assert.match(text, /T-Rock Roofing & Contracting/);
assert.match(text, /MO-104-WEST-ASH-LANE-EULESS-TX-1012/);
assert.match(text, /BJ3102726-B/);
assert.match(text, /Beacon Roofing Supply/);
assert.match(text, /\[BRANCH\]/);
assert.match(text, /\[ACCOUNT #\]/);
assert.doesNotMatch(text, /Campolo residence/);
assert.match(text, /104 West Ash Lane/);
assert.match(text, /Euless, TX 76039/);
assert.match(text, /Brady Jones/);
assert.match(text, /Thu, Nov 12/);
assert.match(text, /Morning/);
assert.match(text, /Ground drop/);
assert.match(text, /SHINGLES/);
assert.match(text, /VENTILATION/);
assert.match(text, /FLASHING & METAL/);
assert.match(text, /Timberline HDZ shingles/);
assert.match(text, /GAF-HDZ-CHR/);
assert.match(text, /\$3,735\.00/);
assert.match(text, /Confirm shingle color is Charcoal/);
assert.match(text, /Per supplier invoice/);
assert.match(text, /Estimated total/);
assert.match(text, /Received by/);
assert.match(text, /Powered by TheRoofingCRM/);

console.log("material-order-pdf.test.ts ok");
