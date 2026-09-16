import {
  billAddXml,
  creditCardChargeAddXml,
  customerAddXml,
  customerAliasName,
  customerQueryXml,
  invoiceAddXml,
  isQbLockMessage,
  isQbNotFoundMessage,
  itemQueryXml,
  itemServiceAddXml,
  readQbResponse,
  receivePaymentAddXml,
  txnVoidXml,
  vendorAddXml,
  vendorListQueryXml,
  vendorQueryXml,
} from "@/lib/qbwc/qbxml";
import {
  billedCustomerName,
  customerFullName,
  expenseRepairsBill,
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
  if (work.kind === "vendor_sync") return "vendors";
  return work.invoiceId;
}

export function requestForStep(rawStep: string, work: QbwcWork) {
  const { step, useAlias } = splitQbwcStep(rawStep);
  const requestId = `${recordId(work)}-${step}`;
  if (step === "vendor_list_query") {
    return vendorListQueryXml(requestId, work.kind === "vendor_sync" ? work.iteratorId : "");
  }
  const named = work.kind === "vendor_sync" ? null : work;
  const customer = named ? billedCustomerName(named, useAlias) : "Customer";
  const job = named ? jobFullName(named, useAlias) : "Customer:Job";
  const alias = named ? customerAliasName(customerFullName(named)) : "Customer Cust";
  switch (step) {
    case "customer_query":
      return customerQueryXml(named ? customerFullName(named) : "Customer", requestId);
    case "customer_add":
      return customerAddXml({
        requestId,
        name: named ? customerFullName(named) : "Customer",
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
        name: named ? named.jobCode || named.jobName || "Job" : "Job",
        parentFullName: customer,
        companyName: named?.jobName,
        ...customerAddress(work),
      });
    case "item_query":
      return itemQueryXml(named && named.kind === "invoice" ? named.itemName : "Contract work", requestId);
    case "item_add":
      return itemServiceAddXml(named && named.kind === "invoice" ? named.itemName : "Contract work", requestId);
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
    case "txn_void":
      if (work.kind === "expense") {
        const replaceId = work.replaceTxnId?.trim();
        if (replaceId) {
          return txnVoidXml({
            requestId,
            txnType: work.replaceTxnKind === "bill" ? "Bill" : "Check",
            txnId: replaceId,
          });
        }
      }
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
  return billAddXml(line);
}

function customerAddress(work: QbwcWork) {
  if (work.kind === "payment" || work.kind === "vendor_sync") {
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
  // Leftover checks may be locked — skip void and still post the bill.
  // Unattached bills we are replacing must void (or be deleted) or we would
  // add a second A/P bill.
  if (step === "txn_void") {
    if (work?.kind === "expense" && expenseRepairsBill(work)) {
      const result = readQbResponse(responseXml, fallbackMessage);
      const qbMessage = result.statusMessage || fallbackMessage;
      if (result.kind === "error" && isQbLockMessage(qbMessage)) {
        return {
          action: "fail",
          error:
            "Close that vendor bill in QuickBooks so we can hang it on the job, then run the connector again.",
        };
      }
    }
    return { action: "next", step: taggedQbwcStep("expense_add", useAlias) };
  }
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
  const named = work && work.kind !== "vendor_sync" ? work : null;
  const aliasName = named ? customerAliasName(customerFullName(named)) : undefined;
  switch (step) {
    case "vendor_query":
      return { action: "next", step: missing ? "vendor_add" : afterVendor(work) };
    case "vendor_add":
      return missing ? { action: "fail", error: qbMessage } : { action: "next", step: afterVendor(work) };
    case "vendor_list_query":
      return { action: "next", step: "vendor_list_query" };
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
        customerName: result.fullName || (named ? customerFullName(named) : undefined),
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

function hresultFailed(hresult: string) {
  const value = hresult.trim();
  return Boolean(value) && value !== "0x0" && value !== "0";
}

/** Web Connector receiveResponseXML: empty body + HRESULT is usually a COM miss, not a session killer. */
export function receiveWorkAdvance(input: {
  step: string;
  responseXml: string;
  hresult?: string;
  message?: string;
  work?: QbwcWork | null;
}): StepAdvance {
  const responseXml = input.responseXml ?? "";
  const message = input.message ?? "";
  const hresult = input.hresult ?? "";
  const { step, useAlias } = splitQbwcStep(input.step);
  const hasXml = Boolean(responseXml.trim());
  if (!hasXml && hresultFailed(hresult) && !isQbNotFoundMessage(message)) {
    if (step === "txn_void") {
      if (input.work?.kind === "expense" && expenseRepairsBill(input.work) && isQbLockMessage(message)) {
        return {
          action: "fail",
          error:
            "Close that vendor bill in QuickBooks so we can hang it on the job, then run the connector again.",
        };
      }
      return { action: "next", step: taggedQbwcStep("expense_add", useAlias) };
    }
    return { action: "fail", error: `${stepLabel(input.step)}: ${message || hresult}` };
  }
  return advanceFromResponse(input.step, responseXml, message, input.work);
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
  if (work?.kind === "expense") {
    // Only void an unattached bill we are replacing. Leftover checks stay skipped
    // so a locked check cannot block the first vendor-bill post.
    if (expenseRepairsBill(work)) {
      return taggedQbwcStep("txn_void", useAlias);
    }
    return taggedQbwcStep("expense_add", useAlias);
  }
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
  const named = work && work.kind !== "vendor_sync" ? work : null;
  const alias = named ? customerAliasName(customerFullName(named)) : "";
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
  vendor_list_query: "Pull vendors from QuickBooks",
  expense_add: "Add the vendor bill or credit card charge",
  txn_void: "Void the check that was posted instead of a bill",
  payment_add: "Receive the payment against the invoice",
};
