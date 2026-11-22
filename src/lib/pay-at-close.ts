/**
 * Pay at Close: the homeowner (seller) has repairs done before a sale and the
 * contractor is paid from seller proceeds at the closing table.
 *
 * This module is the deterministic half of the underwriting tool. Public
 * property records come in through `property-records-server.ts`, the numbers
 * are computed here, and the AI only narrates and flags what was computed.
 */

export const PAY_AT_CLOSE_STATUSES = [
  "screening",
  "approved",
  "declined",
  "in_progress",
  "awaiting_close",
  "paid",
  "fell_through",
] as const;

export type PayAtCloseStatus = (typeof PAY_AT_CLOSE_STATUSES)[number];

export const PAY_AT_CLOSE_STATUS_LABELS: Record<PayAtCloseStatus, string> = {
  screening: "Screening",
  approved: "Approved",
  declined: "Declined",
  in_progress: "Work in progress",
  awaiting_close: "Awaiting closing",
  paid: "Paid at closing",
  fell_through: "Fell through",
};

/** Statuses where company money is (or will be) out the door and not yet collected. */
export const PAY_AT_CLOSE_OPEN_STATUSES: readonly PayAtCloseStatus[] = [
  "approved",
  "in_progress",
  "awaiting_close",
];

export const LISTING_STATUSES = [
  "not_listed",
  "coming_soon",
  "active",
  "pending",
  "under_contract",
  "sold",
  "off_market",
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  not_listed: "Not listed yet",
  coming_soon: "Coming soon",
  active: "Active listing",
  pending: "Pending",
  under_contract: "Under contract",
  sold: "Sold / closed",
  off_market: "Off market",
};

export const LIEN_KINDS = [
  "mortgage",
  "heloc",
  "property_tax",
  "tax_lien",
  "mechanics",
  "judgment",
  "hoa",
  "other",
] as const;

export type LienKind = (typeof LIEN_KINDS)[number];

export const LIEN_KIND_LABELS: Record<LienKind, string> = {
  mortgage: "Mortgage",
  heloc: "HELOC / 2nd",
  property_tax: "Delinquent property tax",
  tax_lien: "Tax lien (IRS / state)",
  mechanics: "Mechanic's lien",
  judgment: "Judgment lien",
  hoa: "HOA lien",
  other: "Other",
};

export const LIEN_SOURCES = ["public_record", "manual", "title_commitment"] as const;
export type LienSource = (typeof LIEN_SOURCES)[number];

export const LIEN_SOURCE_LABELS: Record<LienSource, string> = {
  public_record: "Public record",
  manual: "Entered by office",
  title_commitment: "Title commitment",
};

export interface MortgageRecord {
  id: string;
  lender: string;
  /** Original principal on the recorded deed of trust. Balances are not public. */
  originalAmount: number;
  recordedDate: string | null;
  /** Conventional, FHA, VA, HELOC, and so on, as recorded. */
  loanType: string;
  /** Note rate when the record has it. Null means we assume a rate by vintage. */
  interestRate: number | null;
  /** Null means a 30-year term is assumed. */
  termMonths: number | null;
  isHeloc: boolean;
  /** 1 for the first lien, 2 for a second, and so on. */
  position: number;
}

export interface LienRecord {
  id: string;
  kind: LienKind;
  holder: string;
  /** Amount owed. For a HELOC this is the full line, since draws are not public. */
  amount: number;
  recordedDate: string | null;
  source: LienSource;
  /** Verified means it came off the title commitment or a payoff letter. */
  verified: boolean;
  notes: string;
}

export interface DistressSignals {
  noticeOfDefault: boolean;
  lisPendens: boolean;
  bankruptcy: boolean;
  taxLien: boolean;
  preForeclosureDate: string | null;
}

export interface PropertyRecord {
  /** Assessor parcel number. */
  apn: string;
  ownerNames: string[];
  /** Individual, joint, trust, llc, estate, or unknown, as best as the record shows. */
  vesting: string;
  ownerOccupied: boolean | null;
  landUse: string;
  yearBuilt: number | null;
  livingSqFt: number | null;
  lotSqFt: number | null;
  beds: number | null;
  baths: number | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  assessedValue: number | null;
  /** Automated valuation. Null when the provider has none. */
  avmValue: number | null;
  avmLow: number | null;
  avmHigh: number | null;
  /** 0 to 100. Higher means the AVM is tighter. */
  avmConfidence: number | null;
  annualTax: number | null;
  taxDelinquentAmount: number;
  mortgages: MortgageRecord[];
  liens: LienRecord[];
  distress: DistressSignals;
  /** Where the record came from, for the report footer. */
  sourceName: string;
  fetchedAt: string;
}

export const SAMPLE_PROPERTY_SOURCE = "Sample property data (no records provider key set)";

/** True when the saved record came from the demo generator rather than a records provider. */
export function isSamplePropertyRecord(property: Pick<PropertyRecord, "sourceName"> | null | undefined) {
  return Boolean(property && property.sourceName.startsWith("Sample property data"));
}

export const CHECKLIST_KEYS = [
  "agreement_signed",
  "assignment_of_proceeds",
  "escrow_instructions",
  "prelim_notice",
  "title_commitment",
  "payoff_demand",
  "completion_sign_off",
  "lien_waiver_ready",
] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export interface ChecklistItem {
  key: ChecklistKey;
  label: string;
  detail: string;
  done: boolean;
  doneAt: string | null;
  /** When set, the item is due a number of days after the work starts (negative) or before closing (positive). */
  dueNote: string;
}

export type RiskSeverity = "info" | "watch" | "high";

export interface RiskFlag {
  code: string;
  severity: RiskSeverity;
  title: string;
  detail: string;
}

export type Recommendation = "approve" | "approve_with_deposit" | "review" | "decline";

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  approve: "Approve",
  approve_with_deposit: "Approve with deposit",
  review: "Needs review",
  decline: "Decline",
};

export interface WaterfallLine {
  key: string;
  label: string;
  amount: number;
  estimated: boolean;
  detail: string;
}

export interface EquityWaterfall {
  estimatedValue: number;
  valueSource: string;
  valueEstimated: boolean;
  lines: WaterfallLine[];
  seniorClaims: number;
  closingCosts: number;
  netProceeds: number;
  payAtCloseAmount: number;
  /** Net proceeds divided by what this company is owed at closing. */
  coverageRatio: number | null;
  /** Dollars left for the seller after our payment. */
  cushion: number;
}

export interface PayAtCloseReport {
  generatedAt: string;
  waterfall: EquityWaterfall;
  flags: RiskFlag[];
  /** 0 to 100. Higher is safer. */
  score: number;
  recommendation: Recommendation;
  /** Plain-language explanation. Written by the model when a key is set, otherwise generated here. */
  narrative: string;
  sources: string[];
  assumptions: string[];
}

export interface PayAtCloseThresholds {
  /** Coverage at or above this approves without a deposit. */
  approveCoverage: number;
  /** Coverage at or above this approves with a deposit. Below is review or decline. */
  depositCoverage: number;
  /** Below this coverage the recommendation is decline. */
  declineCoverage: number;
  /** Seller commission plus other costs, as a fraction of value. */
  commissionRate: number;
  otherSellerCostRate: number;
  /** Haircut on the AVM when there is no list or contract price. */
  avmHaircut: number;
  /** Largest single pay-at-close contract the company will carry without review. */
  maxContractValue: number;
  /** Days from today to the expected closing that triggers a carry warning. */
  longCarryDays: number;
}

export const DEFAULT_THRESHOLDS: PayAtCloseThresholds = {
  approveCoverage: 2,
  depositCoverage: 1.35,
  declineCoverage: 1.1,
  commissionRate: 0.055,
  otherSellerCostRate: 0.015,
  avmHaircut: 0.05,
  maxContractValue: 75_000,
  longCarryDays: 120,
};

export interface JobPayAtClose {
  id: string;
  jobId: string;
  status: PayAtCloseStatus;
  /** What this company collects at closing. */
  contractValue: number;
  /** Any money collected up front. */
  depositAmount: number;
  expectedCloseDate: string | null;
  listingStatus: ListingStatus | "";
  listPrice: number;
  /** Agreed sale price once under contract. */
  contractPrice: number;
  /** Seller concessions already promised to the buyer. */
  sellerConcessions: number;
  titleCompany: string;
  escrowOfficer: string;
  escrowEmail: string;
  escrowPhone: string;
  escrowFileNumber: string;
  listingAgent: string;
  /** Who signs the pay-at-close agreement, as written on the contract. */
  signerNames: string;
  property: PropertyRecord | null;
  /** Office-entered and title-commitment liens. Public-record liens live on `property`. */
  liens: LienRecord[];
  checklist: ChecklistItem[];
  report: PayAtCloseReport | null;
  notes: string;
  /** Who asked for the request (staff id and name as recorded at the time). */
  requestedBy: string;
  requestedByName: string;
  requestedAt: string | null;
  /** The company admin who approved or declined. Empty until a decision is made. */
  decidedBy: string;
  decidedByName: string;
  decidedAt: string | null;
  decisionNote: string;
  /** Rep's qualification interview. Answers for facts that are not record fields; see INTERVIEW_STEPS. */
  interview: PayAtCloseInterview;
  /** The homeowner-facing application sent from the office. */
  application: PayAtCloseApplication;
  updatedAt: string;
}

export type InterviewValue = string | number | boolean | null;

export type InterviewSource = "rep" | "homeowner";

export interface PayAtCloseInterview {
  answers: Record<string, InterviewValue>;
  /** Who gave each answer. Missing means the rep typed it. */
  sources: Record<string, InterviewSource>;
  /** Set when the rep finishes the review step and submits the request. */
  completedAt: string | null;
}

export function emptyInterview(): PayAtCloseInterview {
  return { answers: {}, sources: {}, completedAt: null };
}

export interface ApplicationUpload {
  /** Storage path inside the private bucket: company/record/file. */
  path: string;
  name: string;
  size: number;
  contentType: string;
  uploadedAt: string;
}

export interface PayAtCloseApplication {
  /** Public link token. Empty until the office sends the application. */
  token: string;
  sentAt: string | null;
  /** Who it went to, as typed or picked when sending. */
  sentTo: string;
  submittedAt: string | null;
  signatureName: string;
  /** PNG data URL from the signature pad. */
  signatureImage: string;
  /** Ids of APPLICATION_AUTHORIZATIONS the homeowner checked. */
  authorizations: string[];
  uploads: ApplicationUpload[];
  ip: string;
  userAgent: string;
}

export function emptyApplication(): PayAtCloseApplication {
  return {
    token: "",
    sentAt: null,
    sentTo: "",
    submittedAt: null,
    signatureName: "",
    signatureImage: "",
    authorizations: [],
    uploads: [],
    ip: "",
    userAgent: "",
  };
}

export type ApplicationState = "not_sent" | "sent" | "submitted";

export function applicationState(application: PayAtCloseApplication): ApplicationState {
  if (application.submittedAt) return "submitted";
  if (application.token && application.sentAt) return "sent";
  return "not_sent";
}

export const APPLICATION_STATE_LABELS: Record<ApplicationState, string> = {
  not_sent: "Not sent",
  sent: "Sent, waiting on homeowner",
  submitted: "Signed and submitted",
};

export interface ApplicationAuthorization {
  id: string;
  title: string;
  /** Plain-language text the homeowner agrees to. `{company}` is replaced with the company name. */
  text: string;
}

