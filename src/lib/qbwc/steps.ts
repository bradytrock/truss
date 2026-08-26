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
        ...customerAddress(work),
      });
    case "customer_alias_add":
      return customerAddXml({
        requestId,
        name: customerAliasName(customerFullName(work)),
        ...customerAddress(work),
      });
    case "job_query":
      return customerQueryXml(jobFullName(work), requestId);
    case "job_add":
      return customerAddXml({
        requestId,
        name: work.jobCode || work.jobName || "Job",
        parentFullName: customerFullName(work),
        parentListId: work.customerListId,
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
        customerJobFullName: jobFullName(work),
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
      return expenseRequest(requestId, work);
    case "payment_add":
      if (work.kind !== "payment") return customerQueryXml("Homeowner", requestId);
      return receivePaymentAddXml({
        requestId,
        customerName: paymentCustomerRef(work),
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
      step: QbwcStep;
      customerName?: string;
      customerListId?: string;
      jobListId?: string;
    }
  | { action: "complete"; txnId: string }
  | { action: "fail"; error: string };

export function advanceFromResponse(
  step: QbwcStep,
  responseXml: string,
  fallbackMessage = "",
  work?: QbwcWork | null,
): StepAdvance {
  const result = readQbResponse(responseXml, fallbackMessage);
  const failed = explainQbError(step, result.statusMessage || `QuickBooks status ${result.statusCode}`, work);
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
      if (missing) return { action: "next", step: "customer_add" };
      return {
        action: "next",
        step: afterCustomer(work),
        customerName: result.fullName || undefined,
        customerListId: result.listId || undefined,
      };
    case "customer_add":
      if (missing) return { action: "fail", error: failed };
      if (result.kind === "exists") {
        return { action: "next", step: "customer_alias_add" };
      }
      return {
        action: "next",
        step: afterCustomer(work),
        customerName: result.fullName || (work ? customerFullName(work) : undefined),
        customerListId: result.listId || undefined,
      };
    case "customer_alias_add":
      if (missing || result.kind === "exists") {
        return { action: "fail", error: parentMustBeCustomerMessage(work, failed) };
      }
      return {
        action: "next",
        step: afterCustomer(work),
        customerName: result.fullName || (work ? customerAliasName(customerFullName(work)) : undefined),
        customerListId: result.listId || undefined,
      };
    case "job_query":
      if (missing) return { action: "next", step: "job_add" };
      return { action: "next", step: afterJob(work), jobListId: result.listId || undefined };
    case "job_add":
      if (missing) return { action: "fail", error: failed };
      return { action: "next", step: afterJob(work), jobListId: result.listId || undefined };
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

function jobCodeOf(work?: QbwcWork | null) {
  return work && "jobCode" in work ? work.jobCode || work.jobName || "" : "";
}

function parentMustBeCustomerMessage(work?: QbwcWork | null, fallback = "") {
  const parent = work ? customerFullName(work) : "";
  const job = jobCodeOf(work);
  if (!parent) return fallback;
  return (
    `QuickBooks already has "${parent}" as a vendor, employee, or other name — not a customer` +
    (job ? `, so job ${job} cannot hang under it` : "") +
    `. In QuickBooks, that name has to be an active Customer (or rename the vendor so the names differ), then retry.`
  );
}

function explainQbError(step: QbwcStep, failed: string, work?: QbwcWork | null) {
  if (
    (step === "job_add" || step === "customer_alias_add") &&
    /not a customer name|parent you have selected|already in use|already exists/i.test(failed)
  ) {
    return parentMustBeCustomerMessage(work, failed);
  }
  return failed;
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
