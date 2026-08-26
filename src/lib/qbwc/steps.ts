import {
  checkAddXml,
  creditCardChargeAddXml,
  customerAddXml,
  customerAliasName,
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
  billedCustomerName,
  customerFullName,
  jobFullName,
  paymentCustomerRef,
  splitQbwcStep,
  taggedQbwcStep,
  type QbwcStep,
  type QbwcWork,
} from "@/lib/qbwc/work";

function recordId(work: QbwcWork) {
  if (work.kind === "expense") return work.expenseId;
  if (work.kind === "payment") return work.paymentId;
  return work.invoiceId;
}

export function requestForStep(rawStep: string, work: QbwcWork) {
  const { step, useAlias } = splitQbwcStep(rawStep);
  const requestId = `${recordId(work)}-${step}`;
  const customer = billedCustomerName(work, useAlias);
  const job = jobFullName(work, useAlias);
  const alias = customerAliasName(customerFullName(work));
  switch (step) {
    case "customer_query":
      return customerQueryXml(customerFullName(work), requestId);
    case "customer_add":
      return customerAddXml({
        requestId,
        name: customerFullName(work),
        ...customerAddress(work),
      });
    case "customer_alias_query":
      return customerQueryXml(alias, requestId);
    case "customer_alias_add":
      return customerAddXml({
        requestId,
        name: alias,
        ...customerAddress(work),
      });
    case "job_query":
      return customerQueryXml(job, requestId);
    case "job_add":
      return customerAddXml({
        requestId,
        name: work.jobCode || work.jobName || "Job",
        parentFullName: customer,
        companyName: work.jobName,
        ...customerAddress(work),
      });
    case "item_query":
      return itemQueryXml(work.kind === "invoice" ? work.itemName : "Contract work", requestId);
    case "item_add":
      return itemServiceAddXml(work.kind === "invoice" ? work.itemName : "Contract work", requestId);
    case "invoice_add":
      if (work.kind !== "invoice") return customerQueryXml("Homeowner", requestId);
      return invoiceAddXml({
        requestId,
        customerJobFullName: job,
        customerListId: work.jobListId,
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
      return expenseRequest(requestId, work, useAlias);
    case "payment_add":
      if (work.kind !== "payment") return customerQueryXml("Homeowner", requestId);
      return receivePaymentAddXml({
        requestId,
        customerName: paymentCustomerRef(work, useAlias),
        customerListId: work.hasJob ? work.jobListId : work.customerListId,
        txnDate: work.txnDate,
        refNumber: work.reference,
        amount: work.amount,
        memo: work.memo || work.invoiceNumber,
        depositAccount: work.depositAccount,
        invoiceTxnId: work.invoiceTxnId,
      });
  }
}

function expenseRequest(requestId: string, work: QbwcWork, useAlias: boolean) {
  if (work.kind !== "expense") return vendorQueryXml("Vendor", requestId);
  const line = {
    requestId,
    vendor: work.vendor,
    refNumber: work.number,
    txnDate: work.txnDate,
    memo: work.memo || work.number,
    accountName: work.accountName,
    amount: work.amount,
    customerJobFullName: work.hasJob ? jobFullName(work, useAlias) : "",
    customerListId: work.hasJob ? work.jobListId : undefined,
  };
  if (work.payWith === "credit_card") {
    return creditCardChargeAddXml({ ...line, ccAccount: work.payAccount });
  }
  return checkAddXml({ ...line, bankAccount: work.payAccount });
}

function customerAddress(work: QbwcWork) {
  if (work.kind === "payment") {
    return { phone: "", street: "", city: "", state: "", postalCode: "" };
  }
  return {
    phone: work.phone,
    street: work.street,
    city: work.city,
    state: work.state,
    postalCode: work.postalCode,
  };
}

export type StepAdvance =
  | {
      action: "next";
      step: string;
      customerName?: string;
      customerListId?: string;
      jobListId?: string;
    }
  | { action: "complete"; txnId: string }
  | { action: "fail"; error: string };

export function advanceFromResponse(
  rawStep: string,
  responseXml: string,
  fallbackMessage = "",
  work?: QbwcWork | null,
): StepAdvance {
  const { step, useAlias } = splitQbwcStep(rawStep);
  const result = readQbResponse(responseXml, fallbackMessage);
  const qbMessage = result.statusMessage || `QuickBooks status ${result.statusCode}`;
  if (result.kind === "error") {
    if (step === "job_add" && isParentNotCustomer(qbMessage)) {
      if (useAlias) {
        return { action: "fail", error: aliasParentFailedMessage(work, qbMessage) };
      }
      return { action: "next", step: "customer_alias_query" };
    }
    return { action: "fail", error: qbMessage };
  }
  const missing = result.kind === "missing";
  const aliasName = work ? customerAliasName(customerFullName(work)) : undefined;
  switch (step) {
    case "vendor_query":
      return { action: "next", step: missing ? "vendor_add" : afterVendor(work) };
    case "vendor_add":
      return missing ? { action: "fail", error: qbMessage } : { action: "next", step: afterVendor(work) };
    case "customer_query":
      if (missing) return { action: "next", step: "customer_add" };
      return {
        action: "next",
        step: afterCustomer(work, false),
        customerName: result.fullName || undefined,
        customerListId: result.listId || undefined,
      };
    case "customer_add":
      if (missing) return { action: "fail", error: qbMessage };
      if (result.kind === "exists") {
        return { action: "next", step: "customer_alias_query" };
      }
      return {
        action: "next",
        step: afterCustomer(work, false),
        customerName: result.fullName || (work ? customerFullName(work) : undefined),
        customerListId: result.listId || undefined,
      };
    case "customer_alias_query":
      if (missing) return { action: "next", step: "customer_alias_add" };
      return {
        action: "next",
        step: afterCustomer(work, true),
        customerName: result.fullName || aliasName,
        customerListId: result.listId || undefined,
      };
    case "customer_alias_add":
      if (missing) return { action: "fail", error: qbMessage };
      // 3100 "already in use" usually means a previous run already created Name Cust.
      if (result.kind === "exists") {
        return {
          action: "next",
          step: afterCustomer(work, true),
          customerName: aliasName,
        };
      }
      return {
        action: "next",
        step: afterCustomer(work, true),
        customerName: result.fullName || aliasName,
        customerListId: result.listId || undefined,
      };
    case "job_query":
      if (missing) return { action: "next", step: taggedQbwcStep("job_add", useAlias) };
      return {
        action: "next",
        step: afterJob(work, useAlias),
        jobListId: result.listId || undefined,
      };
    case "job_add":
      if (missing) return { action: "fail", error: qbMessage };
      if (result.kind === "exists" && isParentNotCustomer(qbMessage)) {
        if (useAlias) return { action: "fail", error: aliasParentFailedMessage(work, qbMessage) };
        return { action: "next", step: "customer_alias_query" };
      }
      return {
        action: "next",
        step: afterJob(work, useAlias),
        jobListId: result.listId || undefined,
      };
    case "item_query":
      return {
        action: "next",
        step: taggedQbwcStep(missing ? "item_add" : "invoice_add", useAlias),
      };
    case "item_add":
      return missing
        ? { action: "fail", error: qbMessage }
        : { action: "next", step: taggedQbwcStep("invoice_add", useAlias) };
    case "invoice_add":
    case "expense_add":
    case "payment_add":
      return missing ? { action: "fail", error: qbMessage } : { action: "complete", txnId: result.txnId };
  }
}

function afterVendor(work?: QbwcWork | null) {
  return work?.kind === "expense" && work.hasJob ? "customer_query" : "expense_add";
}

function afterCustomer(work: QbwcWork | null | undefined, useAlias: boolean) {
  if (work?.kind === "payment") {
    return taggedQbwcStep(work.hasJob ? "job_query" : "payment_add", useAlias);
  }
  if (work?.kind === "expense") {
    return taggedQbwcStep(work.hasJob ? "job_query" : "expense_add", useAlias);
  }
  return taggedQbwcStep("job_query", useAlias);
}

function afterJob(work: QbwcWork | null | undefined, useAlias: boolean) {
  if (work?.kind === "expense") return taggedQbwcStep("expense_add", useAlias);
  if (work?.kind === "payment") return taggedQbwcStep("payment_add", useAlias);
  return taggedQbwcStep("item_query", useAlias);
}

function jobCodeOf(work?: QbwcWork | null) {
  return work && "jobCode" in work ? work.jobCode || work.jobName || "" : "";
}

function isParentNotCustomer(message: string) {
  return /not a customer name|parent you have selected/i.test(message);
}

function aliasParentFailedMessage(work?: QbwcWork | null, fallback = "") {
  const alias = work ? customerAliasName(customerFullName(work)) : "";
  const job = jobCodeOf(work);
  if (!alias) return fallback;
  return (
    `QuickBooks would not hang${job ? ` job ${job}` : " that job"} under customer "${alias}". ` +
    `${fallback || "The parent is not a customer."}`
  );
}

export function stepLabel(rawStep: string) {
  const { step, useAlias } = splitQbwcStep(rawStep);
  const label = STEP_LABELS[step] ?? step;
  return useAlias ? `${label} (as ${CUSTOMER_ALIAS_HINT})` : label;
}

const CUSTOMER_ALIAS_HINT = "… Cust";

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
  customer_alias_query: "Find a customer for this name (it is already a vendor)",
  customer_alias_add: "Create a customer (this name is already a vendor)",
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