/**
 * What the homeowner agrees to when they sign the application. These are consents and
 * acknowledgments, not the construction contract; that is signed separately on the proposal.
 */
export const APPLICATION_AUTHORIZATIONS: ApplicationAuthorization[] = [
  {
    id: "records",
    title: "Property and title review",
    text:
      "I authorize {company} to review public property records, title information, and recorded liens for the property listed above, and to contact the title or escrow company handling my sale to confirm the closing.",
  },
  {
    id: "proceeds",
    title: "Payment from sale proceeds",
    text:
      "I understand the cost of the work will be paid from my proceeds at closing. I agree to instruct the title or escrow company to pay {company} from those proceeds, and I understand the final construction agreement will carry the exact amount.",
  },
  {
    id: "balance",
    title: "If the sale does not close",
    text:
      "I understand that if the sale is canceled, does not close, or the proceeds are not enough to cover the balance, the balance for completed work is still owed and becomes due as described in the construction agreement.",
  },
  {
    id: "truthful",
    title: "My answers are accurate",
    text:
      "The information I gave in this application is true and complete to the best of my knowledge. I will let {company} know if the closing date, the sale price, or what is owed on the home changes.",
  },
];

export function authorizationText(authorization: ApplicationAuthorization, companyName: string) {
  return authorization.text.replace(/\{company\}/g, companyName.trim() || "the contractor");
}

export function applicationAuthorizationsComplete(checked: readonly string[]) {
  return APPLICATION_AUTHORIZATIONS.every((authorization) => checked.includes(authorization.id));
}

/** A request is waiting on a company admin until someone records a decision. */
export function payAtCloseAwaitingApproval(record: Pick<JobPayAtClose, "status" | "decidedAt">) {
  return record.status === "screening" && !record.decidedAt;
}

/** Statuses that mean the office is relying on the approval: work or money is in motion. */
export const PAY_AT_CLOSE_POST_APPROVAL_STATUSES: readonly PayAtCloseStatus[] = [
  "approved",
  "in_progress",
  "awaiting_close",
  "paid",
];

/** Which statuses a user may pick from the plain status menu. Approve/decline go through the decision controls. */
export function payAtCloseStatusChoices(record: Pick<JobPayAtClose, "status" | "decidedAt">): PayAtCloseStatus[] {
  const approved = Boolean(record.decidedAt) && record.status !== "declined";
  return PAY_AT_CLOSE_STATUSES.filter((status) => {
    if (status === record.status) return true;
    if (status === "approved" || status === "declined") return false;
    if (PAY_AT_CLOSE_POST_APPROVAL_STATUSES.includes(status)) return approved || PAY_AT_CLOSE_POST_APPROVAL_STATUSES.includes(record.status);
    return true;
  });
}

function money(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function moneyOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function boolOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function isPayAtCloseStatus(value: string): value is PayAtCloseStatus {
  return (PAY_AT_CLOSE_STATUSES as readonly string[]).includes(value);
}

export function isListingStatus(value: string): value is ListingStatus {
  return (LISTING_STATUSES as readonly string[]).includes(value);
}

export function isLienKind(value: string): value is LienKind {
  return (LIEN_KINDS as readonly string[]).includes(value);
}

export function isLienSource(value: string): value is LienSource {
  return (LIEN_SOURCES as readonly string[]).includes(value);
}

function isChecklistKey(value: string): value is ChecklistKey {
  return (CHECKLIST_KEYS as readonly string[]).includes(value);
}

function isRecommendation(value: string): value is Recommendation {
  return value === "approve" || value === "approve_with_deposit" || value === "review" || value === "decline";
}

function isSeverity(value: string): value is RiskSeverity {
  return value === "info" || value === "watch" || value === "high";
}

export function parseMortgages(value: unknown): MortgageRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const id = text(item.id).trim() || `mtg_${index + 1}`;
    const loanType = text(item.loanType);
    const isHeloc = bool(item.isHeloc, /heloc|equity line|credit line/i.test(loanType));
    return [
      {
        id,
        lender: text(item.lender),
        originalAmount: money(item.originalAmount),
        recordedDate: text(item.recordedDate) || null,
        loanType,
        interestRate: moneyOrNull(item.interestRate),
        termMonths: moneyOrNull(item.termMonths),
        isHeloc,
        position: Math.max(1, Math.round(money(item.position) || index + 1)),
      },
    ];
  });
}

export function parseLiens(value: unknown): LienRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = text(item.id).trim();
    if (!id) return [];
    const kind = text(item.kind);
    const source = text(item.source);
    return [
      {
        id,
        kind: isLienKind(kind) ? kind : "other",
        holder: text(item.holder),
        amount: money(item.amount),
        recordedDate: text(item.recordedDate) || null,
        source: isLienSource(source) ? source : "manual",
        verified: bool(item.verified, source === "title_commitment"),
        notes: text(item.notes),
      },
    ];
  });
}

export function parseDistress(value: unknown): DistressSignals {
  const row = isRecord(value) ? value : {};
  return {
    noticeOfDefault: bool(row.noticeOfDefault),
    lisPendens: bool(row.lisPendens),
    bankruptcy: bool(row.bankruptcy),
    taxLien: bool(row.taxLien),
    preForeclosureDate: text(row.preForeclosureDate) || null,
  };
}

export function parsePropertyRecord(value: unknown): PropertyRecord | null {
  if (!isRecord(value)) return null;
  const owners = Array.isArray(value.ownerNames)
    ? value.ownerNames.filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    : [];
  return {
    apn: text(value.apn),
    ownerNames: owners,
    vesting: text(value.vesting),
    ownerOccupied: boolOrNull(value.ownerOccupied),
    landUse: text(value.landUse),
    yearBuilt: moneyOrNull(value.yearBuilt),
    livingSqFt: moneyOrNull(value.livingSqFt),
    lotSqFt: moneyOrNull(value.lotSqFt),
    beds: moneyOrNull(value.beds),
    baths: moneyOrNull(value.baths),
    lastSaleDate: text(value.lastSaleDate) || null,
    lastSalePrice: moneyOrNull(value.lastSalePrice),
    assessedValue: moneyOrNull(value.assessedValue),
    avmValue: moneyOrNull(value.avmValue),
    avmLow: moneyOrNull(value.avmLow),
    avmHigh: moneyOrNull(value.avmHigh),
    avmConfidence: moneyOrNull(value.avmConfidence),
    annualTax: moneyOrNull(value.annualTax),
    taxDelinquentAmount: money(value.taxDelinquentAmount),
    mortgages: parseMortgages(value.mortgages),
    liens: parseLiens(value.liens),
    distress: parseDistress(value.distress),
    sourceName: text(value.sourceName),
    fetchedAt: text(value.fetchedAt),
  };
}

export function parseChecklist(value: unknown, state = ""): ChecklistItem[] {
  const base = stateChecklist(state);
  if (!Array.isArray(value)) return base;
  const saved = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const key = text(item.key);
    if (isChecklistKey(key)) saved.set(key, item);
  }
  return base.map((item) => {
    const row = saved.get(item.key);
    if (!row) return item;
    return {
      ...item,
      done: bool(row.done),
      doneAt: text(row.doneAt) || null,
    };
  });
}

export function parseReport(value: unknown): PayAtCloseReport | null {
  if (!isRecord(value) || !isRecord(value.waterfall)) return null;
  const w = value.waterfall;
  const lines = Array.isArray(w.lines)
    ? w.lines.flatMap((line) => {
        if (!isRecord(line)) return [];
        return [
          {
            key: text(line.key),
            label: text(line.label),
            amount: money(line.amount),
            estimated: bool(line.estimated),
            detail: text(line.detail),
          },
        ];
      })
    : [];
  const flags = Array.isArray(value.flags)
    ? value.flags.flatMap((flag) => {
        if (!isRecord(flag)) return [];
        const severity = text(flag.severity);
        return [
          {
            code: text(flag.code),
            severity: isSeverity(severity) ? severity : "info",
            title: text(flag.title),
            detail: text(flag.detail),
          },
        ];
      })
    : [];
  const recommendation = text(value.recommendation);
  const strings = (raw: unknown) =>
    Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
  return {
    generatedAt: text(value.generatedAt),
    waterfall: {
      estimatedValue: money(w.estimatedValue),
      valueSource: text(w.valueSource),
      valueEstimated: bool(w.valueEstimated, true),
      lines,
      seniorClaims: money(w.seniorClaims),
      closingCosts: money(w.closingCosts),
      netProceeds: money(w.netProceeds),
      payAtCloseAmount: money(w.payAtCloseAmount),
      coverageRatio: moneyOrNull(w.coverageRatio),
      cushion: money(w.cushion),
    },
    flags,
    score: Math.max(0, Math.min(100, Math.round(money(value.score)))),
    recommendation: isRecommendation(recommendation) ? recommendation : "review",
    narrative: text(value.narrative),
    sources: strings(value.sources),
    assumptions: strings(value.assumptions),
  };
}

export function parseInterview(value: unknown): PayAtCloseInterview {
  if (!isRecord(value)) return emptyInterview();
  const answers: Record<string, InterviewValue> = {};
  if (isRecord(value.answers)) {
    for (const [key, raw] of Object.entries(value.answers)) {
      if (raw === null || typeof raw === "string" || typeof raw === "boolean") answers[key] = raw;
      else if (typeof raw === "number" && Number.isFinite(raw)) answers[key] = raw;
    }
  }
  const sources: Record<string, InterviewSource> = {};
  if (isRecord(value.sources)) {
    for (const [key, raw] of Object.entries(value.sources)) {
      if (raw === "rep" || raw === "homeowner") sources[key] = raw;
    }
  }
  const completedAt = typeof value.completedAt === "string" && value.completedAt ? value.completedAt : null;
  return { answers, sources, completedAt };
}

export function parseApplicationUploads(value: unknown): ApplicationUpload[] {
  if (!Array.isArray(value)) return [];
  const uploads: ApplicationUpload[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.path !== "string" || !raw.path) continue;
    uploads.push({
      path: raw.path,
      name: text(raw.name) || raw.path.split("/").pop() || "file",
      size: typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0,
      contentType: text(raw.contentType),
      uploadedAt: text(raw.uploadedAt),
    });
  }
  return uploads;
}

/** Builds the application from the row's flat columns. Every input may be missing on old rows. */
export function parseApplication(row: Record<string, unknown> | null | undefined): PayAtCloseApplication {
  if (!row) return emptyApplication();
  const authorizations = Array.isArray(row.authorizations)
    ? row.authorizations.filter((item): item is string => typeof item === "string")
    : [];
  return {
    token: text(row.token),
    sentAt: typeof row.sentAt === "string" && row.sentAt ? row.sentAt : null,
    sentTo: text(row.sentTo),
    submittedAt: typeof row.submittedAt === "string" && row.submittedAt ? row.submittedAt : null,
    signatureName: text(row.signatureName),
    signatureImage: text(row.signatureImage),
    authorizations,
    uploads: parseApplicationUploads(row.uploads),
    ip: text(row.ip),
    userAgent: text(row.userAgent),
  };
}

