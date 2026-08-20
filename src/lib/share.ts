export function newShareToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function seedShareToken(kind: "e" | "i", number: string) {
  const digits = number.replace(/\D/g, "");
  return digits ? `nl-${kind}-${digits}` : newShareToken();
}

export function sharePath(kind: "e" | "i", token: string) {
  return `/share/${kind}/${token}`;
}

export function shareUrl(kind: "e" | "i", token: string, origin = "") {
  const path = sharePath(kind, token);
  if (origin) return `${origin.replace(/\/+$/, "")}${path}`;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return path;
}

export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(input);
      return ok;
    } catch {
      return false;
    }
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value) || fallback;
}

function asBool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asNullable(value: unknown) {
  if (value === null || value === undefined) return null;
  const next = asString(value);
  return next ? next : null;
}

export type SharedCompany = {
  name: string;
  phone: string;
  email: string;
  website: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  licenseNumber: string;
};

export type SharedEstimatePayload = {
  customer: string;
  company: SharedCompany;
  estimate: {
    id: string;
    number: string;
    name: string;
    clientId: string | null;
    opportunityId: string | null;
    jobId: string | null;
    contactId: string | null;
    status: "draft" | "sent" | "viewed" | "accepted" | "declined";
    notes: string;
    validUntil: string | null;
    sentAt: string | null;
    acceptedAt: string | null;
    createdAt: string;
    taxRate: number;
    discountKind: "percent" | "amount";
    discountValue: number;
    depositKind: "percent" | "amount";
    depositValue: number;
    intro: string;
    terms: string;
    street: string;
    city: string;
    state: string;
    postalCode: string;
    shareToken: string;
  };
  lines: Array<{
    id: string;
    estimateId: string;
    catalogItemId: string | null;
    title: string;
    description: string;
    quantity: number;
    unit: string;
    unitCost: number;
    sortOrder: number;
    groupName: string;
    optional: boolean;
    selected: boolean;
    taxable: boolean;
  }>;
};

export type SharedInvoicePayload = {
  customer: string;
  company: SharedCompany;
  invoice: {
    id: string;
    number: string;
    name: string;
    clientId: string | null;
    jobId: string | null;
    estimateId: string | null;
    status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
    issuedAt: string;
    dueAt: string | null;
    notes: string;
    shareToken: string;
  };
  lines: Array<{
    id: string;
    invoiceId: string;
    description: string;
    quantity: number;
    unit: string;
    unitCost: number;
    sortOrder: number;
  }>;
  payments: Array<{
    id: string;
    invoiceId: string;
    amount: number;
    method: string;
    paidAt: string;
    reference: string;
  }>;
};

function parseCompany(raw: unknown): SharedCompany {
  const data = isRecord(raw) ? raw : {};
  return {
    name: asString(data.name, "Contractor"),
    phone: asString(data.phone),
    email: asString(data.email),
    website: asString(data.website),
    street: asString(data.street),
    city: asString(data.city),
    state: asString(data.state),
    postalCode: asString(data.postalCode),
    licenseNumber: asString(data.licenseNumber),
  };
}

const ESTIMATE_STATUSES = new Set(["draft", "sent", "viewed", "accepted", "declined"]);
const INVOICE_STATUSES = new Set(["draft", "sent", "partial", "paid", "overdue", "void"]);

export function parseSharedEstimate(raw: unknown): SharedEstimatePayload | null {
  if (!isRecord(raw) || !isRecord(raw.estimate) || !Array.isArray(raw.lines)) return null;
  const estimate = raw.estimate;
  const status = asString(estimate.status, "sent");
  if (!asString(estimate.id) || !asString(estimate.number)) return null;
  return {
    customer: asString(raw.customer, "Homeowner"),
    company: parseCompany(raw.company),
    estimate: {
      id: asString(estimate.id),
      number: asString(estimate.number),
      name: asString(estimate.name, "Proposal"),
      clientId: asNullable(estimate.clientId),
      opportunityId: asNullable(estimate.opportunityId),
      jobId: asNullable(estimate.jobId),
      contactId: asNullable(estimate.contactId),
      status: (ESTIMATE_STATUSES.has(status) ? status : "sent") as SharedEstimatePayload["estimate"]["status"],
      notes: "",
      validUntil: asNullable(estimate.validUntil),
      sentAt: asNullable(estimate.sentAt),
      acceptedAt: asNullable(estimate.acceptedAt),
      createdAt: asString(estimate.createdAt),
      taxRate: asNumber(estimate.taxRate),
      discountKind: estimate.discountKind === "amount" ? "amount" : "percent",
      discountValue: asNumber(estimate.discountValue),
      depositKind: estimate.depositKind === "amount" ? "amount" : "percent",
      depositValue: asNumber(estimate.depositValue),
      intro: asString(estimate.intro),
      terms: asString(estimate.terms),
      street: asString(estimate.street),
      city: asString(estimate.city),
      state: asString(estimate.state),
      postalCode: asString(estimate.postalCode),
      shareToken: asString(estimate.shareToken),
    },
    lines: raw.lines.filter(isRecord).map((line, index) => ({
      id: asString(line.id, `line-${index}`),
      estimateId: asString(line.estimateId, asString(estimate.id)),
      catalogItemId: asNullable(line.catalogItemId),
      title: asString(line.title) || asString(line.description),
      description: asString(line.description),
      quantity: asNumber(line.quantity),
      unit: asString(line.unit, "ea"),
      unitCost: asNumber(line.unitCost),
      sortOrder: asNumber(line.sortOrder, index),
      groupName: asString(line.groupName),
      optional: asBool(line.optional),
      selected: asBool(line.selected, true),
      taxable: asBool(line.taxable, true),
    })),
  };
}

export function parseSharedInvoice(raw: unknown): SharedInvoicePayload | null {
  if (!isRecord(raw) || !isRecord(raw.invoice) || !Array.isArray(raw.lines)) return null;
  const invoice = raw.invoice;
  const status = asString(invoice.status, "sent");
  if (!asString(invoice.id) || !asString(invoice.number)) return null;
  const payments = Array.isArray(raw.payments) ? raw.payments.filter(isRecord) : [];
  return {
    customer: asString(raw.customer, "Homeowner"),
    company: parseCompany(raw.company),
    invoice: {
      id: asString(invoice.id),
      number: asString(invoice.number),
      name: asString(invoice.name, "Invoice"),
      clientId: asNullable(invoice.clientId),
      jobId: asNullable(invoice.jobId),
      estimateId: asNullable(invoice.estimateId),
      status: (INVOICE_STATUSES.has(status) ? status : "sent") as SharedInvoicePayload["invoice"]["status"],
      issuedAt: asString(invoice.issuedAt),
      dueAt: asNullable(invoice.dueAt),
      notes: "",
      shareToken: asString(invoice.shareToken),
    },
    lines: raw.lines.filter(isRecord).map((line, index) => ({
      id: asString(line.id, `line-${index}`),
      invoiceId: asString(line.invoiceId, asString(invoice.id)),
      description: asString(line.description),
      quantity: asNumber(line.quantity),
      unit: asString(line.unit, "ea"),
      unitCost: asNumber(line.unitCost),
      sortOrder: asNumber(line.sortOrder, index),
    })),
    payments: payments.map((payment, index) => ({
      id: asString(payment.id, `pay-${index}`),
      invoiceId: asString(payment.invoiceId, asString(invoice.id)),
      amount: asNumber(payment.amount),
      method: asString(payment.method, "check"),
      paidAt: asString(payment.paidAt),
      reference: asString(payment.reference),
    })),
  };
}
