import type { Payment, PaymentPostingStatus } from "@/lib/types";

export const PAYMENT_POSTING_STATUSES = ["pending", "posted", "rejected"] as const;
export type { PaymentPostingStatus };

export function parsePaymentPostingStatus(value: string | null | undefined): PaymentPostingStatus {
  if (value === "pending" || value === "rejected") return value;
  return "posted";
}

export function isPostedPayment(payment: Pick<Payment, "postingStatus">) {
  return parsePaymentPostingStatus(payment.postingStatus) === "posted";
}

export function isPendingPayment(payment: Pick<Payment, "postingStatus">) {
  return parsePaymentPostingStatus(payment.postingStatus) === "pending";
}

export function postedPayments(payments: Payment[]) {
  return payments.filter(isPostedPayment);
}

export function pendingCardPayments(payments: Payment[]) {
  return payments.filter((payment) => isPendingPayment(payment) && isCardMethod(payment.method));
}

export function isCardMethod(method: string) {
  return /^(card|stripe|credit_card)$/i.test(method.trim());
}

export function paymentsOnInvoice(invoiceId: string, payments: Payment[]) {
  return payments.filter((payment) => payment.invoiceId === invoiceId);
}

export function paymentsOnEstimate(estimateId: string, payments: Payment[]) {
  return payments.filter((payment) => payment.estimateId === estimateId);
}

/** Posted cash applied to the invoice. Pending card does not reduce books. */
export function postedPaidOnInvoice(invoiceId: string, payments: Payment[]) {
  return paymentsOnInvoice(invoiceId, payments)
    .filter(isPostedPayment)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function pendingCardOnInvoice(invoiceId: string, payments: Payment[]) {
  return paymentsOnInvoice(invoiceId, payments)
    .filter(isPendingPayment)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

/** Pending or posted payments already counted toward an estimate deposit. */
export function collectedTowardDeposit(estimateId: string, payments: Payment[]) {
  return paymentsOnEstimate(estimateId, payments)
    .filter((payment) => isPendingPayment(payment) || isPostedPayment(payment))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

/** How much is still collectible by card (posted balance minus pending card). */
export function cardPayRemaining(postedBalance: number, pendingCard: number) {
  return Math.max(0, roundCents(postedBalance) - roundCents(pendingCard));
}

export function roundCents(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function paymentMethodLabel(method: string) {
  const key = method.trim().toLowerCase();
  if (key === "card" || key === "stripe" || key === "credit_card") return "Card";
  if (key === "ach") return "ACH";
  if (key === "check") return "Check";
  if (key === "wire") return "Wire";
  if (key === "cash") return "Cash";
  if (key === "zelle") return "Zelle";
  if (key === "venmo") return "Venmo";
  if (key === "cashapp" || key === "cash_app") return "Cash App";
  if (key === "paypal") return "PayPal";
  return method.trim() || "Payment";
}