export function emptyJobPayAtClose(jobId: string, id?: string, state = ""): JobPayAtClose {
  return {
    id: id ?? "",
    jobId,
    status: "screening",
    contractValue: 0,
    depositAmount: 0,
    expectedCloseDate: null,
    listingStatus: "",
    listPrice: 0,
    contractPrice: 0,
    sellerConcessions: 0,
    titleCompany: "",
    escrowOfficer: "",
    escrowEmail: "",
    escrowPhone: "",
    escrowFileNumber: "",
    listingAgent: "",
    signerNames: "",
    property: null,
    liens: [],
    checklist: stateChecklist(state),
    report: null,
    notes: "",
    requestedBy: "",
    requestedByName: "",
    requestedAt: null,
    decidedBy: "",
    decidedByName: "",
    decidedAt: null,
    decisionNote: "",
    interview: emptyInterview(),
    application: emptyApplication(),
    updatedAt: new Date().toISOString(),
  };
}

/** A fresh request from the job's New menu: screening, stamped with who asked. */
export function newPayAtCloseRequest(input: {
  jobId: string;
  id: string;
  state?: string;
  contractValue?: number;
  requester?: { id: string; name: string } | null;
  now?: Date;
}): JobPayAtClose {
  const now = input.now ?? new Date();
  const record = emptyJobPayAtClose(input.jobId, input.id, input.state ?? "");
  record.contractValue = input.contractValue ?? 0;
  record.requestedBy = input.requester?.id ?? "";
  record.requestedByName = input.requester?.name ?? "";
  record.requestedAt = now.toISOString();
  record.updatedAt = now.toISOString();
  return record;
}

/** Record a company admin's decision. Callers check `canDecidePayAtClose` first; the database checks again. */
export function decidePayAtClose(
  record: JobPayAtClose,
  decision: "approved" | "declined",
  admin: { id: string; name: string },
  note = "",
  now = new Date(),
): JobPayAtClose {
  return {
    ...record,
    status: decision,
    decidedBy: admin.id,
    decidedByName: admin.name,
    decidedAt: now.toISOString(),
    decisionNote: note.trim(),
    updatedAt: now.toISOString(),
  };
}

export function jobPayAtClosePayload(record: JobPayAtClose, companyId: string) {
  return {
    id: record.id,
    company_id: companyId,
    job_id: record.jobId,
    status: record.status,
    contract_value: record.contractValue,
    deposit_amount: record.depositAmount,
    expected_close_date: record.expectedCloseDate || null,
    listing_status: record.listingStatus,
    list_price: record.listPrice,
    contract_price: record.contractPrice,
    seller_concessions: record.sellerConcessions,
    title_company: record.titleCompany.trim(),
    escrow_officer: record.escrowOfficer.trim(),
    escrow_email: record.escrowEmail.trim(),
    escrow_phone: record.escrowPhone.trim(),
    escrow_file_number: record.escrowFileNumber.trim(),
    listing_agent: record.listingAgent.trim(),
    signer_names: record.signerNames.trim(),
    property: record.property,
    liens: record.liens,
    checklist: record.checklist,
    report: record.report,
    notes: record.notes,
    requested_by: record.requestedBy || null,
    requested_by_name: record.requestedByName.trim(),
    requested_at: record.requestedAt || null,
    decided_by: record.decidedBy || null,
    decided_by_name: record.decidedByName.trim(),
    decided_at: record.decidedAt || null,
    decision_note: record.decisionNote.trim(),
    interview: record.interview,
    application_token: record.application.token || null,
    application_sent_at: record.application.sentAt || null,
    application_sent_to: record.application.sentTo.trim(),
    application_submitted_at: record.application.submittedAt || null,
    application_signature_name: record.application.signatureName,
    application_signature_image: record.application.signatureImage,
    application_authorizations: record.application.authorizations,
    application_uploads: record.application.uploads,
    application_ip: record.application.ip,
    application_user_agent: record.application.userAgent,
    updated_at: record.updatedAt,
  };
}

