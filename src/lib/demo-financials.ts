import { fillPayment } from "@/lib/job-financials";
import type { Expense } from "@/lib/types";

const RECEIPT_SHINGLES =
  "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80";
const RECEIPT_HARDWARE =
  "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80";
const RECEIPT_DUMPSTER =
  "https://images.unsplash.com/photo-1586486942853-8118c993e731?auto=format&fit=crop&w=1200&q=80";
const RECEIPT_CHECK =
  "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=1200&q=80";
const RECEIPT_CARD =
  "https://images.unsplash.com/photo-1556742111-a301076d9d18?auto=format&fit=crop&w=1200&q=80";

export const extraExpenses: Expense[] = [
  {
    id: "exp_alvarez_abc",
    number: "EXP-4001",
    jobId: "job_alvarez_roof",
    vendor: "ABC Supply — Denver",
    account: "materials",
    amount: 8420,
    incurredAt: "2026-08-17",
    method: "credit_card",
    memo: "Landmark shingles, ice-and-water, ridge. Card on the Northline HD account.",
    receiptUrl: RECEIPT_SHINGLES,
    receiptStoragePath: null,
    qbStatus: "not_in_qb",
    extractedByAi: true,
    createdAt: "2026-08-17T18:40:00.000Z",
    createdBy: "Tom Brennan",
  },
  {
    id: "exp_alvarez_dump",
    number: "EXP-4002",
    jobId: "job_alvarez_roof",
    vendor: "Front Range Roll-Off",
    account: "dumpsters",
    amount: 650,
    incurredAt: "2026-08-16",
    method: "check",
    memo: "30-yard for Park Hill tear-off. Check 4419.",
    receiptUrl: RECEIPT_DUMPSTER,
    receiptStoragePath: null,
    qbStatus: "entered",
    extractedByAi: false,
    createdAt: "2026-08-16T14:10:00.000Z",
    createdBy: "Nora Keene",
  },
  {
    id: "exp_alvarez_hd",
    number: "EXP-4003",
    jobId: "job_alvarez_roof",
    vendor: "Home Depot",
    account: "materials",
    amount: 186.42,
    incurredAt: "2026-08-18",
    method: "credit_card",
    memo: "Coil nails and drip edge. Same-day run during tear-off.",
    receiptUrl: RECEIPT_HARDWARE,
    receiptStoragePath: null,
    qbStatus: "not_in_qb",
    extractedByAi: true,
    createdAt: "2026-08-18T16:05:00.000Z",
    createdBy: "Tom Brennan",
  },
  {
    id: "exp_hart_sunbelt",
    number: "EXP-4004",
    jobId: "job_hart_water",
    vendor: "Sunbelt Rentals",
    account: "equipment_rental",
    amount: 1665,
    incurredAt: "2026-07-06",
    method: "ach",
    memo: "Dehus and air movers — 9 days. Billed to the Hart claim.",
    receiptUrl: RECEIPT_CARD,
    receiptStoragePath: null,
    qbStatus: "entered",
    extractedByAi: false,
    createdAt: "2026-07-06T12:00:00.000Z",
    createdBy: "Elena Voss",
  },
  {
    id: "exp_blake_cab",
    number: "EXP-4005",
    jobId: "job_blake_kitchen",
    vendor: "Crystal Cabinet Works",
    account: "materials",
    amount: 12480,
    incurredAt: "2026-08-11",
    method: "check",
    memo: "Cabinet deposit 50%. Balance on delivery.",
    receiptUrl: RECEIPT_CHECK,
    receiptStoragePath: null,
    qbStatus: "not_in_qb",
    extractedByAi: false,
    createdAt: "2026-08-11T15:20:00.000Z",
    createdBy: "Elena Voss",
  },
  {
    id: "exp_office_adobe",
    number: "EXP-4006",
    jobId: null,
    vendor: "USPS",
    account: "office",
    amount: 28.4,
    incurredAt: "2026-08-15",
    method: "debit",
    memo: "Certified mail — warranty packets. Overhead, not a job.",
    receiptUrl: RECEIPT_HARDWARE,
    receiptStoragePath: null,
    qbStatus: "not_in_qb",
    extractedByAi: true,
    createdAt: "2026-08-15T17:00:00.000Z",
    createdBy: "Nora Keene",
  },
  {
    id: "exp_bd_nari",
    number: "EXP-4007",
    jobId: null,
    vendor: "NARI Colorado",
    account: "office",
    amount: 420,
    incurredAt: "2026-08-08",
    method: "credit_card",
    memo: "Remodeler mixer — Priya. BD spend, not a job.",
    receiptUrl: RECEIPT_CARD,
    receiptStoragePath: null,
    qbStatus: "not_in_qb",
    extractedByAi: false,
    createdAt: "2026-08-08T21:00:00.000Z",
    createdBy: "Priya Shah",
  },
  {
    id: "exp_bd_ads",
    number: "EXP-4008",
    jobId: null,
    vendor: "Google Ads",
    account: "office",
    amount: 890,
    incurredAt: "2026-08-01",
    method: "credit_card",
    memo: "Storm / roof search ads — August. BD spend.",
    receiptUrl: RECEIPT_CARD,
    receiptStoragePath: null,
    qbStatus: "entered",
    extractedByAi: false,
    createdAt: "2026-08-01T12:00:00.000Z",
    createdBy: "Priya Shah",
  },
  {
    id: "exp_bd_chamber",
    number: "EXP-4009",
    jobId: null,
    vendor: "Cherry Creek Chamber",
    account: "office",
    amount: 65,
    incurredAt: "2026-08-12",
    method: "debit",
    memo: "Lunch with Kate Ruiz. Claire’s BD spend.",
    receiptUrl: RECEIPT_HARDWARE,
    receiptStoragePath: null,
    qbStatus: "not_in_qb",
    extractedByAi: false,
    createdAt: "2026-08-12T18:20:00.000Z",
    createdBy: "Claire Duvall",
  },
];

export const PAYMENT_RECEIPTS: Record<string, string> = {
  pay_r1: RECEIPT_CARD,
  pay_r2: RECEIPT_CHECK,
  pay_r3: RECEIPT_CARD,
  pay_r4: RECEIPT_CHECK,
  pay_r5: RECEIPT_CARD,
  pay_r6: RECEIPT_CARD,
  pay_r7: RECEIPT_CHECK,
};

export const PAYMENT_JOBS: Record<string, string> = {
  pay_r1: "job_hart_water",
  pay_r2: "job_whitfield_bsmt",
  pay_r3: "job_patel_roof",
  pay_r4: "job_nguyen_windows",
  pay_r5: "job_nash_deck",
  pay_r6: "job_copper_200",
  pay_r7: "job_alvarez_roof",
};

export function seedPaymentsFromExtra(
  payments: Array<{
    id: string;
    invoiceId: string;
    amount: number;
    method: string;
    paidAt: string;
    reference: string;
  }>,
) {
  return payments.map((payment) =>
    fillPayment({
      ...payment,
      jobId: PAYMENT_JOBS[payment.id] ?? null,
      receiptUrl: PAYMENT_RECEIPTS[payment.id] ?? RECEIPT_CHECK,
      qbStatus: payment.paidAt >= "2026-08-01" ? "not_in_qb" : "entered",
      createdBy: payment.paidAt >= "2026-08-01" ? "Elena Voss" : "Nora Keene",
    }),
  );
}
