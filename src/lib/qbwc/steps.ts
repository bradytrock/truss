import {
  customerAddXml,
  customerQueryXml,
  invoiceAddXml,
  itemQueryXml,
  itemServiceAddXml,
  readQbResponse,
} from "@/lib/qbwc/qbxml";
import {
  customerFullName,
  jobFullName,
  type QbInvoiceWork,
  type QbwcStep,
} from "@/lib/qbwc/work";

export function requestForStep(step: QbwcStep, work: QbInvoiceWork) {
  const requestId = `${work.invoiceId}:${step}`;
  switch (step) {
    case "customer_query":
      return customerQueryXml(customerFullName(work), requestId);
    case "customer_add":
      return customerAddXml({
        requestId,
        name: customerFullName(work),
        phone: work.phone,
        street: work.street,
        city: work.city,
        state: work.state,
        postalCode: work.postalCode,
      });
    case "job_query":
      return customerQueryXml(jobFullName(work), requestId);
    case "job_add":
      return customerAddXml({
        requestId,
        name: work.jobCode || work.jobName || "Job",
        parentFullName: customerFullName(work),
        companyName: work.jobName,
        street: work.street,
        city: work.city,
        state: work.state,
        postalCode: work.postalCode,
      });
    case "item_query":
      return itemQueryXml(work.itemName, requestId);
    case "item_add":
      return itemServiceAddXml(work.itemName, requestId);
    case "invoice_add":
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
  }
}

export type StepAdvance =
  | { action: "next"; step: QbwcStep }
  | { action: "complete"; txnId: string }
  | { action: "fail"; error: string };

export function advanceFromResponse(
  step: QbwcStep,
  responseXml: string,
  fallbackMessage = "",
): StepAdvance {
  const result = readQbResponse(responseXml, fallbackMessage);
  const failed = result.statusMessage || `QuickBooks status ${result.statusCode}`;
  if (result.kind === "error") {
    return { action: "fail", error: failed };
  }
  const missing = result.kind === "missing";
  switch (step) {
    case "customer_query":
      return { action: "next", step: missing ? "customer_add" : "job_query" };
    case "customer_add":
      return missing ? { action: "fail", error: failed } : { action: "next", step: "job_query" };
    case "job_query":
      return { action: "next", step: missing ? "job_add" : "item_query" };
    case "job_add":
      return missing ? { action: "fail", error: failed } : { action: "next", step: "item_query" };
    case "item_query":
      return { action: "next", step: missing ? "item_add" : "invoice_add" };
    case "item_add":
      return missing ? { action: "fail", error: failed } : { action: "next", step: "invoice_add" };
    case "invoice_add":
      return missing
        ? { action: "fail", error: failed }
        : { action: "complete", txnId: result.txnId };
  }
}

export const STEP_LABELS: Record<QbwcStep, string> = {
  customer_query: "Find the customer in QuickBooks",
  customer_add: "Create the customer",
  job_query: "Find the job under that customer",
  job_add: "Create the job (Customer:Job)",
  item_query: "Find the income item",
  item_add: "Create the income item",
  invoice_add: "Add the invoice on that job",
};