/** Stamp a fresh link on the record. Re-sending after a submission keeps the signed copy; send a new request instead. */
export function sendPayAtCloseApplication(record: JobPayAtClose, token: string, sentTo: string, now = new Date()): JobPayAtClose {
  return {
    ...record,
    application: {
      ...record.application,
      token: record.application.token || token,
      sentAt: now.toISOString(),
      sentTo: sentTo.trim(),
    },
    updatedAt: now.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Qualification interview                                              */
/* ------------------------------------------------------------------ */

export type InterviewQuestionKind = "yes_no" | "text" | "long_text" | "money" | "date" | "select";

/** Record fields a question can write to directly, so the interview and the file never disagree. */
export type InterviewFieldKey =
  | "listingStatus"
  | "listingAgent"
  | "listPrice"
  | "contractPrice"
  | "expectedCloseDate"
  | "signerNames"
  | "contractValue"
  | "depositAmount"
  | "titleCompany"
  | "escrowOfficer"
  | "escrowEmail"
  | "escrowPhone"
  | "escrowFileNumber";

export type InterviewAudience = "rep" | "homeowner";

export interface InterviewQuestion {
  /** Answer key. When `field` is set the value lives on the record instead of `interview.answers`. */
  id: string;
  field?: InterviewFieldKey;
  kind: InterviewQuestionKind;
  /** What the rep asks the homeowner, or reads off the file. */
  prompt: string;
  /** Second-person wording for the homeowner application. Falls back to `prompt`. */
  homeownerPrompt?: string;
  /** Short label for summaries and the PDF. */
  label: string;
  help?: string;
  /** Help shown on the homeowner application instead of `help`. */
  homeownerHelp?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  /** Hide the question until the record makes it relevant. */
  showWhen?: (record: JobPayAtClose) => boolean;
  /** Who sees the question. Default: both the rep interview and the homeowner application. */
  audience?: InterviewAudience;
}

export interface InterviewStep {
  id: string;
  title: string;
  /** One line the rep can say to open the step. */
  intro: string;
  /** Opening line on the homeowner application. */
  homeownerIntro?: string;
  questions: InterviewQuestion[];
}

export const LEGAL_SITUATIONS = [
  { value: "none", label: "None of these" },
  { value: "trust", label: "Held in a trust" },
  { value: "llc", label: "Held by an LLC or company" },
  { value: "estate_probate", label: "Estate or probate" },
  { value: "divorce", label: "Divorce or separation" },
  { value: "other", label: "Something else" },
] as const;

export const REPAIR_REQUIRED_BY = [
  { value: "none", label: "No one; seller's choice" },
  { value: "buyer_inspection", label: "Buyer's inspection" },
  { value: "lender_appraisal", label: "Lender or appraiser" },
  { value: "insurance", label: "Insurance carrier" },
  { value: "listing_prep", label: "Listing agent, to list" },
] as const;

const underContract = (record: JobPayAtClose) =>
  record.listingStatus === "pending" || record.listingStatus === "under_contract" || record.listingStatus === "sold";

export const INTERVIEW_STEPS: InterviewStep[] = [
  {
    id: "sale",
    title: "The sale",
    intro: "Tell me about the sale so we can line our payment up with the closing.",
    homeownerIntro: "A few questions about the sale so we can line our payment up with your closing.",
    questions: [
      {
        id: "sale_reason",
        kind: "text",
        label: "Why selling",
        prompt: "Why is the homeowner selling?",
        homeownerPrompt: "Why are you selling?",
        required: true,
        help: "Relocation, downsizing, estate, financial pressure. The reason shapes how firm the closing date is.",
        homeownerHelp: "Moving, downsizing, settling an estate. A sentence is plenty.",
      },
      {
        id: "listingStatus",
        field: "listingStatus",
        kind: "select",
        label: "Listing",
        prompt: "Where does the listing stand today?",
        homeownerPrompt: "Where does your listing stand today?",
        required: true,
        options: LISTING_STATUSES.map((value) => ({ value, label: LISTING_STATUS_LABELS[value] })),
      },
      {
        id: "listingAgent",
        field: "listingAgent",
        kind: "text",
        label: "Listing agent",
        prompt: "Who is the listing agent, and with which brokerage?",
        homeownerPrompt: "Who is your listing agent, and with which brokerage?",
      },
      { id: "agent_email", kind: "text", label: "Agent email or phone", prompt: "", homeownerPrompt: "How do we reach your agent?", audience: "homeowner" },
      {
        id: "listPrice",
        field: "listPrice",
        kind: "money",
        label: "List price",
        prompt: "What is the list price, or the price they expect to list at?",
        homeownerPrompt: "What is the list price, or the price you expect to list at?",
      },
      {
        id: "contractPrice",
        field: "contractPrice",
        kind: "money",
        label: "Sale price",
        prompt: "What is the agreed sale price?",
        homeownerPrompt: "What sale price did you agree to?",
        showWhen: underContract,
      },
      {
        id: "expectedCloseDate",
        field: "expectedCloseDate",
        kind: "date",
        label: "Expected closing",
        prompt: "When is closing expected?",
        homeownerPrompt: "When do you expect to close?",
        required: true,
        homeownerHelp: "Your best guess is fine if a date is not set yet.",
      },
      {
        id: "prior_fall_through",
        kind: "yes_no",
        label: "Prior contract fell through",
        prompt: "Has this home been under contract before and fallen through?",
        homeownerPrompt: "Has this home been under contract before and fallen through?",
        required: true,
      },
      {
        id: "listing_expires_before_close",
        kind: "yes_no",
        label: "Listing expires before closing",
        prompt: "Does the listing agreement expire before the expected closing?",
        homeownerPrompt: "Does your listing agreement expire before the expected closing?",
      },
    ],
  },
  {
    id: "owners",
    title: "Ownership and signers",
    intro: "We need everyone on title to sign, so let's confirm who that is.",
    homeownerIntro: "Everyone on the deed signs the agreement, so help us confirm who that is.",
    questions: [
      {
        id: "signerNames",
        field: "signerNames",
        kind: "text",
        label: "Signers",
        prompt: "Who will sign our agreement? Write the names exactly as they appear on the deed.",
        homeownerPrompt: "Who is on the deed? Write each name exactly as it appears there.",
        required: true,
        help: "Checked against the owner of record when the property review runs.",
        homeownerHelp: "Found on your deed or your last property-tax statement.",
      },
      {
        id: "all_owners_signing",
        kind: "yes_no",
        label: "All owners signing",
        prompt: "Will every person on title, including a spouse, sign our agreement?",
        homeownerPrompt: "Will every person on the deed be able to sign our agreement?",
        required: true,
        help: "In Texas a homestead needs both spouses before work starts.",
      },
      {
        id: "spouse_not_on_deed",
        kind: "yes_no",
        label: "Married; spouse not on deed",
        prompt: "",
        homeownerPrompt: "Are you married to someone who is not on the deed?",
        homeownerHelp: "In some states a spouse signs even when they are not on the deed.",
        audience: "homeowner",
      },
      {
        id: "legal_situation",
        kind: "select",
        label: "Legal situation",
        prompt: "Is the property held in a trust or LLC, part of an estate or probate, or involved in a divorce?",
        homeownerPrompt: "Does any of these apply to the home?",
        required: true,
        options: [...LEGAL_SITUATIONS],
      },
      {
        id: "owner_occupied",
        kind: "yes_no",
        label: "Seller lives there",
        prompt: "Does the seller live in the home?",
        homeownerPrompt: "Do you live in the home?",
      },
    ],
  },
  {
    id: "debt",
    title: "What is owed",
    intro: "Our payment comes after the loans and liens, so we need a picture of what is owed.",
    homeownerIntro: "We are paid after your loans and liens at closing, so we need a picture of what is owed. Round numbers are fine.",
    questions: [
      {
        id: "lender_names",
        kind: "text",
        label: "Lender(s)",
        prompt: "",
        homeownerPrompt: "Who is your mortgage lender or servicer?",
        homeownerHelp: "The company you send the payment to.",
        audience: "homeowner",
      },
      {
        id: "mortgage_balance",
        kind: "money",
        label: "Mortgage balance (homeowner)",
        prompt: "About how much is owed on the first mortgage?",
        homeownerPrompt: "About how much is owed on your mortgage?",
        help: "Shown next to the public-record estimate. Only a payoff letter changes the math.",
      },
      {
        id: "mortgage_current",
        kind: "yes_no",
        label: "Current on mortgage",
        prompt: "Is the seller current on the mortgage?",
        homeownerPrompt: "Are you current on your mortgage payments?",
        required: true,
      },
      {
        id: "heloc_balance",
        kind: "money",
        label: "HELOC or second balance",
        prompt: "Is there a HELOC or second mortgage? What is the balance?",
        homeownerPrompt: "Do you have a home equity line or second mortgage? If so, about how much is owed?",
      },
      {
        id: "other_liens",
        kind: "long_text",
        label: "Other liens known",
        prompt: "Any property-tax, HOA, judgment, IRS, or contractor liens the seller knows of? Describe and estimate.",
        homeownerPrompt: "Are there any property-tax, HOA, judgment, IRS, or contractor liens on the home that you know of?",
        homeownerHelp: "If none, write none.",
      },
      {
        id: "payoff_statement",
        kind: "yes_no",
        label: "Payoff statement available",
        prompt: "Can the seller share a recent mortgage statement or payoff letter?",
        homeownerPrompt: "Can you share a recent mortgage statement or payoff letter?",
        required: true,
        help: "When yes, enter the figures as verified office liens on the file and they replace the estimate.",
        homeownerHelp: "You can upload it on this page. A statement lets us use your real balance instead of an estimate.",
      },
    ],
  },
  {
    id: "work",
    title: "The work",
    intro: "Now the job itself and what we are asking the closing to carry.",
    homeownerIntro: "A little about the repair and how it fits the sale.",
    questions: [
      {
        id: "contractValue",
        field: "contractValue",
        kind: "money",
        label: "Pay-at-close amount",
        prompt: "How much will we collect at closing?",
        required: true,
        audience: "rep",
      },
      {
        id: "deposit_possible",
        kind: "yes_no",
        label: "Deposit possible",
        prompt: "Can the seller pay anything up front?",
        homeownerPrompt: "Are you able to pay any part of the work up front?",
        homeownerHelp: "Not required. A deposit can make approval easier.",
      },
      {
        id: "depositAmount",
        field: "depositAmount",
        kind: "money",
        label: "Deposit",
        prompt: "How much up front?",
        homeownerPrompt: "About how much?",
        showWhen: (record) => record.interview.answers.deposit_possible === true,
      },
      {
        id: "repair_required_by",
        kind: "select",
        label: "Repair required by",
        prompt: "Is someone requiring this repair for the sale to go through?",
        homeownerPrompt: "Is someone requiring this repair for the sale to go through?",
        options: [...REPAIR_REQUIRED_BY],
      },
      {
        id: "completion_before_close",
        kind: "yes_no",
        label: "Done a week before closing",
        prompt: "Will the work be complete at least a week before closing?",
        required: true,
        audience: "rep",
      },
    ],
  },
  {
    id: "title",
    title: "Title and escrow",
    intro: "Last part: who pays us at the table.",
    homeownerIntro: "Last part: who is handling your closing. Skip anything you do not know yet.",
    questions: [
      {
        id: "titleCompany",
        field: "titleCompany",
        kind: "text",
        label: "Title company",
        prompt: "Which title or escrow company is handling the closing?",
        homeownerPrompt: "Which title or escrow company is handling your closing?",
      },
      { id: "escrowOfficer", field: "escrowOfficer", kind: "text", label: "Escrow officer", prompt: "Who is the escrow officer?", homeownerPrompt: "Who is your escrow or closing officer?" },
      { id: "escrowEmail", field: "escrowEmail", kind: "text", label: "Escrow email", prompt: "Escrow officer email?", homeownerPrompt: "Their email" },
      { id: "escrowPhone", field: "escrowPhone", kind: "text", label: "Escrow phone", prompt: "Escrow officer phone?", homeownerPrompt: "Their phone" },
      { id: "escrowFileNumber", field: "escrowFileNumber", kind: "text", label: "File number", prompt: "Escrow or title file number?", homeownerPrompt: "Your escrow or title file number, if you have it" },
      {
        id: "agent_committed",
        kind: "yes_no",
        label: "Agent agreed to settlement line",
        prompt: "Has the seller's agent agreed to put our payment on the settlement statement?",
        homeownerPrompt: "Has your agent agreed to put our payment on the settlement statement?",
        required: true,
        homeownerHelp: "If you are not sure, answer no and we will reach out to them.",
      },
    ],
  },
];

/** Steps as the rep sees them in the office interview. */
export const REP_INTERVIEW_STEPS: InterviewStep[] = INTERVIEW_STEPS.map((step) => ({
  ...step,
  questions: step.questions.filter((question) => question.audience !== "homeowner"),
}));

/** Steps as the homeowner sees them on the application: second-person wording, no office-only questions. */
export const APPLICATION_STEPS: InterviewStep[] = INTERVIEW_STEPS.map((step) => ({
  ...step,
  intro: step.homeownerIntro ?? step.intro,
  questions: step.questions
    .filter((question) => question.audience !== "rep")
    .map((question) => ({
      ...question,
      prompt: question.homeownerPrompt ?? question.prompt,
      help: question.homeownerHelp ?? (question.audience === "homeowner" ? question.help : undefined),
    })),
}));

export interface ApplicationProgress {
  answered: number;
  total: number;
  requiredMissing: InterviewQuestion[];
  complete: boolean;
  /** First step with a missing required answer, or the step count when none. */
  nextStepIndex: number;
}

/** Progress through the homeowner application, counting only questions the homeowner sees. */
export function applicationProgress(record: JobPayAtClose): ApplicationProgress {
  let answered = 0;
  let total = 0;
  const requiredMissing: InterviewQuestion[] = [];
  let nextStepIndex = APPLICATION_STEPS.length;
  APPLICATION_STEPS.forEach((step, index) => {
    let stepMissing = false;
    for (const question of step.questions) {
      if (!interviewQuestionVisible(record, question)) continue;
      total += 1;
      if (interviewAnswered(record, question)) answered += 1;
      else if (question.required) {
        requiredMissing.push(question);
        stepMissing = true;
      }
    }
    if (stepMissing && nextStepIndex === APPLICATION_STEPS.length) nextStepIndex = index;
  });
  return { answered, total, requiredMissing, complete: requiredMissing.length === 0, nextStepIndex };
}

export function interviewQuestions(): InterviewQuestion[] {
  return INTERVIEW_STEPS.flatMap((step) => step.questions);
}

export function findInterviewQuestion(id: string): InterviewQuestion | undefined {
  return interviewQuestions().find((question) => question.id === id);
}

export function interviewQuestionVisible(record: JobPayAtClose, question: InterviewQuestion) {
  return question.showWhen ? question.showWhen(record) : true;
}

export function interviewValue(record: JobPayAtClose, question: InterviewQuestion): InterviewValue {
  if (question.field) {
    const raw = record[question.field];
    return raw === undefined ? null : (raw as InterviewValue);
  }
  const raw = record.interview.answers[question.id];
  return raw === undefined ? null : raw;
}

export function interviewAnswered(record: JobPayAtClose, question: InterviewQuestion) {
  const value = interviewValue(record, question);
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return question.kind === "money" ? value > 0 : Number.isFinite(value);
  return true;
}

/** Returns a new record with the answer written where it belongs. Pass null to clear. */
export function setInterviewValue(record: JobPayAtClose, question: InterviewQuestion, value: InterviewValue): JobPayAtClose {
  if (question.field) {
    const next: JobPayAtClose = { ...record };
    switch (question.field) {
      case "listPrice":
      case "contractPrice":
      case "contractValue":
      case "depositAmount":
        next[question.field] = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
        break;
      case "listingStatus":
        next.listingStatus = typeof value === "string" && isListingStatus(value) ? value : "";
        break;
      case "expectedCloseDate":
        next.expectedCloseDate = typeof value === "string" && value ? value : null;
        break;
      default:
        next[question.field] = typeof value === "string" ? value : "";
    }
    return next;
  }
  const answers = { ...record.interview.answers };
  if (value === null) delete answers[question.id];
  else answers[question.id] = value;
  return { ...record, interview: { ...record.interview, answers } };
}

export interface InterviewProgress {
  answered: number;
  total: number;
  requiredMissing: InterviewQuestion[];
  /** Every required, visible question has an answer. */
  complete: boolean;
  /** The rep submitted the review step. */
  submitted: boolean;
  /** First step with a missing required answer, or the review step index when none. */
  nextStepIndex: number;
}

export function interviewProgress(record: JobPayAtClose): InterviewProgress {
  let answered = 0;
  let total = 0;
  const requiredMissing: InterviewQuestion[] = [];
  let nextStepIndex = REP_INTERVIEW_STEPS.length;
  REP_INTERVIEW_STEPS.forEach((step, index) => {
    let stepMissing = false;
    for (const question of step.questions) {
      if (!interviewQuestionVisible(record, question)) continue;
      total += 1;
      const done = interviewAnswered(record, question);
      if (done) answered += 1;
      else if (question.required) {
        requiredMissing.push(question);
        stepMissing = true;
      }
    }
    if (stepMissing && nextStepIndex === REP_INTERVIEW_STEPS.length) nextStepIndex = index;
  });
  return {
    answered,
    total,
    requiredMissing,
    complete: requiredMissing.length === 0,
    submitted: Boolean(record.interview.completedAt),
    nextStepIndex,
  };
}

/** Has the rep started answering at all? Old files and assistant-only reviews may have nothing. */
export function interviewStarted(record: JobPayAtClose) {
  return Object.keys(record.interview.answers).length > 0 || Boolean(record.interview.completedAt);
}

export function interviewValueLabel(question: InterviewQuestion, value: InterviewValue): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (question.kind) {
    case "yes_no":
      return value === true ? "Yes" : value === false ? "No" : String(value);
    case "money":
      return typeof value === "number" ? dollars(value) : String(value);
    case "select":
      return question.options?.find((option) => option.value === value)?.label ?? String(value);
    default:
      return String(value);
  }
}

export interface InterviewSummaryRow {
  step: string;
  label: string;
  value: string;
  /** Who answered. Field-bound values carry the source only when the homeowner supplied them. */
  source: InterviewSource;
}

/** Interview answers as label/value pairs for summaries and the PDF. Skips unanswered questions. */
export function interviewSummary(record: JobPayAtClose): InterviewSummaryRow[] {
  const rows: InterviewSummaryRow[] = [];
  for (const step of INTERVIEW_STEPS) {
    for (const question of step.questions) {
      if (!interviewQuestionVisible(record, question) || !interviewAnswered(record, question)) continue;
      rows.push({
        step: step.title,
        label: question.label,
        value: interviewValueLabel(question, interviewValue(record, question)),
        source: record.interview.sources[question.id] ?? "rep",
      });
    }
  }
  return rows;
}

/** Merge a homeowner's submission into the record the way the database RPC does, for optimistic UI and tests. */
export function applyApplicationSubmission(
  record: JobPayAtClose,
  submission: {
    answers: Record<string, InterviewValue>;
    fields: Partial<Record<InterviewFieldKey, InterviewValue>>;
    signatureName: string;
    signatureImage: string;
    authorizations: string[];
    now?: Date;
  },
): JobPayAtClose {
  const now = submission.now ?? new Date();
  let next: JobPayAtClose = {
    ...record,
    interview: { ...record.interview, answers: { ...record.interview.answers }, sources: { ...record.interview.sources } },
  };
  for (const question of interviewQuestions()) {
    if (question.audience === "rep") continue;
    const raw = question.field ? submission.fields[question.field] : submission.answers[question.id];
    if (raw === undefined || raw === null || raw === "") continue;
    next = setInterviewValue(next, question, raw);
    next.interview.sources[question.id] = "homeowner";
  }
  next.application = {
    ...next.application,
    submittedAt: now.toISOString(),
    signatureName: submission.signatureName.trim(),
    signatureImage: submission.signatureImage,
    authorizations: [...submission.authorizations],
  };
  next.updatedAt = now.toISOString();
  return next;
}

/* ------------------------------------------------------------------ */
/* Mortgage balance estimate                                            */
/* ------------------------------------------------------------------ */

/**
 * Freddie Mac PMMS annual average 30-year fixed rate by origination year.
 * Used only when the recorded deed of trust does not carry a note rate.
 */
const VINTAGE_RATES: Record<number, number> = {
  1995: 7.93, 1996: 7.81, 1997: 7.6, 1998: 6.94, 1999: 7.44,
  2000: 8.05, 2001: 6.97, 2002: 6.54, 2003: 5.83, 2004: 5.84,
  2005: 5.87, 2006: 6.41, 2007: 6.34, 2008: 6.03, 2009: 5.04,
  2010: 4.69, 2011: 4.45, 2012: 3.66, 2013: 3.98, 2014: 4.17,
  2015: 3.85, 2016: 3.65, 2017: 3.99, 2018: 4.54, 2019: 3.94,
  2020: 3.11, 2021: 2.96, 2022: 5.34, 2023: 6.81, 2024: 6.72,
  2025: 6.6, 2026: 6.3,
};

export function assumedRateForYear(year: number) {
  if (VINTAGE_RATES[year] != null) return VINTAGE_RATES[year];
  const years = Object.keys(VINTAGE_RATES).map(Number);
  const min = Math.min(...years);
  const max = Math.max(...years);
  if (year < min) return VINTAGE_RATES[min]!;
  return VINTAGE_RATES[max]!;
}

function monthsBetween(from: Date, to: Date) {
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  return Math.max(0, months);
}

export interface MortgageBalanceEstimate {
  balance: number;
  rateUsed: number;
  monthsElapsed: number;
  assumedRate: boolean;
  assumedTerm: boolean;
}

/**
 * Remaining principal on a fully amortizing loan, from the recorded original
 * amount and date. A HELOC is treated as fully drawn because draws are not public.
 */
export function estimateMortgageBalance(mortgage: MortgageRecord, asOf = new Date()): MortgageBalanceEstimate {
  const original = Math.max(0, mortgage.originalAmount);
  if (mortgage.isHeloc || !mortgage.recordedDate) {
    return {
      balance: roundMoney(original),
      rateUsed: mortgage.interestRate ?? 0,
      monthsElapsed: 0,
      assumedRate: false,
      assumedTerm: false,
    };
  }
  const recorded = new Date(mortgage.recordedDate);
  if (Number.isNaN(recorded.getTime())) {
    return { balance: roundMoney(original), rateUsed: 0, monthsElapsed: 0, assumedRate: false, assumedTerm: false };
  }
  const assumedRate = mortgage.interestRate == null || mortgage.interestRate <= 0;
  const rate = assumedRate ? assumedRateForYear(recorded.getUTCFullYear()) : mortgage.interestRate!;
  const assumedTerm = mortgage.termMonths == null || mortgage.termMonths <= 0;
  const term = assumedTerm ? 360 : Math.round(mortgage.termMonths!);
  const elapsed = Math.min(term, monthsBetween(recorded, asOf));
  const monthly = rate / 100 / 12;
  let balance: number;
  if (monthly === 0) {
    balance = original * (1 - elapsed / term);
  } else {
    const growth = Math.pow(1 + monthly, term);
    const payment = (original * monthly * growth) / (growth - 1);
    const grown = Math.pow(1 + monthly, elapsed);
    balance = original * grown - (payment * (grown - 1)) / monthly;
  }
  return {
    balance: roundMoney(Math.max(0, balance)),
    rateUsed: rate,
    monthsElapsed: elapsed,
    assumedRate,
    assumedTerm,
  };
}

/* ------------------------------------------------------------------ */
/* Equity waterfall                                                     */
/* ------------------------------------------------------------------ */

export interface WaterfallInput {
  record: Pick<
    JobPayAtClose,
    "contractValue" | "depositAmount" | "listPrice" | "contractPrice" | "sellerConcessions" | "liens" | "listingStatus"
  >;
  property: PropertyRecord | null;
  thresholds?: Partial<PayAtCloseThresholds>;
  asOf?: Date;
}

export function resolveThresholds(partial?: Partial<PayAtCloseThresholds>): PayAtCloseThresholds {
  return { ...DEFAULT_THRESHOLDS, ...(partial ?? {}) };
}

/** Pick the value to underwrite against: contract price, then list price, then a haircut AVM. */
export function pickEstimatedValue(
  record: Pick<JobPayAtClose, "listPrice" | "contractPrice" | "listingStatus">,
  property: PropertyRecord | null,
  thresholds: PayAtCloseThresholds,
) {
  const underContract = record.listingStatus === "under_contract" || record.listingStatus === "pending" || record.listingStatus === "sold";
  if (record.contractPrice > 0 && underContract) {
    return { value: record.contractPrice, source: "Sale contract price", estimated: false };
  }
  if (record.contractPrice > 0) {
    return { value: record.contractPrice, source: "Agreed sale price", estimated: false };
  }
  if (record.listPrice > 0) {
    const avm = property?.avmValue ?? 0;
    // A list price far above the AVM is a hope, not a value. Blend toward the AVM.
    if (avm > 0 && record.listPrice > avm * 1.15) {
      return { value: roundMoney((record.listPrice + avm) / 2), source: "List price blended with AVM", estimated: true };
    }
    return { value: record.listPrice, source: "List price", estimated: true };
  }
  if (property?.avmValue && property.avmValue > 0) {
    const confidence = property.avmConfidence ?? 70;
    const extraHaircut = confidence < 60 ? 0.05 : 0;
    const value = property.avmValue * (1 - thresholds.avmHaircut - extraHaircut);
    return { value: roundMoney(value), source: "AVM less haircut", estimated: true };
  }
  if (property?.assessedValue && property.assessedValue > 0) {
    return { value: property.assessedValue, source: "Assessed value", estimated: true };
  }
  if (property?.lastSalePrice && property.lastSalePrice > 0) {
    return { value: property.lastSalePrice, source: "Last sale price", estimated: true };
  }
  return { value: 0, source: "No value on file", estimated: true };
}

/**
 * Combine public-record liens with office / title liens. A title-commitment
 * entry of the same kind replaces the public-record estimate for that kind.
 */
export function effectiveLiens(property: PropertyRecord | null, officeLiens: LienRecord[]): LienRecord[] {
  const verifiedKinds = new Set(officeLiens.filter((lien) => lien.verified).map((lien) => lien.kind));
  const fromRecord = (property?.liens ?? []).filter((lien) => !verifiedKinds.has(lien.kind));
  return [...officeLiens, ...fromRecord];
}

export function equityWaterfall(input: WaterfallInput): EquityWaterfall {
  const thresholds = resolveThresholds(input.thresholds);
  const asOf = input.asOf ?? new Date();
  const { record, property } = input;
  const picked = pickEstimatedValue(record, property, thresholds);
  const lines: WaterfallLine[] = [];

  const verifiedMortgage = record.liens.some((lien) => lien.verified && (lien.kind === "mortgage" || lien.kind === "heloc"));
  if (!verifiedMortgage) {
    for (const mortgage of property?.mortgages ?? []) {
      const estimate = estimateMortgageBalance(mortgage, asOf);
      if (estimate.balance <= 0) continue;
      const kind = mortgage.isHeloc ? "HELOC (full line)" : `Mortgage ${mortgage.position}`;
      const rate = estimate.assumedRate ? `assumed ${estimate.rateUsed.toFixed(2)}%` : `${estimate.rateUsed.toFixed(2)}%`;
      lines.push({
        key: `mortgage:${mortgage.id}`,
        label: `${kind}${mortgage.lender ? ` · ${mortgage.lender}` : ""}`,
        amount: estimate.balance,
        estimated: true,
        detail: mortgage.isHeloc
          ? `Recorded line ${dollars(mortgage.originalAmount)}; draws are not public so the full line is counted.`
          : `Recorded ${dollars(mortgage.originalAmount)}${mortgage.recordedDate ? ` on ${mortgage.recordedDate}` : ""}, amortized ${estimate.monthsElapsed} months at ${rate}.`,
      });
    }
  }

  for (const lien of effectiveLiens(property, record.liens)) {
    if (lien.amount <= 0) continue;
    lines.push({
      key: `lien:${lien.id}`,
      label: `${LIEN_KIND_LABELS[lien.kind]}${lien.holder ? ` · ${lien.holder}` : ""}`,
      amount: roundMoney(lien.amount),
      estimated: !lien.verified,
      detail: `${LIEN_SOURCE_LABELS[lien.source]}${lien.recordedDate ? `, recorded ${lien.recordedDate}` : ""}${lien.notes ? `. ${lien.notes}` : ""}`,
    });
  }

  const taxDelinquent = property?.taxDelinquentAmount ?? 0;
  const taxAlreadyListed = record.liens.some((lien) => lien.kind === "property_tax");
  if (taxDelinquent > 0 && !taxAlreadyListed) {
    lines.push({
      key: "tax:delinquent",
      label: "Delinquent property tax",
      amount: roundMoney(taxDelinquent),
      estimated: true,
      detail: "Per the assessor record. Paid first at closing.",
    });
  }

  const seniorClaims = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  const commission = roundMoney(picked.value * thresholds.commissionRate);
  const otherCosts = roundMoney(picked.value * thresholds.otherSellerCostRate);
  const concessions = roundMoney(Math.max(0, record.sellerConcessions));
  const closingCosts = roundMoney(commission + otherCosts + concessions);
  const payAtCloseAmount = roundMoney(Math.max(0, record.contractValue - Math.max(0, record.depositAmount)));
  const netProceeds = roundMoney(picked.value - seniorClaims - closingCosts);
  const coverageRatio = payAtCloseAmount > 0 ? roundMoney(netProceeds / payAtCloseAmount) : null;

  return {
    estimatedValue: roundMoney(picked.value),
    valueSource: picked.source,
    valueEstimated: picked.estimated,
    lines,
    seniorClaims,
    closingCosts,
    netProceeds,
    payAtCloseAmount,
    coverageRatio,
    cushion: roundMoney(netProceeds - payAtCloseAmount),
  };
}

/* ------------------------------------------------------------------ */
/* Risk flags and score                                                 */
/* ------------------------------------------------------------------ */

export interface RiskInput {
  record: JobPayAtClose;
  property: PropertyRecord | null;
  waterfall: EquityWaterfall;
  /** State the job sits in, for lien-law notes. */
  state: string;
  thresholds?: Partial<PayAtCloseThresholds>;
  today?: Date;
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(the|trust|trustee|trustees|living|revocable|family|estate|of|llc|inc|jr|sr|ii|iii)\b/g, " ")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length > 1);
}

