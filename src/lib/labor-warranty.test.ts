import assert from "node:assert/strict";
import { extractText } from "unpdf";
import {
  laborWarrantyContactLine,
  laborWarrantyDateLabel,
  laborWarrantyDraft,
  laborWarrantyFilename,
  laborWarrantyFooterLine,
  laborWarrantySections,
  laborWarrantyWebsite,
} from "./labor-warranty.ts";
import { buildLaborWarrantyPdf } from "./labor-warranty-pdf.ts";
import type { CompanySettings, Job } from "./types.ts";

const company: CompanySettings = {
  name: "T Rock Roofing & Contracting",
  slug: "t-rock",
  phone: "8177736694",
  email: "office@dallasroofer.com",
  website: "https://www.dallasroofer.com",
  street: "3001 Long Prairie Road, Suite 100",
  city: "Flower Mound",
  state: "TX",
  postalCode: "75022",
  licenseNumber: "RCAT-100",
};

function job(partial: Partial<Job> = {}): Job {
  return {
    id: "job_1",
    code: "BT-104",
    opportunityId: null,
    name: "Alvarez roof",
    clientId: null,
    primaryContactId: null,
    status: "scheduled",
    contractValue: 12400,
    startDate: "2026-09-22",
    substantialCompletion: "2026-09-24",
    superintendent: "",
    projectManager: "Ada Lopez",
    location: "",
    ownerStaffId: "",
    description: "",
    tags: [],
    street: "4418 E 32nd Ave",
    city: "Denver",
    state: "CO",
    postalCode: "80207",
    salesRep: "",
    assigned: [],
    subcontractorIds: [],
    relatedContactIds: [],
    customFields: [],
    projectType: "roofing",
    market: "residential",
    trades: ["roofing"],
    leadSource: "",
    primaryPhotoId: null,
    deletedAt: null,
    deletedReason: "",
    deletedBy: "",
    ...partial,
  };
}

const drafted = laborWarrantyDraft({
  job: job({
    customFields: [
      { id: "file", label: "__truss_file__", value: '{"name":"shingle.pdf"}' },
      { id: "type", label: "Shingle type", value: "Duration" },
      { id: "color", label: "Color", value: "Onyx Black" },
      { id: "carrier", label: "Carrier", value: "State Farm" },
    ],
  }),
  customerName: "Maria Alvarez",
  company,
  preparedBy: "Brady",
  today: "2026-10-08",
  materialOrders: [
    {
      id: "ord_1",
      jobId: "job_1",
      status: "delivered",
      createdAt: "2026-09-20T00:00:00.000Z",
      archivedAt: null,
    },
  ],
  materialOrderLines: [
    { materialOrderId: "ord_1", name: "Landmark shingles", quantity: 30, sortOrder: 0 },
  ],
  estimates: [
    {
      id: "est_1",
      status: "accepted",
      acceptedAt: "2026-09-15T00:00:00.000Z",
      createdAt: "2026-09-10T00:00:00.000Z",
      packageMode: "",
      selectedPackage: "",
      archivedAt: null,
    },
  ],
  estimateLines: [
    {
      estimateId: "est_1",
      title: "Architectural shingles",
      description: "Estate Gray",
      optional: false,
      selected: true,
      sortOrder: 0,
      quantity: 24,
    },
  ],
});

assert.equal(drafted.ownerName, "Maria Alvarez");
assert.equal(drafted.companyName, "T Rock Roofing & Contracting");
assert.equal(drafted.shingle, "Duration · Onyx Black");
assert.equal(drafted.installDate, "2026-09-22");
assert.equal(drafted.projectManager, "Ada Lopez");
assert.equal(drafted.signedBy, "Ada Lopez");
assert.equal(laborWarrantyDateLabel(drafted.installDate), "Sep 22, 2026");
assert.equal(laborWarrantyWebsite(company.website), "dallasroofer.com");
assert.equal(laborWarrantyContactLine(company), "(817) 773-6694 · dallasroofer.com");
assert.equal(
  laborWarrantyFooterLine(company),
  "T Rock Roofing & Contracting · dallasroofer.com · (817) 773-6694",
);
assert.equal(laborWarrantyFilename("Alvarez / roof"), "Alvarez roof lifetime labor warranty.pdf");
assert.equal(laborWarrantyFilename("   "), "Job lifetime labor warranty.pdf");

