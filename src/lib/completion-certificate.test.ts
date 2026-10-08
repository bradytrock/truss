import assert from "node:assert/strict";
import { extractText } from "unpdf";
import {
  completionCertificateDateLabel,
  completionCertificateDraft,
  completionCertificateFilename,
  completionCertificateStatement,
} from "./completion-certificate.ts";
import { buildCompletionCertificatePdf } from "./completion-certificate-pdf.ts";
import type { CompanySettings, Job } from "./types.ts";

const company: CompanySettings = {
  name: "T-Rock Roofing",
  slug: "t-rock",
  phone: "2145550100",
  email: "office@example.com",
  website: "",
  street: "1 Main",
  city: "Dallas",
  state: "TX",
  postalCode: "75201",
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
    substantialCompletion: null,
    superintendent: "",
    projectManager: "",
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

const drafted = completionCertificateDraft({
  job: job(),
  customerName: "Maria Alvarez",
  company,
  preparedBy: "Brady",
  today: "2026-10-08",
  estimates: [
    {
      id: "est_old",
      status: "accepted",
      acceptedAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
      signatureName: "Older Signer",
      archivedAt: "2026-09-02T00:00:00.000Z",
    },
    {
      id: "est_declined",
      status: "declined",
      acceptedAt: null,
      createdAt: "2026-09-20T00:00:00.000Z",
      signatureName: "No",
      archivedAt: null,
    },
    {
      id: "est_1",
      status: "accepted",
      acceptedAt: "2026-09-15T00:00:00.000Z",
      createdAt: "2026-09-10T00:00:00.000Z",
      signatureName: "Maria Alvarez",
      archivedAt: null,
    },
  ],
  estimateLines: [
    { estimateId: "est_1", title: "Tear-off", optional: false, selected: true, sortOrder: 0 },
    { estimateId: "est_1", title: "Optional ridge vent", optional: true, selected: false, sortOrder: 2 },
    { estimateId: "est_1", title: "Architectural shingles", optional: false, selected: true, sortOrder: 1 },
    { estimateId: "est_old", title: "Should not appear", optional: false, selected: true, sortOrder: 0 },
  ],
});

assert.equal(drafted.ownerName, "Maria Alvarez");
assert.equal(drafted.propertyAddress, "4418 E 32nd Ave, Denver, CO 80207");
assert.equal(drafted.jobCode, "BT-104");
assert.equal(drafted.startDate, "2026-09-22");
assert.equal(drafted.completionDate, "2026-10-08");
assert.equal(drafted.contractAmount, "$12,400.00");
assert.equal(drafted.licenseNumber, "RCAT-100");
assert.equal(drafted.phone, "(214) 555-0100");
assert.equal(drafted.scope, "- Tear-off\n- Architectural shingles");
assert.equal(drafted.ownerSignature, "Maria Alvarez");
assert.equal(drafted.contractorSignature, "Brady");
assert.equal(completionCertificateDateLabel(drafted.completionDate), "Oct 8, 2026");
assert.match(completionCertificateStatement(drafted), /Maria Alvarez/);
assert.match(completionCertificateStatement(drafted), /Oct 8, 2026/);
assert.equal(completionCertificateFilename("Alvarez / roof"), "Alvarez roof certificate of completion.pdf");
assert.equal(completionCertificateFilename("   "), "Job certificate of completion.pdf");

const described = completionCertificateDraft({
  job: job({ description: "Replaced the field and flashed the chimney.", contractValue: 0, trades: [] }),
  customerName: "Maria Alvarez",
  company,
  preparedBy: "Brady",
  today: "2026-10-08",
  estimates: [],
  estimateLines: [
    { estimateId: "est_1", title: "Tear-off", optional: false, selected: true, sortOrder: 0 },
  ],
});
assert.equal(described.scope, "Replaced the field and flashed the chimney.");
assert.equal(described.contractAmount, "");
assert.equal(described.ownerSignature, "");

const tradeOnly = completionCertificateDraft({
  job: job({ description: "  ", trades: ["gutters", "roofing"], substantialCompletion: "2026-10-01T15:00:00.000Z" }),
  customerName: "",
  company: { ...company, licenseNumber: "" },
  preparedBy: "Brady",
  today: "2026-10-08",
});
assert.equal(tradeOnly.scope, "Roofing, Gutters");
assert.equal(tradeOnly.completionDate, "2026-10-01");
assert.equal(tradeOnly.ownerName, "");
assert.equal(completionCertificateStatement(tradeOnly).startsWith("This certifies that the work described above was completed for the property owner"), true);

async function textFromPdf(blob: Blob) {
  const extracted = await extractText(new Uint8Array(await blob.arrayBuffer()));
  const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  return pages.join("\n");
}

const pdf = await buildCompletionCertificatePdf({ certificate: drafted, company });
const text = await textFromPdf(pdf);
assert.match(text, /CERTIFICATE OF COMPLETION/);
assert.match(text, /Maria Alvarez/);
assert.match(text, /4418 E 32nd Ave/);
assert.match(text, /Tear-off/);
assert.match(text, /Architectural shingles/);
assert.match(text, /RCAT-100/);
assert.doesNotMatch(text, /Optional ridge vent/);
assert.doesNotMatch(text, /Should not appear/);

const longScope = [
  "StartScopeMarker",
  ...Array.from({ length: 70 }, (_, index) => `Scope line ${index + 1} synthetic underlayment and drip edge.`),
  "LastScopeMarker",
].join("\n");
const longPdf = await buildCompletionCertificatePdf({
  certificate: { ...drafted, scope: longScope, notes: "Keep the chimney cricket." },
  company,
});
const longText = await textFromPdf(longPdf);
assert.match(longText, /StartScopeMarker/);
assert.match(longText, /LastScopeMarker/);
assert.match(longText, /Keep the chimney cricket/);
assert.match(longText, /Scope line 70/);

console.log("completion certificate tests passed");
