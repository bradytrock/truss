import {
  emptyJobPayAtClose,
  isListingStatus,
  parseApplicationUploads,
  type ApplicationUpload,
  type InterviewFieldKey,
  type InterviewValue,
  type JobPayAtClose,
} from "@/lib/pay-at-close";

/** What `shared_pay_at_close_application` returns, parsed. Safe to send to the homeowner's browser. */
export interface SharedApplicationPayload {
  token: string;
  company: { name: string; phone: string; email: string; website: string; logoUrl: string };
  rep: { name: string; title: string; phone: string; email: string } | null;
  job: { name: string; street: string; city: string; state: string; postalCode: string };
  homeowner: string;
  contractValue: number;
  fields: Partial<Record<InterviewFieldKey, InterviewValue>>;
  answers: Record<string, InterviewValue>;
  sentAt: string | null;
  submittedAt: string | null;
  signatureName: string;
  uploads: ApplicationUpload[];
}

export interface ApplicationSubmission {
  answers: Record<string, InterviewValue>;
  fields: Partial<Record<InterviewFieldKey, InterviewValue>>;
  signatureName: string;
  signatureImage: string;
  authorizations: string[];
}

const FIELD_KEYS: InterviewFieldKey[] = [
  "listingStatus",
  "listingAgent",
  "listPrice",
  "contractPrice",
  "expectedCloseDate",
  "signerNames",
  "contractValue",
  "depositAmount",
  "titleCompany",
  "escrowOfficer",
  "escrowEmail",
  "escrowPhone",
  "escrowFileNumber",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

function scalar(value: unknown): InterviewValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

export function parseInterviewValues(raw: unknown): Record<string, InterviewValue> {
  const out: Record<string, InterviewValue> = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const parsed = scalar(value);
    if (parsed !== undefined) out[key] = parsed;
  }
  return out;
}

export function parseFieldValues(raw: unknown): Partial<Record<InterviewFieldKey, InterviewValue>> {
  const out: Partial<Record<InterviewFieldKey, InterviewValue>> = {};
  if (!isRecord(raw)) return out;
  for (const key of FIELD_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    // Postgres numerics arrive as strings through jsonb.
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) && /Price|Value|Amount/.test(key)) {
      out[key] = Number(value);
      continue;
    }
    const parsed = scalar(value);
    if (parsed !== undefined) out[key] = parsed;
  }
  return out;
}

export function parseSharedApplication(raw: unknown): SharedApplicationPayload | null {
  if (!isRecord(raw) || !str(raw.token)) return null;
  const company = isRecord(raw.company) ? raw.company : {};
  const rep = isRecord(raw.rep) ? raw.rep : null;
  const job = isRecord(raw.job) ? raw.job : {};
  const contractValue = Number(raw.contractValue);
  return {
    token: str(raw.token),
    company: {
      name: str(company.name) || "Your contractor",
      phone: str(company.phone),
      email: str(company.email),
      website: str(company.website),
      logoUrl: str(company.logoUrl),
    },
    rep: rep && str(rep.name) ? { name: str(rep.name), title: str(rep.title), phone: str(rep.phone), email: str(rep.email) } : null,
    job: { name: str(job.name), street: str(job.street), city: str(job.city), state: str(job.state), postalCode: str(job.postalCode) },
    homeowner: str(raw.homeowner),
    contractValue: Number.isFinite(contractValue) ? contractValue : 0,
    fields: parseFieldValues(raw.fields),
    answers: parseInterviewValues(raw.answers),
    sentAt: str(raw.sentAt) || null,
    submittedAt: str(raw.submittedAt) || null,
    signatureName: str(raw.signatureName),
    uploads: parseApplicationUploads(raw.uploads),
  };
}

/** A working record for the homeowner form so the interview helpers (visibility, values) apply unchanged. */
export function recordFromSharedApplication(payload: SharedApplicationPayload): JobPayAtClose {
  const record = emptyJobPayAtClose("shared", "shared", payload.job.state);
  record.contractValue = payload.contractValue;
  const fields = payload.fields;
  if (typeof fields.listingStatus === "string" && isListingStatus(fields.listingStatus)) record.listingStatus = fields.listingStatus;
  if (typeof fields.listingAgent === "string") record.listingAgent = fields.listingAgent;
  if (typeof fields.listPrice === "number") record.listPrice = fields.listPrice;
  if (typeof fields.contractPrice === "number") record.contractPrice = fields.contractPrice;
  if (typeof fields.expectedCloseDate === "string" && fields.expectedCloseDate) record.expectedCloseDate = fields.expectedCloseDate;
  if (typeof fields.signerNames === "string") record.signerNames = fields.signerNames;
  if (typeof fields.depositAmount === "number") record.depositAmount = fields.depositAmount;
  if (typeof fields.titleCompany === "string") record.titleCompany = fields.titleCompany;
  if (typeof fields.escrowOfficer === "string") record.escrowOfficer = fields.escrowOfficer;
  if (typeof fields.escrowEmail === "string") record.escrowEmail = fields.escrowEmail;
  if (typeof fields.escrowPhone === "string") record.escrowPhone = fields.escrowPhone;
  if (typeof fields.escrowFileNumber === "string") record.escrowFileNumber = fields.escrowFileNumber;
  record.interview = { answers: { ...payload.answers }, sources: {}, completedAt: null };
  record.application = {
    ...record.application,
    token: payload.token,
    sentAt: payload.sentAt,
    submittedAt: payload.submittedAt,
    signatureName: payload.signatureName,
    uploads: payload.uploads,
  };
  return record;
}

/** The field-bound values the homeowner may change, pulled off the working record for the submit call. */
export function fieldValuesFromRecord(record: JobPayAtClose): Partial<Record<InterviewFieldKey, InterviewValue>> {
  return {
    listingStatus: record.listingStatus || null,
    listingAgent: record.listingAgent || null,
    listPrice: record.listPrice || null,
    contractPrice: record.contractPrice || null,
    expectedCloseDate: record.expectedCloseDate,
    signerNames: record.signerNames || null,
    depositAmount: record.depositAmount || null,
    titleCompany: record.titleCompany || null,
    escrowOfficer: record.escrowOfficer || null,
    escrowEmail: record.escrowEmail || null,
    escrowPhone: record.escrowPhone || null,
    escrowFileNumber: record.escrowFileNumber || null,
  };
}

export const APPLICATION_UPLOAD_BUCKET = "pay-at-close-applications";
export const APPLICATION_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
export const APPLICATION_UPLOAD_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]);
