import assert from "node:assert/strict";
import { extractText } from "unpdf";
import { buildEstimatePdf, buildInvoicePdf } from "./document-pdf.ts";
import type { CompanySettings, Estimate, EstimateLine, Invoice, InvoiceLine } from "./types.ts";

const company: CompanySettings = {
  name: "T Rock Roofing",
  slug: "t-rock",
  phone: "2145550100",
  email: "office@example.com",
  website: "",
  street: "1 Main",
  city: "Dallas",
  state: "TX",
  postalCode: "75000",
  licenseNumber: "",
};

const estimate = {
  id: "est_format",
  number: "EST-FORMAT",
  name: "9174 Shadowridge",
  clientId: null,
  opportunityId: null,
  jobId: null,
  contactId: null,
  secondContactId: null,
  status: "draft",
  notes: "",
  validUntil: "2026-10-14",
  sentAt: null,
  acceptedAt: null,
  secondAcceptedAt: null,
  ownerSignedAt: null,
  ownerSignedName: "",
  createdAt: "2026-09-14",
  taxRate: 0,
  discountKind: "percent",
  discountValue: 0,
  depositKind: "percent",
  depositValue: 0,
  intro: "",
  terms: "",
  street: "9174 Shadowridge Drive",
  city: "Highland Village",
  state: "TX",
  postalCode: "75077",
  shareToken: "share",
  secondShareToken: "share2",
  signatureName: "",
  signatureImage: "",
  secondSignatureName: "",
  secondSignatureImage: "",
  packageMode: "",
  selectedPackage: "good",
  marginPercent: 0,
  subtotalOverride: null,
  hideLinePrices: false,
} as Estimate;

const description = [
  "Your new roof will be a complete **TAMKO Heritage** system.",
  "- Tear-off to the decking",
  "- Synthetic underlayment",
  "- Hip and ridge shingles",
].join("\n");

const lines: EstimateLine[] = [
  {
    id: "line_1",
    estimateId: estimate.id,
    catalogItemId: null,
    title: "Roofing System",
    description,
    quantity: 1,
    unit: "LS",
    unitCost: 0,
    sortOrder: 0,
    groupName: "Scope of work",
    optional: false,
    selected: true,
    taxable: true,
    package: "",
    photoIds: [],
  },
];

const invoice: Invoice = {
  id: "inv_format",
  number: "INV-FORMAT",
  name: "9174 Shadowridge",
  clientId: null,
  jobId: null,
  estimateId: estimate.id,
  status: "draft",
  issuedAt: "2026-09-14",
  dueAt: "2026-10-14",
  notes: "",
  terms: "",
  shareToken: "invshare",
  qbStatus: "unsent",
};

const invoiceLines: InvoiceLine[] = [
  {
    id: "iline_1",
    invoiceId: invoice.id,
    description: `Roofing System\n\n${description}`,
    quantity: 1,
    unit: "LS",
    unitCost: 18450,
    sortOrder: 0,
  },
];

async function textFromPdf(blob: Blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const extracted = await extractText(buffer);
  const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  return pages.join("\n");
}

async function main() {
  const estimateText = await textFromPdf(
    await buildEstimatePdf({
      estimate,
      lines,
      company,
      customer: "Shawn Gregory",
    }),
  );
  assert.match(estimateText, /Roofing System/);
  assert.match(estimateText, /TAMKO Heritage/);
  assert.match(estimateText, /Tear-off to the decking/);
  assert.match(estimateText, /Synthetic underlayment/);
  assert.match(estimateText, /Hip and ridge shingles/);

  const invoiceText = await textFromPdf(
    await buildInvoicePdf({
      invoice,
      lines: invoiceLines,
      payments: [],
      company,
      customer: "Shawn Gregory",
    }),
  );
  assert.match(invoiceText, /Roofing System/);
  assert.match(invoiceText, /TAMKO Heritage/);
  assert.match(invoiceText, /Tear-off to the decking/);

  console.log("document-pdf format tests passed");
}

void main();