const fromOrder = laborWarrantyDraft({
  job: job({ customFields: [], id: "job_1" }),
  customerName: "Maria Alvarez",
  company,
  preparedBy: "Brady",
  today: "2026-10-08",
  materialOrders: [
    {
      id: "ord_draft",
      jobId: "job_1",
      status: "draft",
      createdAt: "2026-09-21T00:00:00.000Z",
      archivedAt: null,
    },
    {
      id: "ord_other",
      jobId: "job_2",
      status: "delivered",
      createdAt: "2026-09-21T00:00:00.000Z",
      archivedAt: null,
    },
    {
      id: "ord_old",
      jobId: "job_1",
      status: "delivered",
      createdAt: "2026-09-01T00:00:00.000Z",
      archivedAt: "2026-09-02T00:00:00.000Z",
    },
    {
      id: "ord_live",
      jobId: "job_1",
      status: "delivered",
      createdAt: "2026-09-18T00:00:00.000Z",
      archivedAt: null,
    },
  ],
  materialOrderLines: [
    { materialOrderId: "ord_draft", name: "Timberline shingles", quantity: 40, sortOrder: 0 },
    { materialOrderId: "ord_other", name: "Camelot shingles", quantity: 40, sortOrder: 0 },
    { materialOrderId: "ord_old", name: "Oakridge shingles", quantity: 40, sortOrder: 0 },
    { materialOrderId: "ord_live", name: "Starter shingles", quantity: 10, sortOrder: 0 },
    { materialOrderId: "ord_live", name: "Duration shingles", quantity: 28, sortOrder: 1 },
    { materialOrderId: "ord_live", name: "Tear-off existing shingles", quantity: 28, sortOrder: 2 },
  ],
  estimates: [
    {
      id: "est_1",
      status: "accepted",
      acceptedAt: "2026-09-15T00:00:00.000Z",
      createdAt: "2026-09-10T00:00:00.000Z",
      packageMode: "",
      selectedPackage: "",
      archivedAt: null,
    },
  ],
  estimateLines: [
    {
      estimateId: "est_1",
      title: "Architectural shingles",
      description: "Estate Gray",
      optional: false,
      selected: true,
      sortOrder: 0,
      quantity: 24,
    },
  ],
});
assert.equal(fromOrder.shingle, "Duration shingles");

const fromEstimate = laborWarrantyDraft({
  job: job({
    customFields: [],
    startDate: "",
    substantialCompletion: "2026-10-01T15:00:00.000Z",
    projectManager: "",
  }),
  customerName: "",
  company: { name: "T Rock Roofing & Contracting" },
  preparedBy: "Brady",
  today: "2026-10-08",
  estimates: [
    {
      id: "est_old",
      status: "accepted",
      acceptedAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
      packageMode: "",
      selectedPackage: "",
      archivedAt: "2026-09-02T00:00:00.000Z",
    },
    {
      id: "est_declined",
      status: "declined",
      acceptedAt: null,
      createdAt: "2026-09-20T00:00:00.000Z",
      packageMode: "",
      selectedPackage: "",
      archivedAt: null,
    },
    {
      id: "est_1",
      status: "accepted",
      acceptedAt: "2026-09-15T00:00:00.000Z",
      createdAt: "2026-09-10T00:00:00.000Z",
      packageMode: "gbb",
      selectedPackage: "best",
      archivedAt: null,
    },
  ],
  estimateLines: [
    {
      estimateId: "est_old",
      title: "Should not appear shingles",
      description: "",
      optional: false,
      selected: true,
      sortOrder: 0,
      quantity: 10,
    },
    {
      estimateId: "est_1",
      title: "3-tab shingles",
      description: "White",
      optional: false,
      selected: true,
      sortOrder: 0,
      quantity: 30,
      package: "good",
    },
    {
      estimateId: "est_1",
      title: "Duration",
      description: "Onyx Black",
      optional: false,
      selected: true,
      sortOrder: 1,
      quantity: 28,
      package: "best",
    },
    {
      estimateId: "est_1",
      title: "Presidential shingles",
      description: "Charcoal",
      optional: true,
      selected: false,
      sortOrder: 2,
      quantity: 40,
      package: "best",
    },
    {
      estimateId: "est_1",
      title: "Tear-off existing shingles",
      description: "",
      optional: false,
      selected: true,
      sortOrder: 3,
      quantity: 28,
      package: "",
    },
    {
      estimateId: "est_1",
      title: "Hip and ridge",
      description: "",
      optional: false,
      selected: true,
      sortOrder: 4,
      quantity: 12,
      package: "best",
    },
  ],
});
assert.equal(fromEstimate.shingle, "Duration · Onyx Black");
assert.equal(fromEstimate.installDate, "2026-10-01");
assert.equal(fromEstimate.projectManager, "Brady");
assert.equal(fromEstimate.signedBy, "Brady");
assert.equal(fromEstimate.ownerName, "");

