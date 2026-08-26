import {
  checkAddXml,
  creditCardChargeAddXml,
  customerAddXml,
  customerQueryXml,
  invoiceAddXml,
  itemQueryXml,
  itemServiceAddXml,
  readQbResponse,
  receivePaymentAddXml,
  vendorAddXml,
  vendorQueryXml,
} from "@/lib/qbwc/qbxml";
import {
  customerFullName,
  jobFullName,
  paymentCustomerRef,
  type QbwcStep,
  type QbwcWork,
} from "@/lib/qbwc/work";

function recordId(work: QbwcWork) {
  if (work.kind === "expense") return work.expenseId;
  if (work.kind === "payment") return work.paymentId;
  return work.invoiceId;
}

export function requestForStep(step: QbwcStep, work: QbwcWork) {
  const requestId = `${recordId(work)}-${step}`;
  switch (step) {
    case "customer_query":
      return customerQueryXml(customerFullName(work), requestId);
    case "customer_add":
      return customerAddXml({
        requestId,
        name: customerFullName(work),
        phone: work.kind === "payment" ? "" : work.phone,
        street: work.kind === "payment" ? "" : work.street,
        city: work.kind === "payment" ? "" : work.city,
        state: work.kind === "payment" ? "" : work.state,
        postalCode: work.kind === "payment" ? "" : work.postalCode,
      });
    case "job_query":
      return customerQueryXml(jobFullName(work), requestId);
    case "job_add":
      return customerAddXml({
        requestId,
        name: work.jobCode || work.jobName || "Job",
        parentFullName: customerFullName(work),
        companyName: work.jobName,
        street: work.kind === "payment" ? "" : work.street,
        city: work.kind === "payment" ? "" : work.city,
        state: work.kind === "payment" ? "" : work.state,
        postalCode: work.kind === "payment" ? "" : work.postalCode,
      });
    case "item_query":
      return itemQueryXml(work.kind === "invoice" ? work.itemName : "Contract work", requestId);
    case "item_add":
      return itemServiceAddXml(work.kind === "invoice" ? work.itemName : "Contract work", requestId);
    case "invoice_add":
      if (work.kind !== "invoice") return customerQueryXml("Homeowner", requestId);
      return invoiceAddXml({
        requestId,
        customerJobFullName: jobFullName(work),
        refNumber: work.number,
        txnDate: work.issuedAt,
        dueDate: work.dueAt,
        memo: work.name,
        itemName: work.itemName,
        street: work.street,
        city: work.city,
        state: work.state,
        postalCode: work.postalCode,
        lines: work.lines,
      });
    case "vendor_query":
      return vendorQueryXml(work.kind === "expense" ? work.vendor : "Vendor", requestId);
    case "vendor_add":
      return vendorAddXml(work.kind === "expense" ? work.vendor : "Vendor", requestId);
    case "expense_add":
      return expenseRequest(requestId, work);
    case "payment_add":
      if (work.kind !== "payment") return customerQueryXml("Homeowner", requestId);
      return receivePaymentAddXml({
        requestId,
        customerName: paymentCustomerRef(work),
        txnDate: work.txnDate,
        refNumber: work.reference,
        amount: work.amount,
        memo: work.memo || work.invoiceNumber,
        depositAccount: work.depositAccount,
        invoiceTxnId: work.invoiceTxnId,
      });
  }
}

function expenseRequest(requestId: string, work: QbwcWork) {
  if (work.kind !== "expense") return vendorQueryXml("Vendor", requestId);
  const line = {
    requestId,
    vendor: work.vendor,
    refNumber: work.number,
    txnDate: work.txnDate,
    memo: work.memo || work.number,
    accountName: work.accountName,
    amount: work.amount,
    customerJobFullName: work.hasJob ? jobFullName(work) : "",
  };
  if (work.payWith === "credit_card") {
    return creditCardChargeAddXml({ ...line, ccAccount: work.payAccount });
  }
  return checkAddXml({ ...line, bankAccount: work.payAccount });
}

export type StepAdvance =
  | { action: "next"; step: QbwcStep }
  | { action: "complete"; txnId: string }
  | { action: "fail"; error: string };

export function advanceFromResponse(
  step: QbwcStep,
  responseXml: string,
  fallbackMessage = "",
  work?: QbwcWork | null,
): StepAdvance {
  const result = readQbResponse(responseXml, fallbackMessage);
  const failed = result.statusMessage || `QuickBooks status ${result.statusCode}`;
  if (result.kind === "error") {
    return { action: "fail", error: failed };
  }
  const missing = result.kind === "missing";
  switch (step) {
    case "vendor_query":
      return { action: "next", step: missing ? "vendor_add" : afterVendor(work) };
    case "vendor_add":
      return missing ? { action: "fail", error: failed } : { action: "next", step: afterVendor(work) };
    case "customer_query":
      return { action: "next", step: missing ? "customer_add" : afterCustomer(work) };
    case "customer_add":
      return missing ? { action: "fail", error: failed } : { action: "next", step: afterCustomer(work) };
    case "job_query":
      return { action: "next", step: missing ? "job_add" : afterJob(work) };
    case "job_add":
      return missing ? { action: "fail", error: failed } : { action: "next", step: afterJob(work) };
    case "item_query":
      return { action: "next", step: missing ? "item_add" : "invoice_add" };
    case "item_add":
      return missing ? { action: "fail", error: failed } : { action: "next", step: "invoice_add" };
    case "invoice_add":
    case "expense_add":
    case "payment_add":
      return missing ? { action: "fail", error: failed } : { action: "complete", txnId: result.txnId };
  }
}

function afterVendor(work?: QbwcWork | null): QbwcStep {
  return work?.kind === "expense" && work.hasJob ? "customer_query" : "expense_add";
}

function afterCustomer(work?: QbwcWork | null): QbwcStep {
  if (work?.kind === "payment") return work.hasJob ? "job_query" : "payment_add";
  if (work?.kind === "expense") return work.hasJob ? "job_query" : "expense_add";
  return "job_query";
}

function afterJob(work?: QbwcWork | null): QbwcStep {
  if (work?.kind === "expense") return "expense_add";
  if (work?.kind === "payment") return "payment_add";
  return "item_query";
}

export const INVOICE_PREVIEW_STEPS: QbwcStep[] = [
  "customer_query",
  "customer_add",
  "job_query",
  "job_add",
  "item_query",
  "item_add",
  "invoice_add",
];

export const STEP_LABELS: Record<QbwcStep, string> = {
  customer_query: "Find the customer in QuickBooks",
  customer_add: "Create the customer",
  job_query: "Find the job under that customer",
  job_add: "Create the job (Customer:Job)",
  item_query: "Find the income item",
  item_add: "Create the income item",
  invoice_add: "Add the invoice on that job",
  vendor_query: "Find the vendor in QuickBooks",
  vendor_add: "Create the vendor",
  expense_add: "Add the check or credit card charge",
  payment_add: "Receive the payment against the invoice",
};
