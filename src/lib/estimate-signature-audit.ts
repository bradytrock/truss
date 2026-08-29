import { estimateTotals } from "@/lib/estimate-totals";
import type { Estimate, EstimateLine, EstimateSignatureEvent, SignatureEventKind, SignatureEventRole } from "@/lib/types";

export const ESIGN_CONSENT_VERSION = "2026-08-29";

export const ESIGN_CONSENT_TEXT =
  "I agree to use electronic records and signatures. Drawing my signature and tapping Sign and approve is my legal signature on this proposal, the same as signing on paper.";

export type { EstimateSignatureEvent, SignatureEventKind, SignatureEventRole };

export type EstimateDocumentSnapshot = {
  estimateId: string;
  number: string;
  name: string;
  validUntil: string | null;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  intro: string;
  terms: string;
  notes: string;
  taxRate: number;
  discountKind: string;
  discountValue: number;
  depositKind: string;
  depositValue: number;
  totals: { subtotal: number; discount: number; tax: number; total: number; deposit: number };
  lines: Array<{
    id: string;
    title: string;
    description: string;
    quantity: number;
    unit: string;
    unitCost: number;
    optional: boolean;
    selected: boolean;
    taxable: boolean;
    groupName: string;
    sortOrder: number;
  }>;
};

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

export function tokenSuffix(token: string) {
  const value = token.trim();
  if (!value) return "";
  return value.slice(-8);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function estimateDocumentSnapshot(
  estimate: Pick<
    Estimate,
    | "id"
    | "number"
    | "name"
    | "validUntil"
    | "street"
    | "city"
    | "state"
    | "postalCode"
    | "intro"
    | "terms"
    | "notes"
    | "taxRate"
    | "discountKind"
    | "discountValue"
    | "depositKind"
    | "depositValue"
  >,
  lines: EstimateLine[],
): EstimateDocumentSnapshot {
  const ordered = lines.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const totals = estimateTotals(estimate, ordered);
  return {
    estimateId: estimate.id,
    number: estimate.number,
    name: estimate.name,
    validUntil: estimate.validUntil,
    street: estimate.street,
    city: estimate.city,
    state: estimate.state,
    postalCode: estimate.postalCode,
    intro: estimate.intro,
    terms: estimate.terms,
    notes: estimate.notes,
    taxRate: estimate.taxRate,
    discountKind: estimate.discountKind,
    discountValue: estimate.discountValue,
    depositKind: estimate.depositKind,
    depositValue: estimate.depositValue,
    totals: {
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      deposit: totals.deposit,
    },
    lines: ordered.map((line) => ({
      id: line.id,
      title: line.title,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitCost: line.unitCost,
      optional: line.optional,
      selected: line.selected,
      taxable: line.taxable,
      groupName: line.groupName,
      sortOrder: line.sortOrder,
    })),
  };
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashEstimateDocument(snapshot: EstimateDocumentSnapshot) {
  return sha256Hex(stableStringify(snapshot));
}

export async function hashShareToken(token: string) {
  const value = token.trim();
  if (!value) return "";
  return sha256Hex(value);
}

export function isSignatureEventKind(value: string): value is SignatureEventKind {
  return value === "sent" || value === "opened" || value === "signed" || value === "declined";
}

export function parseSignatureEventRole(value: string): SignatureEventRole {
  if (value === "primary" || value === "second" || value === "contractor") return value;
  return "";
}

export function signatureEventLabel(kind: SignatureEventKind) {
  if (kind === "sent") return "Link sent";
  if (kind === "opened") return "Opened";
  if (kind === "signed") return "Signed";
  return "Declined";
}

export function signerRoleLabel(role: SignatureEventRole) {
  if (role === "primary") return "Signer 1";
  if (role === "second") return "Signer 2";
  if (role === "contractor") return "Contractor";
  return "Signer";
}

export function fillSignatureEvent(
  event: Partial<EstimateSignatureEvent> & Pick<EstimateSignatureEvent, "id" | "estimateId" | "kind" | "createdAt">,
): EstimateSignatureEvent {
  return {
    id: event.id,
    companyId: event.companyId,
    estimateId: event.estimateId,
    kind: event.kind,
    signerRole: parseSignatureEventRole(event.signerRole ?? ""),
    contactId: event.contactId ?? null,
    signerName: event.signerName ?? "",
    tokenSuffix: event.tokenSuffix ?? "",
    tokenSha256: event.tokenSha256 ?? "",
    ipAddress: event.ipAddress ?? "",
    forwardedFor: event.forwardedFor ?? "",
    userAgent: event.userAgent ?? "",
    acceptLanguage: event.acceptLanguage ?? "",
    timeZone: event.timeZone ?? "",
    deliveryChannel: event.deliveryChannel ?? "",
    deliveryTo: event.deliveryTo ?? "",
    consentText: event.consentText ?? "",
    consentVersion: event.consentVersion ?? "",
    documentSha256: event.documentSha256 ?? "",
    capturedInOffice: Boolean(event.capturedInOffice),
    staffId: event.staffId ?? null,
    createdAt: event.createdAt,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function parseSignatureEvent(raw: unknown): EstimateSignatureEvent | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = asString(row.id);
  const estimateId = asString(row.estimateId ?? row.estimate_id);
  const kindRaw = asString(row.kind);
  const createdAt = asString(row.createdAt ?? row.created_at);
  if (!id || !estimateId || !isSignatureEventKind(kindRaw) || !createdAt) return null;
  return fillSignatureEvent({
    id,
    companyId: asString(row.companyId ?? row.company_id) || undefined,
    estimateId,
    kind: kindRaw,
    signerRole: parseSignatureEventRole(asString(row.signerRole ?? row.signer_role)),
    contactId: asString(row.contactId ?? row.contact_id) || null,
    signerName: asString(row.signerName ?? row.signer_name),
    tokenSuffix: asString(row.tokenSuffix ?? row.token_suffix),
    tokenSha256: asString(row.tokenSha256 ?? row.token_sha256),
    ipAddress: asString(row.ipAddress ?? row.ip_address),
    forwardedFor: asString(row.forwardedFor ?? row.forwarded_for),
    userAgent: asString(row.userAgent ?? row.user_agent),
    acceptLanguage: asString(row.acceptLanguage ?? row.accept_language),
    timeZone: asString(row.timeZone ?? row.time_zone),
    deliveryChannel: asString(row.deliveryChannel ?? row.delivery_channel),
    deliveryTo: asString(row.deliveryTo ?? row.delivery_to),
    consentText: asString(row.consentText ?? row.consent_text),
    consentVersion: asString(row.consentVersion ?? row.consent_version),
    documentSha256: asString(row.documentSha256 ?? row.document_sha256),
    capturedInOffice: Boolean(row.capturedInOffice ?? row.captured_in_office),
    staffId: asString(row.staffId ?? row.staff_id) || null,
    createdAt,
  });
}

export function parseSignatureEvents(raw: unknown): EstimateSignatureEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = parseSignatureEvent(item);
    return parsed ? [parsed] : [];
  });
}