const fromCatalog = laborWarrantyDraft({
  job: job({ customFields: [], startDate: "not-a-date", substantialCompletion: null, projectManager: "Sam" }),
  customerName: "Maria Alvarez",
  company,
  preparedBy: "Brady",
  today: "2026-10-08",
  estimates: [
    {
      id: "est_1",
      status: "sent",
      acceptedAt: null,
      createdAt: "2026-09-10T00:00:00.000Z",
      packageMode: "",
      selectedPackage: "",
      archivedAt: null,
    },
  ],
  estimateLines: [
    {
      estimateId: "est_1",
      title: "Main field",
      description: "",
      optional: false,
      selected: true,
      sortOrder: 1,
      quantity: 20,
      catalogItemId: "cat_shingle",
    },
    {
      estimateId: "est_1",
      title: "Remove existing shingles",
      description: "",
      optional: false,
      selected: true,
      sortOrder: 0,
      quantity: 40,
      catalogItemId: "cat_shingle",
    },
  ],
  catalog: [
    { id: "cat_shingle", name: "Landmark shingles", kind: "material", description: "Moire Black" },
    { id: "cat_labor", name: "Shingle installation", kind: "labor", description: "" },
  ],
});
assert.equal(fromCatalog.shingle, "Landmark shingles · Moire Black");
assert.equal(fromCatalog.installDate, "2026-10-08");

const combinedField = laborWarrantyDraft({
  job: job({
    customFields: [{ id: "both", label: "Shingle type & color", value: "  Dynasty, Barkwood  " }],
  }),
  customerName: "Maria Alvarez",
  company,
  preparedBy: "Brady",
  today: "2026-10-08",
});
assert.equal(combinedField.shingle, "Dynasty, Barkwood");

const sections = laborWarrantySections(company.name);
assert.equal(sections.length, 5);
assert.equal(sections[1]?.items.length, 4);
assert.equal(sections[2]?.items.length, 5);
assert.match(sections[0]?.text ?? "", /T Rock Roofing & Contracting warrants to the building Owner/);
assert.match(sections[1]?.items[1]?.text ?? "", /48 hours/);
assert.match(sections[2]?.items[1]?.text ?? "", /acts of God/);
assert.match(sections[3]?.text ?? "", /Transfer fee may apply/);
assert.match(sections[4]?.text ?? "", /fitness for a particular use/);
assert.match(laborWarrantySections("  ").map((section) => section.text).join(" "), /the contractor warrants/i);

async function textFromPdf(blob: Blob) {
  const extracted = await extractText(new Uint8Array(await blob.arrayBuffer()), { mergePages: false });
  const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  return { pages, text: pages.join("\n") };
}

const pdf = await buildLaborWarrantyPdf({ warranty: drafted, company });
const { pages, text } = await textFromPdf(pdf);
assert.equal(pages.length, 1);
assert.match(text, /LIFETIME LABOR &/);
assert.match(text, /MATERIAL WARRANTY/);
assert.match(text, /T Rock Roofing & Contracting/);
assert.match(text, /3001 Long Prairie Road, Suite 100/);
assert.match(text, /Flower Mound, TX 75022/);
assert.match(text, /\(817\) 773-6694/);
assert.match(text, /dallasroofer.com/);
assert.match(text, /Maria Alvarez/);
assert.match(text, /Duration · Onyx Black/);
assert.match(text, /Sep 22, 2026/);
assert.match(text, /Ada Lopez/);
assert.match(text, /PROPERTY OWNER/);
assert.match(text, /SHINGLE TYPE & COLOR/);
assert.match(text, /INSTALL DATE/);
assert.match(text, /PROJECT MANAGER/);
assert.match(text, /48 hours/);
assert.match(text, /Transfer fee may apply/);
assert.match(text, /fitness for a particular use/);
assert.match(text, /Signed by the company representative/);
assert.match(text, /Lifetime Labor & Material Warranty/);
assert.doesNotMatch(text, /office@dallasroofer.com/);
assert.doesNotMatch(text, /RCAT-100/);
assert.doesNotMatch(text, /Landmark shingles/);
assert.doesNotMatch(text, /State Farm/);

const longName = "T Rock Roofing & Contracting of North Texas and the Surrounding Counties";
const longPdf = await buildLaborWarrantyPdf({
  warranty: {
    ...drafted,
    companyName: longName,
    shingle: "Owens Corning Duration architectural shingles in Onyx Black with a matching hip and ridge",
    ownerName: "Maria Alvarez and Jordan Alvarez",
  },
  company,
});
const longText = (await textFromPdf(longPdf)).text;
assert.match(longText, /free of\s+installation errors/);
assert.match(longText, /fitness for a particular use/);
assert.match(longText, /Onyx Black/);
assert.match(longText, new RegExp(longName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

console.log("labor warranty tests passed");
