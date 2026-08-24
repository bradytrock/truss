import { fillJobRecord, parseCustomFields } from "@/lib/job-record";
import { parsePageTemplate, parsePhotoReportPages } from "@/lib/photo-report";
import type { CompanySettings, Job, JobPhoto, PhotoReport } from "@/lib/types";

export function newShareToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function seedShareToken(kind: "e" | "i", number: string) {
  const digits = number.replace(/\D/g, "");
  return digits ? `nl-${kind}-${digits}` : newShareToken();
}

export function sharePath(kind: "e" | "i" | "p", token: string) {
  return `/share/${kind}/${token}`;
}

export function shareUrl(kind: "e" | "i" | "p", token: string, origin = "") {
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
  logoUrl?: string;
};

export type SharedEstimatePayload = {
  customer: string;
  primaryCustomer?: string;
  secondCustomer?: string | null;
  company: SharedCompany;
  market?: "residential" | "commercial";
  estimate: {
    id: string;
    number: string;
    name: string;
    clientId: string | null;
    opportunityId: string | null;
    jobId: string | null;
    contactId: string | null;
    secondContactId: string | null;
    status: "draft" | "sent" | "viewed" | "accepted" | "declined";
    notes: string;
    validUntil: string | null;
    sentAt: string | null;
    acceptedAt: string | null;
    secondAcceptedAt: string | null;
    ownerSignedAt: string | null;
    ownerSignedName: string;
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
    signatureName: string;
    signatureImage: string;
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
    qbStatus: "not_in_qb" | "entered";
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
    invoiceId: string | null;
    jobId: string | null;
    amount: number;
    method: string;
    paidAt: string;
    reference: string;
    receiptUrl: string;
    receiptStoragePath: string | null;
    qbStatus: "not_in_qb" | "entered";
    createdBy: string;
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
    logoUrl: asString(data.logoUrl),
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
    primaryCustomer: asString(raw.primaryCustomer) || undefined,
    secondCustomer: asNullable(raw.secondCustomer),
    company: parseCompany(raw.company),
    market: asString(raw.market) === "commercial" ? "commercial" : asString(raw.market) === "residential" ? "residential" : undefined,
    estimate: {
      id: asString(estimate.id),
      number: asString(estimate.number),
      name: asString(estimate.name, "Proposal"),
      clientId: asNullable(estimate.clientId),
      opportunityId: asNullable(estimate.opportunityId),
      jobId: asNullable(estimate.jobId),
      contactId: asNullable(estimate.contactId),
      secondContactId: asNullable(estimate.secondContactId),
      status: (ESTIMATE_STATUSES.has(status) ? status : "sent") as SharedEstimatePayload["estimate"]["status"],
      notes: "",
      validUntil: asNullable(estimate.validUntil),
      sentAt: asNullable(estimate.sentAt),
      acceptedAt: asNullable(estimate.acceptedAt),
      secondAcceptedAt: asNullable(estimate.secondAcceptedAt),
      ownerSignedAt: asNullable(estimate.ownerSignedAt),
      ownerSignedName: asString(estimate.ownerSignedName),
      createdAt: asString(estimate.createdAt),
      taxRate: asString(raw.market) === "residential" ? 0 : asNumber(estimate.taxRate),
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
      signatureName: asString(estimate.signatureName),
      signatureImage: asString(estimate.signatureImage),
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
      qbStatus: "not_in_qb",
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
      invoiceId: asNullable(payment.invoiceId) ?? asString(invoice.id),
      jobId: asNullable(payment.jobId),
      amount: asNumber(payment.amount),
      method: asString(payment.method, "check"),
      paidAt: asString(payment.paidAt),
      reference: asString(payment.reference),
      receiptUrl: asString(payment.receiptUrl),
      receiptStoragePath: asNullable(payment.receiptStoragePath),
      qbStatus: "not_in_qb",
      createdBy: "",
    })),
  };
}

