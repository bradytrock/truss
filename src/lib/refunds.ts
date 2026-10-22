import { MERCHANT_FEE_RATE } from "@/lib/commission-closeout";
import { formatDate } from "@/lib/format";
import { isCardMethod, isPostedPayment, paymentMethodLabel, roundCents } from "@/lib/payment-posting";
import type { Expense, Payment } from "@/lib/types";

export const REFUND_REASONS = [
  ["deductible_returned", "Deductible returned"],
  ["overpayment", "Overpayment"],
  ["duplicate_charge", "Duplicate charge"],
  ["job_cancelled", "Job cancelled"],
  ["scope_reduced", "Scope reduced"],
  ["goodwill", "Goodwill / warranty"],
] as const;

export type RefundReason = (typeof REFUND_REASONS)[number][0];

export const REFUND_STATUSES = [
  "requested",
  "approved",
  "processing",
  "refunded",
  "denied",
  "withdrawn",
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

export type RefundDestination = "original" | "check";

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  requested: "Awaiting approval",
  approved: "Approved",
  processing: "Processing",
  refunded: "Refunded",
  denied: "Denied",
  withdrawn: "Withdrawn",
};

export const REFUND_PROGRESS = ["Requested", "Approved", "Processing", "Refunded"] as const;

export interface RefundQuestion {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface RefundRequest {
  id: string;
  number: string;
  jobId: string;
  paymentId: string;
  amount: number;
  full: boolean;
  reason: string;
  note: string;
  destination: RefundDestination;
  destinationLabel: string;
  feeAmount: number;
  feeCoveredByCompany: boolean;
  attachmentName: string;
  attachmentUrl: string;
  status: RefundStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedBy: string;
  decidedByName: string;
  decidedAt: string | null;
  denyReason: string;
  processedAt: string | null;
  refundedAt: string | null;
  refundPaymentId: string | null;
  questions: RefundQuestion[];
  updatedAt: string;
}

const ZONE = "America/Chicago";

export function canProcessRefunds(role: string | null | undefined) {
  return role === "company_admin" || role === "accountant";
}

export function parseRefundStatus(value: string | null | undefined): RefundStatus {
  return REFUND_STATUSES.includes(value as RefundStatus) ? (value as RefundStatus) : "requested";
}

export function parseRefundDestination(value: string | null | undefined): RefundDestination {
  return value === "check" ? "check" : "original";
}

export function refundReasonLabel(reason: string) {
  return REFUND_REASONS.find((item) => item[0] === reason)?.[1] ?? (reason.trim() || "Refund");
}

export function isOpenRefund(refund: Pick<RefundRequest, "status">) {
  return refund.status === "requested" || refund.status === "approved" || refund.status === "processing";
}

export function isRefundablePayment(payment: Pick<Payment, "amount" | "method">) {
  return payment.amount > 0 && !/refund/i.test(payment.method);
}

export function nextRefundNumber(existing: string[]) {
  const max = existing.reduce((current, value) => {
    const match = value.match(/(\d+)$/);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `RF-${String(max + 1).padStart(4, "0")}`;
}

export function cardLast4(payment: Pick<Payment, "method" | "reference">) {
  const reference = payment.reference ?? "";
  const ending = reference.match(/ending\s+(\d{4})\b/i);
  if (ending?.[1]) return ending[1];
  const branded = reference.match(/\b(?:visa|mastercard|amex|discover)\s+(\d{4})\b/i);
  if (branded?.[1]) return branded[1];
  if (isCardMethod(payment.method)) {
    const tail = reference.match(/(\d{4})\s*$/);
    if (tail?.[1]) return tail[1];
  }
  return null;
}

export function cardBrand(payment: Pick<Payment, "reference">) {
  const reference = payment.reference.toLowerCase();
  if (reference.includes("visa")) return "Visa";
  if (reference.includes("mastercard") || reference.includes("master card")) return "Mastercard";
  if (reference.includes("amex") || reference.includes("american express")) return "Amex";
  if (reference.includes("discover")) return "Discover";
  return "Card";
}

export function paymentHeading(payment: Payment) {
  const reference = payment.reference.trim();
  if (isCardMethod(payment.method)) {
    if (/deductible/i.test(reference)) return "Deductible payment";
    const named = reference
      .replace(/\b(visa|mastercard|amex|american express|discover|card|ending)\b/gi, "")
      .replace(/\d{4,}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (named.length > 2) return named;
    return "Card payment";
  }
  const number = reference.match(/\b(\d{3,})\b/)?.[1];
  const method = payment.method.trim().toLowerCase();
  if (method === "insurance" || /\binsurance\b/i.test(reference)) {
    return number ? `Insurance check #${number}` : "Insurance check";
  }
  if (method === "check") return number ? `Check #${number}` : "Check";
  if (reference && /[a-z]/i.test(reference)) return reference;
  return paymentMethodLabel(payment.method);
}

export function paymentDetail(payment: Payment) {
  const date = formatDate(payment.paidAt);
  if (isCardMethod(payment.method)) {
    const last4 = cardLast4(payment);
    const brand = cardBrand(payment);
    return last4 ? `${brand} ending ${last4} · ${date}` : `${paymentMethodLabel(payment.method)} · ${date}`;
  }
  const method =
    payment.method.trim().toLowerCase() === "insurance" ? "Check" : paymentMethodLabel(payment.method);
  const words = payment.reference
    .replace(/#/g, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/\b(check|insurance|payment)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [method, words, date].filter(Boolean).join(" · ");
}

export function cardFeeForRefund(payment: Pick<Payment, "method">, amount: number) {
  if (!isCardMethod(payment.method) || amount <= 0) return 0;
  return roundCents(amount * MERCHANT_FEE_RATE);
}

/** Cash the customer receives. The processor fee stays a company cost unless it is deducted here. */
export function refundPayout(refund: Pick<RefundRequest, "amount" | "feeAmount" | "feeCoveredByCompany">) {
  if (refund.feeCoveredByCompany) return roundCents(refund.amount);
  return roundCents(Math.max(0, refund.amount - refund.feeAmount));
}

export function refundDestinationLabel(
  payment: Payment,
  destination: RefundDestination,
  customerName: string,
) {
  if (destination === "check") {
    return customerName.trim() ? `by check to ${customerName.trim()}` : "by check";
  }
  if (isCardMethod(payment.method)) {
    const last4 = cardLast4(payment);
    const brand = cardBrand(payment);
    return last4 ? `back to ${brand} ending ${last4}` : `back to the ${brand.toLowerCase()}`;
  }
  return `back to the original ${paymentMethodLabel(payment.method).toLowerCase()}`;
}

/** Face value still available on a payment, ignoring denied and withdrawn requests. */
export function refundableRemaining(payment: Payment, refunds: RefundRequest[], exceptId?: string) {
  const reserved = refunds
    .filter(
      (refund) =>
        refund.paymentId === payment.id &&
        refund.id !== exceptId &&
        refund.status !== "denied" &&
        refund.status !== "withdrawn",
    )
    .reduce((sum, refund) => sum + refund.amount, 0);
  return roundCents(Math.max(0, payment.amount - reserved));
}

export function paymentRefundBlock(payment: Payment, refunds: RefundRequest[]) {
  if (!isRefundablePayment(payment)) return "This isn't a payment that can be refunded.";
  if (!isPostedPayment(payment)) return "This payment hasn't settled yet.";
  if (refunds.some((refund) => refund.paymentId === payment.id && isOpenRefund(refund))) {
    return "A refund is already open on this payment.";
  }
  if (refundableRemaining(payment, refunds) <= 0) return "Nothing left to refund on this payment.";
  return null;
}

export function refundDraftError(input: {
  payment: Payment | null;
  refunds: RefundRequest[];
  amount: number;
  reason: string;
  feeCoveredByCompany: boolean;
}) {
  if (!input.payment) return "Choose the payment to refund.";
  const blocked = paymentRefundBlock(input.payment, input.refunds);
  if (blocked) return blocked;
  if (!input.reason.trim()) return "Choose a reason.";
  const cap = refundableRemaining(input.payment, input.refunds);
  if (!(input.amount > 0)) return "Enter how much to refund.";
  if (input.amount > cap + 0.001) {
    return `Up to ${cap.toLocaleString("en-US", { style: "currency", currency: "USD" })} can be refunded on this payment.`;
  }
  const fee = cardFeeForRefund(input.payment, input.amount);
  if (!input.feeCoveredByCompany && fee >= input.amount) {
    return "The card fee is the whole refund. Cover the fee, or refund more.";
  }
  return null;
}

export function refundStepIndex(status: RefundStatus) {
  if (status === "requested") return 0;
  if (status === "approved") return 1;
  if (status === "processing") return 2;
  if (status === "refunded") return 3;
  return -1;
}

export function refundWhen(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ZONE });
  const dayKey = (value: Date) =>
    value.toLocaleDateString("en-US", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const day = dayKey(date);
  if (day === dayKey(now)) return `today at ${time}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (day === dayKey(yesterday)) return `yesterday at ${time}`;
  const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ZONE });
  return `${label} at ${time}`;
}

export function refundWaitingCopy(status: RefundStatus) {
  if (status === "requested") return "waiting on Accounting";
  if (status === "approved") return "approved, and Accounting still has to send it";
  if (status === "processing") return "processing with the bank";
  if (status === "refunded") return "refunded";
  if (status === "denied") return "denied";
  return "withdrawn";
}

export function refundCloseoutNote(status: string | null | undefined) {
  if (!status || status === "returned") {
    return "Commission closeout isn't submitted, so there's nothing to claw back.";
  }
  if (status === "payout") {
    return "Commission payout is already marked. Claw this refund back before that check goes out.";
  }
  return "This job is in commission closeout. Claw the refund back on that sheet before commission is paid.";
}

export type RefundCheck = { id: string; label: string; ok: boolean };

export function refundApprovalChecks(input: {
  payment: Payment | null;
  refund: RefundRequest;
  refunds: RefundRequest[];
  viewerStaffId: string;
  viewerName: string;
}): RefundCheck[] {
  const payment = input.payment;
  const settled = Boolean(payment && isPostedPayment(payment) && payment.amount > 0);
  const card = Boolean(payment && isCardMethod(payment.method));
  const others = input.refunds.filter(
    (refund) => refund.paymentId === input.refund.paymentId && refund.id !== input.refund.id && isOpenRefund(refund),
  );
  const cap = payment ? refundableRemaining(payment, input.refunds, input.refund.id) : 0;
  const within = Boolean(payment) && input.refund.amount > 0 && input.refund.amount <= cap + 0.001;
  const self =
    (input.viewerStaffId && input.viewerStaffId === input.refund.requestedBy) ||
    (input.viewerName.trim() && input.viewerName.trim() === input.refund.requestedByName.trim());
  const money = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return [
    {
      id: "settled",
      ok: settled,
      label: card ? "Payment has settled with the processor" : "Payment is recorded on the job",
    },
    {
      id: "alone",
      ok: others.length === 0,
      label: "No other open refund on this payment",
    },
    {
      id: "amount",
      ok: within,
      label: `Within the refundable amount (${money(input.refund.amount)} of ${money(cap)})`,
    },
    {
      id: "someone-else",
      ok: !self,
      label: self
        ? "You requested this — someone else has to approve it"
        : "Requested by someone else — you can approve it",
    },
  ];
}

export function postedRefundTotals(payments: Payment[], expenses: Expense[], refunds: RefundRequest[]) {
  const posted = payments.filter((payment) => isPostedPayment(payment));
  const received = roundCents(
    posted.filter((payment) => payment.amount > 0 && !/refund/i.test(payment.method)).reduce((sum, payment) => sum + payment.amount, 0),
  );
  const refunded = roundCents(
    refunds.filter((refund) => refund.status === "refunded").reduce((sum, refund) => sum + refundPayout(refund), 0),
  );
  const fees = roundCents(
    posted
      .filter((payment) => payment.amount > 0 && isCardMethod(payment.method))
      .reduce((sum, payment) => sum + payment.amount * MERCHANT_FEE_RATE, 0),
  );
  const expenseTotal = roundCents(expenses.reduce((sum, expense) => sum + expense.amount, 0));
  const collected = roundCents(received - refunded);
  const profit = roundCents(collected - fees - expenseTotal);
  return { received, refunded, fees, expenseTotal, collected, profit };
}

export function jobRefundSnapshot(input: {
  payments: Payment[];
  expenses: Expense[];
  refunds: RefundRequest[];
}) {
  const base = postedRefundTotals(input.payments, input.expenses, input.refunds);
  const pendingPayout = roundCents(
    input.refunds.filter(isOpenRefund).reduce((sum, refund) => sum + refundPayout(refund), 0),
  );
  return {
    ...base,
    pendingPayout,
    afterCollected: roundCents(base.collected - pendingPayout),
    afterProfit: roundCents(base.profit - pendingPayout),
    afterCustomerRefund: roundCents(base.refunded + pendingPayout),
  };
}

export function refundImpact(input: {
  payments: Payment[];
  expenses: Expense[];
  refunds: RefundRequest[];
  refund: RefundRequest;
}) {
  const base = postedRefundTotals(input.payments, input.expenses, input.refunds);
  const payout = refundPayout(input.refund);
  return {
    ...base,
    payout,
    collectedAfter: roundCents(base.collected - payout),
    customerRefundAfter: roundCents(base.refunded + payout),
    profitDelta: roundCents(-payout),
  };
}

export function parseRefundQuestions(value: unknown): RefundQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const body = typeof row.body === "string" ? row.body.trim() : "";
    if (!body) return [];
    return [
      {
        id: typeof row.id === "string" && row.id ? row.id : `q-${index}`,
        authorId: typeof row.authorId === "string" ? row.authorId : "",
        authorName: typeof row.authorName === "string" ? row.authorName : "",
        body,
        createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
      },
    ];
  });
}

export function refundRequestPayload(row: RefundRequest, companyId: string) {
  return {
    id: row.id,
    company_id: companyId,
    job_id: row.jobId,
    payment_id: row.paymentId,
    number: row.number,
    amount: row.amount,
    fee_amount: row.feeAmount,
    fee_covered_by_company: row.feeCoveredByCompany,
    full_refund: row.full,
    reason: row.reason,
    note: row.note,
    destination: row.destination,
    destination_label: row.destinationLabel,
    attachment_name: row.attachmentName,
    attachment_url: row.attachmentUrl,
    status: row.status,
    requested_by: row.requestedBy,
    requested_by_name: row.requestedByName,
    requested_at: row.requestedAt,
    decided_by: row.decidedBy,
    decided_by_name: row.decidedByName,
    decided_at: row.decidedAt,
    deny_reason: row.denyReason,
    processed_at: row.processedAt,
    refunded_at: row.refundedAt,
    refund_payment_id: row.refundPaymentId,
    questions: row.questions,
    updated_at: row.updatedAt,
  };
}