/** True when every signer shares at least a last name with someone on title. */
export function signersMatchOwners(signerNames: string, ownerNames: string[]) {
  const signers = signerNames
    .split(/[,;&\n]|\band\b/i)
    .map((name) => name.trim())
    .filter(Boolean);
  if (signers.length === 0 || ownerNames.length === 0) return null;
  const ownerParts = new Set(ownerNames.flatMap(normalizeName));
  return signers.every((signer) => normalizeName(signer).some((part) => ownerParts.has(part)));
}

function daysUntil(date: string | null, today: Date) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function riskFlags(input: RiskInput): RiskFlag[] {
  const thresholds = resolveThresholds(input.thresholds);
  const today = input.today ?? new Date();
  const { record, property, waterfall } = input;
  const flags: RiskFlag[] = [];

  if (waterfall.payAtCloseAmount <= 0) {
    flags.push({
      code: "no_contract_value",
      severity: "watch",
      title: "No pay-at-close amount yet",
      detail: "Enter what this company collects at closing so coverage can be measured.",
    });
  }
  if (waterfall.estimatedValue <= 0) {
    flags.push({
      code: "no_value",
      severity: "high",
      title: "No property value",
      detail: "No list price, contract price, or AVM. Coverage cannot be measured.",
    });
  } else if (waterfall.coverageRatio != null) {
    if (waterfall.coverageRatio < thresholds.declineCoverage) {
      flags.push({
        code: "coverage_thin",
        severity: "high",
        title: `Net proceeds cover ${waterfall.coverageRatio.toFixed(2)}× our contract`,
        detail: `Estimated seller net of ${dollars(waterfall.netProceeds)} against ${dollars(waterfall.payAtCloseAmount)} due at closing. A small price cut or payoff surprise wipes out our payment.`,
      });
    } else if (waterfall.coverageRatio < thresholds.depositCoverage) {
      flags.push({
        code: "coverage_low",
        severity: "high",
        title: `Coverage ${waterfall.coverageRatio.toFixed(2)}× is below the deposit line`,
        detail: `Collect a deposit or shrink the scope. Target at least ${thresholds.depositCoverage.toFixed(2)}×.`,
      });
    } else if (waterfall.coverageRatio < thresholds.approveCoverage) {
      flags.push({
        code: "coverage_ok_deposit",
        severity: "watch",
        title: `Coverage ${waterfall.coverageRatio.toFixed(2)}× supports approval with a deposit`,
        detail: `Below the ${thresholds.approveCoverage.toFixed(2)}× no-deposit line. A deposit of 20 to 30 percent keeps the cushion.`,
      });
    }
  }

  if (waterfall.valueEstimated && waterfall.estimatedValue > 0) {
    flags.push({
      code: "value_estimated",
      severity: "info",
      title: `Value is ${waterfall.valueSource.toLowerCase()}`,
      detail: "No signed sale contract yet. Re-run the review once the home goes under contract.",
    });
  }

  if (property) {
    const avmSpread =
      property.avmLow != null && property.avmHigh != null && property.avmValue
        ? (property.avmHigh - property.avmLow) / property.avmValue
        : null;
    if ((property.avmConfidence != null && property.avmConfidence < 60) || (avmSpread != null && avmSpread > 0.3)) {
      flags.push({
        code: "avm_wide",
        severity: "watch",
        title: "Valuation range is wide",
        detail: `AVM ${property.avmLow != null && property.avmHigh != null ? `${dollars(property.avmLow)} to ${dollars(property.avmHigh)}` : "confidence is low"}. Lean on the list price or ask the agent for comps.`,
      });
    }

    const estimatedMortgage = waterfall.lines.filter((line) => line.key.startsWith("mortgage:") && line.estimated);
    if (estimatedMortgage.length > 0) {
      flags.push({
        code: "mortgage_estimated",
        severity: "info",
        title: "Loan balances are estimated from recorded originals",
        detail: "Balances are not public. Ask the title company for payoff demands before releasing crews.",
      });
    }
    if ((property.mortgages ?? []).some((mortgage) => mortgage.isHeloc)) {
      flags.push({
        code: "heloc",
        severity: "watch",
        title: "An equity line is recorded",
        detail: "The full line is counted as owed. A payoff letter can only lower this number.",
      });
    }
    if ((property.mortgages ?? []).length >= 2 && !(property.mortgages ?? []).some((m) => m.isHeloc)) {
      flags.push({
        code: "second_mortgage",
        severity: "watch",
        title: "More than one mortgage is recorded",
        detail: "Confirm the older loan was reconveyed. Recorders often lag on releases.",
      });
    }

    const match = signersMatchOwners(record.signerNames, property.ownerNames);
    if (match === false) {
      flags.push({
        code: "owner_mismatch",
        severity: "high",
        title: "Signer does not match the owner of record",
        detail: `Title shows ${property.ownerNames.join(", ")}. Our agreement is signed by ${record.signerNames}. Get every owner on title to sign, or a power of attorney.`,
      });
    } else if (match === null && property.ownerNames.length > 0 && !record.signerNames.trim()) {
      flags.push({
        code: "signer_unknown",
        severity: "watch",
        title: "Add who signs our agreement",
        detail: `Owner of record: ${property.ownerNames.join(", ")}. Type the signer names to check them against title.`,
      });
    }
    if (/trust|llc|estate|corp|inc\b/i.test(property.vesting) || property.ownerNames.some((name) => /trust|llc|estate|corp|inc\b/i.test(name))) {
      flags.push({
        code: "entity_vesting",
        severity: "watch",
        title: `Title is held by ${property.vesting || "an entity"}`,
        detail: "Collect the trust certificate, operating agreement, or letters testamentary showing who can sign.",
      });
    }
    if (property.ownerOccupied === false) {
      flags.push({
        code: "non_owner_occupied",
        severity: "info",
        title: "Mailing address differs from the property",
        detail: "Likely a rental or inherited home. Confirm who is selling and where notices go.",
      });
    }

    const d = property.distress;
    if (d.noticeOfDefault || d.preForeclosureDate) {
      flags.push({
        code: "notice_of_default",
        severity: "high",
        title: "Notice of default is on record",
        detail: `Pre-foreclosure${d.preForeclosureDate ? ` since ${d.preForeclosureDate}` : ""}. The lender's arrears and fees come before us. Require a payoff demand and a firm closing date.`,
      });
    }
    if (d.lisPendens) {
      flags.push({
        code: "lis_pendens",
        severity: "high",
        title: "Lis pendens recorded",
        detail: "Pending litigation touches title. The sale may not be able to close until it clears.",
      });
    }
    if (d.bankruptcy) {
      flags.push({
        code: "bankruptcy",
        severity: "high",
        title: "Bankruptcy filing found",
        detail: "Court approval may be required to sell or pay us. Decline unless the trustee signs off.",
      });
    }
    if (d.taxLien || property.taxDelinquentAmount > 0) {
      flags.push({
        code: "tax_delinquent",
        severity: "watch",
        title: property.taxDelinquentAmount > 0 ? `${dollars(property.taxDelinquentAmount)} of property tax is delinquent` : "Tax lien recorded",
        detail: "Taxes are paid ahead of everyone at closing. Already counted in the waterfall.",
      });
    }
    const openLiens = effectiveLiens(property, record.liens).filter((lien) => lien.kind === "mechanics" || lien.kind === "judgment" || lien.kind === "hoa");
    if (openLiens.length > 0) {
      flags.push({
        code: "junior_liens",
        severity: "watch",
        title: `${openLiens.length} other lien${openLiens.length === 1 ? "" : "s"} on record`,
        detail: openLiens.map((lien) => `${LIEN_KIND_LABELS[lien.kind]} ${dollars(lien.amount)}${lien.holder ? ` (${lien.holder})` : ""}`).join("; "),
      });
    }
    if (property.lastSaleDate) {
      const soldDays = -1 * (daysUntil(property.lastSaleDate, today) ?? 0);
      if (soldDays >= 0 && soldDays < 365) {
        flags.push({
          code: "recent_sale",
          severity: "watch",
          title: "Property changed hands in the last year",
          detail: `Last sale ${property.lastSaleDate}${property.lastSalePrice ? ` for ${dollars(property.lastSalePrice)}` : ""}. Little time to build equity; may be a flip.`,
        });
      }
    }
  } else {
    flags.push({
      code: "no_property_record",
      severity: "watch",
      title: "No property record pulled yet",
      detail: "Run the property review to pull ownership, loans, and liens from public records.",
    });
  }

  const closeDays = daysUntil(record.expectedCloseDate, today);
  if (closeDays == null) {
    flags.push({
      code: "no_close_date",
      severity: "watch",
      title: "No expected closing date",
      detail: "Pay at close is a carry. Put a date on it so the office knows when money is due.",
    });
  } else if (closeDays < 0 && record.status !== "paid" && record.status !== "fell_through") {
    flags.push({
      code: "close_passed",
      severity: "high",
      title: `Expected closing was ${Math.abs(closeDays)} days ago`,
      detail: "Call the title company. Update the date or move this to fell through and start lien steps.",
    });
  } else if (closeDays > thresholds.longCarryDays) {
    flags.push({
      code: "long_carry",
      severity: "watch",
      title: `${closeDays} days until closing`,
      detail: `Longer than the ${thresholds.longCarryDays}-day carry line. Consider a deposit or progress payment.`,
    });
  }

  if (!record.listingStatus || record.listingStatus === "not_listed") {
    flags.push({
      code: "not_listed",
      severity: "watch",
      title: "Home is not listed",
      detail: "No buyer in sight means no closing. Prefer homes under contract with inspection repairs.",
    });
  } else if (record.listingStatus === "off_market") {
    flags.push({
      code: "off_market",
      severity: "high",
      title: "Listing went off market",
      detail: "The sale that was going to pay us may be gone. Confirm with the agent and consider lien notice.",
    });
  }

  flags.push(...interviewFlags(record, property, today));

  if (record.contractValue > thresholds.maxContractValue) {
    flags.push({
      code: "large_contract",
      severity: "watch",
      title: `Contract above the ${dollars(thresholds.maxContractValue)} review line`,
      detail: "Needs an owner or director sign-off regardless of coverage.",
    });
  }

  if (!record.titleCompany.trim()) {
    flags.push({
      code: "no_title_company",
      severity: "watch",
      title: "No title company on file",
      detail: "Our escrow instruction letter has nowhere to go. Get the title company and file number from the agent.",
    });
  }

  for (const item of record.checklist) {
    if (item.done) continue;
    if (item.key === "assignment_of_proceeds" || item.key === "escrow_instructions") {
      flags.push({
        code: `checklist:${item.key}`,
        severity: record.status === "screening" ? "info" : "watch",
        title: `${item.label} not done`,
        detail: item.detail,
      });
    }
  }

  const order: Record<RiskSeverity, number> = { high: 0, watch: 1, info: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** What the rep learned from the homeowner. Public records cannot see most of this. */
function interviewFlags(record: JobPayAtClose, property: PropertyRecord | null, today: Date): RiskFlag[] {
  const a = record.interview.answers;
  const flags: RiskFlag[] = [];
  const progress = interviewProgress(record);
  const afterApproval = PAY_AT_CLOSE_POST_APPROVAL_STATUSES.includes(record.status);

  if (!progress.complete) {
    const names = progress.requiredMissing.slice(0, 3).map((question) => question.label.toLowerCase());
    flags.push({
      code: "interview_incomplete",
      severity: "watch",
      title: `Qualification interview not finished (${progress.answered} of ${progress.total})`,
      detail: `Still needed: ${names.join(", ")}${progress.requiredMissing.length > 3 ? ", and more" : ""}. The deal cannot be approved until the required questions are answered.`,
    });
  }

  if (a.legal_situation === "estate_probate" || a.legal_situation === "divorce") {
    const probate = a.legal_situation === "estate_probate";
    flags.push({
      code: "court_or_dispute",
      severity: "high",
      title: probate ? "Estate or probate sale" : "Divorce or separation",
      detail: probate
        ? "The personal representative must have letters testamentary and, in some states, court approval to sell and to sign for repairs. Get the letters before approving."
        : "Both spouses usually must sign, and a decree or court order may control who gets proceeds. Get the order or both signatures before approving.",
    });
  } else if ((a.legal_situation === "trust" || a.legal_situation === "llc") && !flagsHaveEntity(property)) {
    flags.push({
      code: "entity_vesting",
      severity: "watch",
      title: a.legal_situation === "trust" ? "Seller says title is held in a trust" : "Seller says an LLC holds title",
      detail: "Collect the trust certificate or operating agreement showing who can sign. The public record did not show this yet.",
    });
  }

  if (a.all_owners_signing === false) {
    flags.push({
      code: "missing_signer",
      severity: "high",
      title: "Not every owner will sign",
      detail: "An assignment of proceeds signed by one of two owners only reaches that owner's half, and a homestead spouse can void the contract. Get every owner on the agreement.",
    });
  }

  if (a.mortgage_current === false) {
    flags.push({
      code: "mortgage_delinquent",
      severity: "high",
      title: "Seller is behind on the mortgage",
      detail: "Arrears, late fees, and foreclosure costs come out ahead of us at closing, and the lender may start foreclosure before the sale closes. Get a payoff letter before approving.",
    });
  }

  if (a.prior_fall_through === true) {
    flags.push({
      code: "prior_fall_through",
      severity: "watch",
      title: "A prior contract fell through",
      detail: "Ask why. Inspection, appraisal, or financing problems tend to repeat and push the closing out.",
    });
  }

  if (a.listing_expires_before_close === true) {
    flags.push({
      code: "listing_expires",
      severity: "watch",
      title: "Listing agreement expires before closing",
      detail: "If the seller changes agents or pulls the listing, our settlement line goes with it. Get the extension or a direct commitment from the seller.",
    });
  }

  if (a.agent_committed === false || (a.agent_committed == null && afterApproval)) {
    flags.push({
      code: "agent_not_committed",
      severity: afterApproval ? "high" : "watch",
      title: a.agent_committed === false ? "Agent has not agreed to the settlement line" : "Agent commitment unknown",
      detail: "The closing agent pays what the settlement statement says. Get the listing agent's written agreement to add our payment, then send the escrow instruction letter.",
    });
  }

  if (a.repair_required_by === "buyer_inspection" || a.repair_required_by === "lender_appraisal") {
    flags.push({
      code: "lender_required",
      severity: "info",
      title: a.repair_required_by === "lender_appraisal" ? "Repair required by the lender" : "Repair required by the buyer's inspection",
      detail: "The sale depends on this work, which makes the closing more likely to carry our payment.",
    });
  }

  if (a.completion_before_close === false) {
    flags.push({
      code: "completion_after_close",
      severity: "high",
      title: "Work will not be done a week before closing",
      detail: "Closing agents need the invoice and lien waiver before funding. If we finish after closing there is nothing to pay us from.",
    });
  }

  if (a.owner_occupied === false && !property) {
    flags.push({
      code: "non_owner_occupied",
      severity: "info",
      title: "Seller does not live in the home",
      detail: "Likely a rental or inherited home. Confirm who is selling and where notices go.",
    });
  }

  const appState = applicationState(record.application);
  if (appState === "sent") {
    const sentDays = record.application.sentAt ? Math.floor((today.getTime() - new Date(record.application.sentAt).getTime()) / 86_400_000) : 0;
    flags.push({
      code: "application_unsigned",
      severity: "watch",
      title: sentDays >= 2 ? `Homeowner application unsigned for ${sentDays} days` : "Homeowner application not signed yet",
      detail: "The homeowner has the link but has not finished or signed. Their authorizations for the records review and the settlement line are not in hand.",
    });
  } else if (appState === "submitted" && a.spouse_not_on_deed === true) {
    flags.push({
      code: "spouse_off_title",
      severity: "watch",
      title: "Homeowner is married to someone not on the deed",
      detail: "Community-property and homestead states can require the spouse's signature anyway. Ask the title company whether the spouse joins.",
    });
  }

  const reported = typeof a.mortgage_balance === "number" ? a.mortgage_balance : 0;
  const verifiedMortgage = record.liens.some((lien) => lien.verified && lien.kind === "mortgage");
  if (reported > 0 && !verifiedMortgage && property?.mortgages.length) {
    const estimated = property.mortgages
      .filter((mortgage) => !mortgage.isHeloc)
      .reduce((sum, mortgage) => sum + estimateMortgageBalance(mortgage, today).balance, 0);
    if (estimated > 0 && Math.abs(reported - estimated) / estimated > 0.15) {
      flags.push({
        code: "homeowner_balance_differs",
        severity: reported > estimated ? "watch" : "info",
        title: `Homeowner says ${dollars(reported)} is owed; records estimate ${dollars(estimated)}`,
        detail:
          reported > estimated
            ? "The homeowner's figure is higher than the amortized estimate. A refinance or second may not be recorded yet. Get the payoff letter."
            : "The homeowner's figure is lower than the amortized estimate; they may have paid ahead. Only a payoff letter changes the math.",
      });
    }
  }

  return flags;
}

function flagsHaveEntity(property: PropertyRecord | null) {
  if (!property) return false;
  return /trust|llc|estate|corp|inc\b/i.test(property.vesting) || property.ownerNames.some((name) => /trust|llc|estate|corp|inc\b/i.test(name));
}

const FLAG_WEIGHTS: Record<string, number> = {
  coverage_thin: 45,
  coverage_low: 30,
  coverage_ok_deposit: 10,
  no_value: 40,
  no_contract_value: 5,
  value_estimated: 4,
  avm_wide: 6,
  mortgage_estimated: 3,
  heloc: 8,
  second_mortgage: 6,
  owner_mismatch: 30,
  signer_unknown: 4,
  entity_vesting: 8,
  non_owner_occupied: 3,
  notice_of_default: 30,
  lis_pendens: 30,
  bankruptcy: 40,
  tax_delinquent: 8,
  junior_liens: 10,
  recent_sale: 8,
  no_property_record: 15,
  no_close_date: 8,
  close_passed: 25,
  long_carry: 8,
  not_listed: 12,
  off_market: 30,
  large_contract: 6,
  no_title_company: 5,
  interview_incomplete: 10,
  court_or_dispute: 25,
  missing_signer: 30,
  mortgage_delinquent: 25,
  prior_fall_through: 6,
  listing_expires: 6,
  agent_not_committed: 8,
  lender_required: -5,
  completion_after_close: 25,
  homeowner_balance_differs: 3,
  application_unsigned: 6,
  spouse_off_title: 8,
};

export function riskScore(flags: RiskFlag[]) {
  let penalty = 0;
  for (const flag of flags) {
    const weight = FLAG_WEIGHTS[flag.code] ?? (flag.severity === "high" ? 20 : flag.severity === "watch" ? 6 : 2);
    penalty += weight;
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function recommend(waterfall: EquityWaterfall, flags: RiskFlag[], thresholds?: Partial<PayAtCloseThresholds>): Recommendation {
  const t = resolveThresholds(thresholds);
  const hard = new Set(["bankruptcy", "lis_pendens", "owner_mismatch", "no_value"]);
  if (flags.some((flag) => hard.has(flag.code))) return "decline";
  if (waterfall.coverageRatio == null) return "review";
  if (waterfall.coverageRatio < t.declineCoverage) return "decline";
  const highs = flags.filter((flag) => flag.severity === "high").length;
  if (highs > 0) return "review";
  if (flags.some((flag) => flag.code === "interview_incomplete")) return "review";
  if (waterfall.coverageRatio >= t.approveCoverage) return "approve";
  if (waterfall.coverageRatio >= t.depositCoverage) return "approve_with_deposit";
  return "review";
}

/* ------------------------------------------------------------------ */
/* State checklist                                                      */
/* ------------------------------------------------------------------ */

type StateNotes = Partial<Record<ChecklistKey, string>>;

/**
 * Lien-notice rules differ by state. These are plain-language office reminders,
 * not legal advice; the office confirms deadlines with counsel.
 */
const STATE_NOTES: Record<string, StateNotes> = {
  TX: {
    prelim_notice:
      "Texas: on a residential homestead the contract must be signed by both spouses before work starts and the notice of intent to lien is due by the 15th of the 2nd month after the work month.",
    agreement_signed: "Texas homestead: both spouses sign and the contract is recorded at the county clerk before any work.",
  },
  CA: {
    prelim_notice: "California: a 20-day preliminary notice protects lien rights for work performed from 20 days before it is served.",
  },
  AZ: {
    prelim_notice: "Arizona: the 20-day preliminary notice must go to the owner, lender, and general contractor.",
  },
  CO: {
    prelim_notice: "Colorado: a notice of intent to lien goes out at least 10 days before recording the lien statement.",
  },
  FL: {
    prelim_notice: "Florida: a notice to owner is due within 45 days of first furnishing when we are not in direct contract with the owner.",
  },
  GA: {
    prelim_notice: "Georgia: lien must be filed within 90 days of last work; notice to the owner within 2 business days of filing.",
  },
  WA: {
    prelim_notice: "Washington: residential work needs the model disclosure statement before the contract; lien filed within 90 days of last work.",
  },
  OR: {
    prelim_notice: "Oregon: the information notice to owner is required on residential jobs above $2,000.",
  },
  NC: {
    prelim_notice: "North Carolina: file a notice to lien agent when a lien agent is designated for the project.",
  },
  UT: {
    prelim_notice: "Utah: preliminary notice on the State Construction Registry within 20 days of first work.",
  },
};

export function stateChecklist(state: string): ChecklistItem[] {
  const code = state.trim().toUpperCase();
  const notes = STATE_NOTES[code] ?? {};
  const base: Array<Omit<ChecklistItem, "done" | "doneAt">> = [
    {
      key: "agreement_signed",
      label: "Pay-at-close agreement signed",
      detail:
        notes.agreement_signed ??
        "Every owner on title signs the repair agreement with the payment due at closing from seller proceeds.",
      dueNote: "Before work starts",
    },
    {
      key: "assignment_of_proceeds",
      label: "Assignment of proceeds signed",
      detail: "Seller irrevocably directs the closing agent to pay this company from proceeds before the seller is paid.",
      dueNote: "Before work starts",
    },
    {
      key: "escrow_instructions",
      label: "Escrow instruction letter sent to title",
      detail: "The title company acknowledges the assignment and our payoff amount in the closing file.",
      dueNote: "Within 3 days of signing",
    },
    {
      key: "prelim_notice",
      label: "Preliminary / intent-to-lien notice",
      detail:
        notes.prelim_notice ??
        "Send the state's preliminary notice so lien rights survive if the sale falls through.",
      dueNote: "Per state deadline",
    },
    {
      key: "title_commitment",
      label: "Title commitment reviewed",
      detail: "Schedule B exceptions and payoffs reconciled against the public-record estimate.",
      dueNote: "Before releasing crews",
    },
    {
      key: "payoff_demand",
      label: "Lender payoff demands on file",
      detail: "Replaces the amortized estimate with the real balance for every recorded loan.",
      dueNote: "Before releasing crews",
    },
    {
      key: "completion_sign_off",
      label: "Completion sign-off from seller",
      detail: "Signed completion certificate and photos so the closing agent has no reason to hold funds.",
      dueNote: "At completion",
    },
    {
      key: "lien_waiver_ready",
      label: "Conditional lien waiver ready for closing",
      detail: "Delivered to title in exchange for the wire at closing.",
      dueNote: "Before closing",
    },
  ];
  return base.map((item) => ({ ...item, done: false, doneAt: null }));
}

/* ------------------------------------------------------------------ */
/* Report assembly                                                      */
/* ------------------------------------------------------------------ */

export interface BuildReportInput {
  record: JobPayAtClose;
  property: PropertyRecord | null;
  state: string;
  thresholds?: Partial<PayAtCloseThresholds>;
  today?: Date;
  /** Model-written narrative. When blank the deterministic one is used. */
  narrative?: string;
}

export function buildPayAtCloseReport(input: BuildReportInput): PayAtCloseReport {
  const today = input.today ?? new Date();
  const waterfall = equityWaterfall({
    record: input.record,
    property: input.property,
    thresholds: input.thresholds,
    asOf: today,
  });
  const flags = riskFlags({
    record: input.record,
    property: input.property,
    waterfall,
    state: input.state,
    thresholds: input.thresholds,
    today,
  });
  const score = riskScore(flags);
  const recommendation = recommend(waterfall, flags, input.thresholds);
  const t = resolveThresholds(input.thresholds);
  const assumptions = [
    `Seller closing costs assumed at ${(t.commissionRate * 100).toFixed(1)}% commission plus ${(t.otherSellerCostRate * 100).toFixed(1)}% title, transfer, and prorations.`,
    "Mortgage balances are amortized from the recorded original amount; actual payoffs will differ.",
    "Equity lines are counted as fully drawn.",
    waterfall.valueEstimated ? `Value is ${waterfall.valueSource.toLowerCase()}, not a signed sale price.` : "Value is the agreed sale price.",
  ];
  const sources = [
    input.property?.sourceName ? `${input.property.sourceName}${input.property.fetchedAt ? ` as of ${input.property.fetchedAt.slice(0, 10)}` : ""}` : "No public-record pull yet",
    ...(input.record.liens.some((lien) => lien.source === "title_commitment") ? ["Title commitment entered by the office"] : []),
    ...(input.record.liens.some((lien) => lien.source === "manual") ? ["Liens entered by the office"] : []),
  ];
  return {
    generatedAt: today.toISOString(),
    waterfall,
    flags,
    score,
    recommendation,
    narrative: input.narrative?.trim() || defaultNarrative(waterfall, flags, recommendation),
    sources,
    assumptions,
  };
}

export function defaultNarrative(waterfall: EquityWaterfall, flags: RiskFlag[], recommendation: Recommendation) {
  const parts: string[] = [];
  if (waterfall.estimatedValue > 0) {
    parts.push(
      `Underwriting against ${dollars(waterfall.estimatedValue)} (${waterfall.valueSource.toLowerCase()}). After ${dollars(waterfall.seniorClaims)} in loans and liens and ${dollars(waterfall.closingCosts)} in seller closing costs, the seller nets about ${dollars(waterfall.netProceeds)}.`,
    );
  } else {
    parts.push("There is no usable property value yet, so coverage cannot be measured.");
  }
  if (waterfall.coverageRatio != null) {
    parts.push(
      `That covers our ${dollars(waterfall.payAtCloseAmount)} ${waterfall.coverageRatio.toFixed(2)} times, leaving the seller ${dollars(waterfall.cushion)} after we are paid.`,
    );
  }
  const highs = flags.filter((flag) => flag.severity === "high");
  if (highs.length) {
    parts.push(`Watch: ${highs.map((flag) => flag.title.toLowerCase()).join("; ")}.`);
  }
  parts.push(`Recommendation: ${RECOMMENDATION_LABELS[recommendation].toLowerCase()}.`);
  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/* Desk totals                                                          */
/* ------------------------------------------------------------------ */

export interface PayAtCloseExposure {
  openCount: number;
  openAmount: number;
  awaitingCloseAmount: number;
  screeningCount: number;
  paidAmount: number;
  fellThroughAmount: number;
  highFlagCount: number;
  byMonth: Array<{ month: string; amount: number; count: number }>;
}

export function payAtCloseExposure(records: JobPayAtClose[]): PayAtCloseExposure {
  const byMonth = new Map<string, { amount: number; count: number }>();
  let openCount = 0;
  let openAmount = 0;
  let awaitingCloseAmount = 0;
  let screeningCount = 0;
  let paidAmount = 0;
  let fellThroughAmount = 0;
  let highFlagCount = 0;
  for (const record of records) {
    const due = Math.max(0, record.contractValue - record.depositAmount);
    if (PAY_AT_CLOSE_OPEN_STATUSES.includes(record.status)) {
      openCount += 1;
      openAmount += due;
      if (record.status === "awaiting_close") awaitingCloseAmount += due;
      const month = record.expectedCloseDate ? record.expectedCloseDate.slice(0, 7) : "unscheduled";
      const bucket = byMonth.get(month) ?? { amount: 0, count: 0 };
      bucket.amount += due;
      bucket.count += 1;
      byMonth.set(month, bucket);
      if ((record.report?.flags ?? []).some((flag) => flag.severity === "high")) highFlagCount += 1;
    }
    if (record.status === "screening") screeningCount += 1;
    if (record.status === "paid") paidAmount += record.contractValue;
    if (record.status === "fell_through") fellThroughAmount += due;
  }
  return {
    openCount,
    openAmount: roundMoney(openAmount),
    awaitingCloseAmount: roundMoney(awaitingCloseAmount),
    screeningCount,
    paidAmount: roundMoney(paidAmount),
    fellThroughAmount: roundMoney(fellThroughAmount),
    highFlagCount,
    byMonth: [...byMonth.entries()]
      .map(([month, bucket]) => ({ month, amount: roundMoney(bucket.amount), count: bucket.count }))
      .sort((a, b) => (a.month === "unscheduled" ? 1 : b.month === "unscheduled" ? -1 : a.month.localeCompare(b.month))),
  };
}

/* ------------------------------------------------------------------ */
/* Activity note                                                        */
/* ------------------------------------------------------------------ */

export function dollars(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function payAtCloseActivityNote(before: JobPayAtClose | undefined, after: JobPayAtClose) {
  if (!before) {
    const amount = after.contractValue ? ` for ${dollars(after.contractValue)}` : "";
    return after.requestedAt
      ? `Requested pay at close${amount}. Waiting on a company admin.`
      : `Opened a pay-at-close review${amount}.`;
  }
  const lines: string[] = [];
  const decided = after.decidedAt && after.decidedAt !== before.decidedAt;
  if (decided && (after.status === "approved" || after.status === "declined")) {
    const who = after.decidedByName ? ` by ${after.decidedByName}` : "";
    const note = after.decisionNote ? ` ${after.decisionNote}` : "";
    lines.push(`Pay at close ${after.status}${who}.${note}`);
  } else if (before.status !== after.status) {
    lines.push(`Pay at close is ${PAY_AT_CLOSE_STATUS_LABELS[after.status].toLowerCase()}.`);
  }
  if (after.report && after.report.generatedAt !== before.report?.generatedAt) {
    const ratio = after.report.waterfall.coverageRatio;
    lines.push(
      `Property review ran: ${RECOMMENDATION_LABELS[after.report.recommendation].toLowerCase()}, score ${after.report.score}${ratio != null ? `, coverage ${ratio.toFixed(2)}×` : ""}.`,
    );
  }
  if (before.expectedCloseDate !== after.expectedCloseDate && after.expectedCloseDate) {
    lines.push(`Expected closing ${after.expectedCloseDate}.`);
  }
  if (before.contractValue !== after.contractValue && after.contractValue) {
    lines.push(`Pay-at-close amount ${dollars(after.contractValue)}.`);
  }
  if (after.interview.completedAt && after.interview.completedAt !== before.interview.completedAt) {
    const progress = interviewProgress(after);
    lines.push(`Qualification interview submitted (${progress.answered} of ${progress.total} answered).`);
  }
  if (after.application.sentAt && after.application.sentAt !== before.application.sentAt) {
    const to = after.application.sentTo ? ` to ${after.application.sentTo}` : "";
    lines.push(`Homeowner application ${before.application.sentAt ? "re-sent" : "sent"}${to}.`);
  }
  if (after.application.submittedAt && after.application.submittedAt !== before.application.submittedAt) {
    const progress = applicationProgress(after);
    const uploads = after.application.uploads.length;
    lines.push(
      `Homeowner application signed by ${after.application.signatureName || "the homeowner"} (${progress.answered} of ${progress.total} answered${uploads ? `, ${uploads} file${uploads === 1 ? "" : "s"}` : ""}).`,
    );
  }
  const previous = new Set(before.checklist.filter((item) => item.done).map((item) => item.key));
  for (const item of after.checklist) {
    if (item.done && !previous.has(item.key)) lines.push(`${item.label} done.`);
  }
  return lines.length ? lines.join(" ") : null;
}

/** Contract body for a Pay at Close proposal. Uses the `{{pay_1}}` token the payment schedule reads. */
export const PAY_AT_CLOSE_CONTRACT_BODY = `PAY AT CLOSE AGREEMENT

Scope. Contractor will complete the work described in this proposal at the property listed above (the "Property"). Owner represents that Owner holds title to the Property and intends to sell it.

Payment. Payment 1 {{pay_1}} is due at the closing of the sale of the Property, paid directly to Contractor by the closing or escrow agent from seller proceeds before any disbursement to Owner. Owner hereby irrevocably assigns to Contractor that portion of the sale proceeds equal to the balance due under this agreement, and authorizes the closing agent to pay Contractor from proceeds upon presentation of this agreement and Contractor's invoice.

Escrow instructions. Owner will provide Contractor with the name of the title or escrow company and the file number within three (3) days of signing, and will instruct the closing agent in writing to honor this assignment.

If the sale does not close. If the Property is not sold within one hundred twenty (120) days of substantial completion, or the listing is withdrawn, the full balance becomes due within fifteen (15) days of Contractor's written demand. Contractor reserves all lien rights under state law and may record a notice of intent to lien, a preliminary notice, or a mechanic's lien to secure payment.

Title. Owner authorizes Contractor to review public property records and the title commitment for the Property to confirm ownership and encumbrances. Owner will disclose any mortgage, equity line, judgment, tax, or other lien on the Property.

Interest. Any balance not paid when due bears interest at 1.5% per month or the maximum allowed by law, whichever is less, plus reasonable collection costs and attorney fees.
`;
