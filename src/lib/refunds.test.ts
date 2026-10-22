import assert from "node:assert/strict";
import { fillPayment } from "./job-financials.ts";
import {
  cardFeeForRefund,
  jobRefundSnapshot,
  nextRefundNumber,
  paymentDetail,
  paymentHeading,
  paymentRefundBlock,
  refundApprovalChecks,
  refundDestinationLabel,
  refundDraftError,
  refundImpact,
  refundPayout,
  refundableRemaining,
  type RefundRequest,
} from "./refunds.ts";

function payment(patch: Parameters<typeof fillPayment>[0]) {
  return fillPayment(patch);
}

function refund(patch: Partial<RefundRequest> & Pick<RefundRequest, "id" | "paymentId" | "amount" | "status">): RefundRequest {
  return {
    number: "RF-0001",
    jobId: "job_1",
    full: true,
    reason: "deductible_returned",
    note: "",
    destination: "original",
    destinationLabel: "back to Visa ending 4242",
    feeAmount: 100,
    feeCoveredByCompany: true,
    attachmentName: "",
    attachmentUrl: "",
    requestedBy: "staff_brady",
    requestedByName: "Brady Jones",
    requestedAt: "2026-10-22T19:14:00.000Z",
    decidedBy: "",
    decidedByName: "",
    decidedAt: null,
    denyReason: "",
    processedAt: null,
    refundedAt: null,
    refundPaymentId: null,
    questions: [],
    updatedAt: "2026-10-22T19:14:00.000Z",
    ...patch,
  };
}

const card = payment({
  id: "pay_card",
  jobId: "job_1",
  amount: 2500,
  method: "credit_card",
  paidAt: "2026-10-20",
  reference: "Deductible payment Visa ending 4242",
  postingStatus: "posted",
});

const check = payment({
  id: "pay_check",
  jobId: "job_1",
  amount: 6200,
  method: "check",
  paidAt: "2026-10-21",
  reference: "10482 State Farm",
  postingStatus: "posted",
});

assert.equal(nextRefundNumber([]), "RF-0001");
assert.equal(nextRefundNumber(["RF-0001", "RF-0009"]), "RF-0010");
assert.equal(paymentHeading(card), "Deductible payment");
assert.equal(paymentDetail(card), "Visa ending 4242 · Oct 20, 2026");
assert.equal(paymentHeading(check), "Check #10482");
assert.equal(paymentDetail(check), "Check · State Farm · Oct 21, 2026");
assert.equal(refundDestinationLabel(card, "original", "Antonio Perez"), "back to Visa ending 4242");
assert.equal(cardFeeForRefund(card, 2500), 100);
assert.equal(refundPayout(refund({ id: "r1", paymentId: card.id, amount: 2500, status: "requested" })), 2500);
assert.equal(
  refundPayout(refund({ id: "r1", paymentId: card.id, amount: 2500, status: "requested", feeCoveredByCompany: false })),
  2400,
);

const open = refund({ id: "r1", paymentId: card.id, amount: 2500, status: "requested" });
assert.equal(refundableRemaining(card, [open]), 0);
assert.equal(paymentRefundBlock(card, [open]), "A refund is already open on this payment.");
assert.equal(refundableRemaining(card, [{ ...open, status: "denied" }]), 2500);
assert.equal(refundDraftError({ payment: card, refunds: [], amount: 3000, reason: "overpayment", feeCoveredByCompany: true }), "Up to $2,500.00 can be refunded on this payment.");
assert.equal(refundDraftError({ payment: card, refunds: [], amount: 2500, reason: "deductible_returned", feeCoveredByCompany: true }), null);

const checks = refundApprovalChecks({
  payment: card,
  refund: open,
  refunds: [open],
  viewerStaffId: "staff_admin",
  viewerName: "Avery Admin",
});
assert.deepEqual(checks.map((item) => item.ok), [true, true, true, true]);

const own = refundApprovalChecks({
  payment: card,
  refund: open,
  refunds: [open],
  viewerStaffId: "staff_brady",
  viewerName: "Brady Jones",
});
assert.equal(own.find((item) => item.id === "someone-else")?.ok, false);

const pendingCard = payment({ ...card, id: "pay_pending", postingStatus: "pending" });
assert.equal(paymentRefundBlock(pendingCard, []), "This payment hasn't settled yet.");

const snapshot = jobRefundSnapshot({
  payments: [card, check],
  expenses: [],
  refunds: [open],
});
assert.equal(snapshot.collected, 8700);
assert.equal(snapshot.fees, 100);
assert.equal(snapshot.profit, 8600);
assert.equal(snapshot.pendingPayout, 2500);
assert.equal(snapshot.afterCollected, 6200);
assert.equal(snapshot.afterProfit, 6100);

const impact = refundImpact({
  payments: [card, check],
  expenses: [],
  refunds: [open],
  refund: open,
});
assert.equal(impact.collectedAfter, 6200);
assert.equal(impact.customerRefundAfter, 2500);
assert.equal(impact.profitDelta, -2500);

const deducted = refund({
  id: "r2",
  paymentId: card.id,
  amount: 2500,
  status: "requested",
  feeCoveredByCompany: false,
});
assert.equal(refundPayout(deducted), 2400);
assert.equal(
  refundImpact({ payments: [card], expenses: [], refunds: [deducted], refund: deducted }).profitDelta,
  -2400,
);
