import { resolveCustomerName } from "@/lib/parties";
import type { Client, Contact, Invoice, InvoiceLine, Job, Opportunity } from "@/lib/types";
import { customerJobFullName, qbName, type QbInvoiceLine } from "@/lib/qbwc/qbxml";

export const DEFAULT_QB_ITEM = "Contract work";

export type QbwcStep =
  | "customer_query"
  | "customer_add"
  | "job_query"
  | "job_add"
  | "item_query"
  | "item_add"
  | "invoice_add";

export type QbInvoiceWork = {
  invoiceId: string;
  number: string;
  name: string;
  issuedAt: string;
  dueAt: string | null;
  notes: string;
  customerName: string;
  jobCode: string;
  jobName: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  itemName: string;
  lines: QbInvoiceLine[];
};

export function invoiceReadyReason(input: {
  invoice: Invoice;
  job?: Job;
  lines: InvoiceLine[];
}): string | null {
  if (input.invoice.status === "draft") return "Still a draft — send it before QuickBooks.";
  if (input.invoice.status === "void") return "Voided invoices stay out of QuickBooks.";
  if (input.invoice.qbStatus === "entered") return "Already entered in QuickBooks.";
  if (input.invoice.qbStatus === "error") {
    return "QuickBooks rejected this last time. Retry after you fix the customer, job, or item name.";
  }
  if (!input.job) return "Assign this invoice to a job so QuickBooks can hang it on Customer:Job.";
  if (input.lines.length === 0) return "Add line items first. The connector will not guess amounts.";
  return null;
}

export function workFromInvoice(input: {
  invoice: Invoice;
  job: Job;
  lines: InvoiceLine[];
  customerName: string;
  phone?: string;
  itemName?: string;
}): QbInvoiceWork {
  const lines = [...input.lines]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((line) => ({
      description: line.description.trim() || input.invoice.name,
      quantity: line.quantity,
      unit: line.unit,
      unitCost: line.unitCost,
    }));
  return {
    invoiceId: input.invoice.id,
    number: input.invoice.number,
    name: input.invoice.name,
    issuedAt: input.invoice.issuedAt,
    dueAt: input.invoice.dueAt,
    notes: input.invoice.notes,
    customerName: input.customerName.trim() || "Homeowner",
    jobCode: input.job.code.trim() || input.job.name,
    jobName: input.job.name,
    street: input.job.street,
    city: input.job.city,
    state: input.job.state,
    postalCode: input.job.postalCode,
    phone: input.phone ?? "",
    itemName: qbName(input.itemName?.trim() || DEFAULT_QB_ITEM),
    lines,
  };
}

export function workFromBook(input: {
  invoice: Invoice;
  job?: Job;
  lines: InvoiceLine[];
  contacts: Contact[];
  clients: Client[];
  opportunities: Opportunity[];
  itemName?: string;
}): { work: QbInvoiceWork; blocked: string | null } {
  const blocked = invoiceReadyReason({
    invoice: input.invoice,
    job: input.job,
    lines: input.lines,
  });
  if (blocked || !input.job) {
    return {
      blocked: blocked || "Assign this invoice to a job so QuickBooks can hang it on Customer:Job.",
      work: {
        invoiceId: input.invoice.id,
        number: input.invoice.number,
        name: input.invoice.name,
        issuedAt: input.invoice.issuedAt,
        dueAt: input.invoice.dueAt,
        notes: input.invoice.notes,
        customerName: "Homeowner",
        jobCode: "",
        jobName: "",
        street: "",
        city: "",
        state: "",
        postalCode: "",
        phone: "",
        itemName: input.itemName || DEFAULT_QB_ITEM,
        lines: [],
      },
    };
  }
  const customerName = resolveCustomerName(input.invoice, {
    clients: input.clients,
    contacts: input.contacts,
    jobs: [input.job],
    opportunities: input.opportunities,
  });
  const contact =
    input.contacts.find((item) => item.id === input.job?.primaryContactId) ??
    input.contacts.find((item) => item.clientId && item.clientId === input.invoice.clientId);
  return {
    blocked: null,
    work: workFromInvoice({
      invoice: input.invoice,
      job: input.job,
      lines: input.lines,
      customerName,
      phone: contact?.phone,
      itemName: input.itemName,
    }),
  };
}

export function customerFullName(work: QbInvoiceWork) {
  return qbName(work.customerName);
}

export function jobFullName(work: QbInvoiceWork) {
  return customerJobFullName(work.customerName, work.jobCode);
}

export function parseWorkPayload(raw: unknown): QbInvoiceWork | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const invoiceId = asString(row.invoiceId);
  const number = asString(row.number);
  if (!invoiceId || !number) return null;
  const linesRaw = Array.isArray(row.lines) ? row.lines : [];
  return {
    invoiceId,
    number,
    name: asString(row.name, number),
    issuedAt: asString(row.issuedAt),
    dueAt: asString(row.dueAt) || null,
    notes: asString(row.notes),
    customerName: asString(row.customerName, "Homeowner"),
    jobCode: asString(row.jobCode),
    jobName: asString(row.jobName),
    street: asString(row.street),
    city: asString(row.city),
    state: asString(row.state),
    postalCode: asString(row.postalCode),
    phone: asString(row.phone),
    itemName: asString(row.itemName, DEFAULT_QB_ITEM),
    lines: linesRaw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((line) => ({
        description: asString(line.description),
        quantity: asNumber(line.quantity, 1),
        unit: asString(line.unit, "ea"),
        unitCost: asNumber(line.unitCost),
      })),
  };
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
