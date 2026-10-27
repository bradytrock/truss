import assert from "node:assert/strict";
import { extractText } from "unpdf";
import { buildCommissionSheet } from "./commission-closeout.ts";
import { buildCloseoutPdf } from "./commission-closeout-pdf.ts";
import type { CompanySettings, ForecastedExpense, Job, Payment } from "./types.ts";

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
  licenseNumber: "",
};

function job(): Job {
  return {
    id: "job_1",
    code: "RK100126-1",
    opportunityId: null,
    name: "Keller roof",
    clientId: "client_1",
    primaryContactId: "contact_1",
    status: "punch",
    contractValue: 10000,
    startDate: "2026-09-01",
    substantialCompletion: "2026-10-01",
    superintendent: "",
    projectManager: "Ada Lopez",
    location: "100 Main St, Keller, TX",
    ownerStaffId: "staff_1",
    description: "",
    tags: [],
    street: "100 Main St",
    city: "Keller",
    state: "TX",
    postalCode: "76248",
    salesRep: "Sam Lead",
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

function payment(): Payment {
  return {
    id: "p1",
    invoiceId: null,
    jobId: "job_1",
    amount: 1000,
    method: "credit_card",
    paidAt: "2026-10-01",
    reference: "",
    receiptUrl: "",
    receiptStoragePath: null,
    qbStatus: "entered",
    createdBy: "",
    postingStatus: "posted",
  };
}

function forecast(index: number): ForecastedExpense {
  return {
    id: `fest_${index}`,
    number: `FEST-${index}`,
    jobId: "job_1",
    vendor: `Crew ${String(index).padStart(2, "0")}`,
    account: "labor",
    amount: 10,
    expectedAt: "2026-10-15",
    memo: "",
    createdAt: "2026-10-01",
    createdBy: "",
  };
}

const sheet = buildCommissionSheet({
  job: job(),
  contact: {
    id: "contact_1",
    name: "Keller Homeowner",
    clientId: "client_1",
    email: "home@example.com",
    phone: "2145550199",
    title: "",
    isReferralPartner: false,
    referralPartnerId: null,
    ownerStaffId: null,
    tags: [],
    street: "",
    city: "",
    state: "",
    postalCode: "",
    notes: "",
  },
  payments: [payment()],
  expenses: [],
  forecasts: Array.from({ length: 40 }, (_, index) => forecast(index + 1)),
  qbLines: [
    {
      id: "qb1",
      vendor: "ABC Supply",
      amount: 80,
      txnId: "TXN-9",
      invoiceNumber: "100",
      incurredAt: "2026-10-01",
      expenseId: "e1",
    },
    {
      id: "qb2",
      vendor: "Beacon",
      amount: 75,
      txnId: "TXN-2",
      invoiceNumber: "",
      incurredAt: "2026-10-02",
      expenseId: null,
    },
  ],
});

async function textFromPdf(blob: Blob) {
  const extracted = await extractText(new Uint8Array(await blob.arrayBuffer()));
  const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  return pages.join("\n");
}

const pdf = await buildCloseoutPdf({
  sheet,
  company,
  closeout: {
    id: "closeout_1",
    jobId: "job_1",
    status: "submitted",
    submittedBy: "staff_1",
    submittedByName: "Ada Lopez",
    submittedAt: "2026-10-02T00:00:00.000Z",
    accountingNote: "Hold the warranty check.",
    reviewedBy: "",
    reviewedByName: "",
    reviewedAt: null,
    releasedToStaffId: "",
    releasedToName: "",
    payoutMarkedBy: "",
    payoutMarkedByName: "",
    payoutMarkedAt: null,
    qbLines: [],
    splits: [],
    varianceAck: false,
    notes: "Homeowner paid the deductible.",
    expenseAdjustments: [],
    ventPhotoIds: [],
    ventNote: "No vent pipes on this roof.",
    ventCompliant: false,
    updatedAt: "2026-10-02T00:00:00.000Z",
  },
});
const text = await textFromPdf(pdf);
assert.match(text, /Closeout/);
assert.match(text, /RK100126-1/);
assert.match(text, /Keller Homeowner/);
assert.match(text, /Ada Lopez/);
assert.match(text, /1st payment/);
assert.match(text, /Merchant fees 4%/);
assert.match(text, /Dwelling/);
assert.match(text, /ISOW/);
assert.match(text, /Crew 01/);
assert.match(text, /Crew 40/);
assert.match(text, /FORECASTED/);
assert.match(text, /Project manager/);
assert.match(text, /Warranty fund/);
assert.match(text, /Beacon/);
assert.match(text, /QuickBooks only/);
assert.match(text, /Hold the warranty check/);
assert.match(text, /Homeowner paid the deductible/);
assert.match(text, /T-Rock Roofing/);

console.log("closeout pdf tests passed");