export type SharedPagePayload = {
  customer: string;
  company: SharedCompany;
  report: PhotoReport;
  job: Job;
  photos: JobPhoto[];
  contacts: Array<{
    id: string;
    name: string;
    title: string;
    phone: string;
  }>;
  staff: Array<{
    id: string;
    name: string;
    title: string;
  }>;
};

export function companySettingsFromShared(company: SharedCompany): CompanySettings {
  return {
    name: company.name,
    phone: company.phone,
    email: company.email,
    website: company.website,
    street: company.street,
    city: company.city,
    state: company.state,
    postalCode: company.postalCode,
    licenseNumber: company.licenseNumber,
    logoUrl: company.logoUrl,
  };
}

export function parseSharedPage(raw: unknown): SharedPagePayload | null {
  if (!isRecord(raw) || !isRecord(raw.report) || !isRecord(raw.job)) return null;
  const report = raw.report;
  const id = asString(report.id);
  const jobId = asString(report.jobId) || asString(raw.job.id);
  if (!id || !jobId) return null;

  const jobRaw = raw.job;
  const photosRaw = Array.isArray(raw.photos) ? raw.photos.filter(isRecord) : [];
  const contactsRaw = Array.isArray(raw.contacts) ? raw.contacts.filter(isRecord) : [];
  const staffRaw = Array.isArray(raw.staff) ? raw.staff.filter(isRecord) : [];
  const photoCategories = new Set(["before", "progress", "after", "issue"]);
  const projectType = asString(jobRaw.projectType) as Job["projectType"];

  return {
    customer: asString(raw.customer, "Homeowner"),
    company: parseCompany(raw.company),
    report: {
      id,
      jobId,
      title: asString(report.title, "Page"),
      pages: parsePhotoReportPages(report.pages),
      template: parsePageTemplate(report.template),
      shareToken: asString(report.shareToken),
      createdAt: asString(report.createdAt),
      updatedAt: asString(report.updatedAt),
      createdBy: asString(report.createdBy),
    },
    job: fillJobRecord({
      id: asString(jobRaw.id, jobId),
      opportunityId: asNullable(jobRaw.opportunityId),
      name: asString(jobRaw.name, "Job"),
      clientId: asNullable(jobRaw.clientId),
      primaryContactId: asNullable(jobRaw.primaryContactId),
      status: "in_progress",
      contractValue: 0,
      startDate: "",
      substantialCompletion: null,
      superintendent: "",
      projectManager: asString(jobRaw.projectManager),
      location: asString(jobRaw.location),
      ownerStaffId: asString(jobRaw.ownerStaffId),
      code: asString(jobRaw.code),
      street: asString(jobRaw.street),
      city: asString(jobRaw.city),
      state: asString(jobRaw.state),
      postalCode: asString(jobRaw.postalCode),
      relatedContactIds: Array.isArray(jobRaw.relatedContactIds)
        ? jobRaw.relatedContactIds.filter((item): item is string => typeof item === "string")
        : [],
      customFields: parseCustomFields(jobRaw.customFields),
      projectType,
    }),
    photos: photosRaw.flatMap((photo, index) => {
      const photoId = asString(photo.id, `photo-${index}`);
      const url = asString(photo.imageUrl);
      if (!photoId || !url) return [];
      const category = asString(photo.category, "progress");
      const row: JobPhoto = {
        id: photoId,
        jobId: asString(photo.jobId, jobId),
        caption: asString(photo.caption),
        category: (photoCategories.has(category) ? category : "progress") as JobPhoto["category"],
        takenAt: asString(photo.takenAt),
        imageUrl: url,
        storagePath: asNullable(photo.storagePath),
        createdBy: asString(photo.createdBy),
      };
      return [row];
    }),
    contacts: contactsRaw
      .map((contact, index) => ({
        id: asString(contact.id, `contact-${index}`),
        name: asString(contact.name),
        title: asString(contact.title),
        phone: asString(contact.phone),
      }))
      .filter((contact) => contact.name),
    staff: staffRaw
      .map((member, index) => ({
        id: asString(member.id, `staff-${index}`),
        name: asString(member.name),
        title: asString(member.title),
      }))
      .filter((member) => member.name),
  };
}
