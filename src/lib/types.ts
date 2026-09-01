export const PIPELINE_STAGES = [
  "pursuing",
  "estimating",
  "bid_submitted",
  "interview",
  "awarded",
  "lost",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const JOB_STATUSES = [
  "precon",
  "in_progress",
  "punch",
  "complete",
  "on_hold",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const PROJECT_TYPES = [
  "restoration",
  "remodel",
  "roofing",
  "exterior",
  "addition",
  "commercial",
  "multifamily",
  "healthcare",
  "education",
  "industrial",
  "hospitality",
  "civic",
  "tenant_improvement",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const JOB_MARKETS = ["residential", "commercial"] as const;

export type JobMarket = (typeof JOB_MARKETS)[number];

export const DELIVERY_METHODS = [
  "insurance_claim",
  "fixed_price",
  "time_and_materials",
  "design_bid_build",
  "cm_at_risk",
  "design_build",
  "gc_mp",
] as const;

export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const LEAD_SOURCES = [
  "podium",
  "website",
  "google_ad",
  "phone",
  "angies_list",
  "realtor",
  "referral",
  "sales_team",
  "text_main_line",
  "past_client",
  "chatgpt",
  "social_media",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export const CLIENT_TYPES = [
  "owner",
  "developer",
  "public",
  "healthcare_system",
  "architect",
  "insurance",
  "realtor",
  "trade_partner",
] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];

export const ACTIVITY_TYPES = [
  "note",
  "call",
  "email",
  "meeting",
  "site_walk",
  "stage_change",
  "audit",
  "text",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const SEAT_ROLES = [
  "company_admin",
  "business_development",
  "team_lead",
  "team_admin",
  "project_manager",
  "estimator",
  "superintendent",
  "accountant",
] as const;

export type SeatRole = (typeof SEAT_ROLES)[number];

export const SEAT_ROLE_LABELS: Record<SeatRole, string> = {
  company_admin: "Company admin",
  business_development: "Business development",
  team_lead: "Team lead",
  team_admin: "Team administrator",
  project_manager: "Project manager",
  estimator: "Estimator",
  superintendent: "Superintendent",
  accountant: "Accounting",
};

export interface CurrentUser {
  id: string;
  companyId: string;
  staffId: string;
  name: string;
  title: string;
  company: string;
  initials: string;
  role: SeatRole;
  teamId: string | null;
}

export interface CompanySettings {
  name: string;
  /** Hyphenated public URL segment. Unique across Truss. */
  slug: string;
  phone: string;
  email: string;
  website: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  licenseNumber: string;
  logoUrl?: string;
  logoStoragePath?: string;
  /** Null or blank means the app fallback is still in use. */
  defaultEstimateTerms?: string | null;
  defaultInvoiceTerms?: string | null;
  /** Floor applied when a catalog item is added to a proposal. 20 means 20%. */
  minimumMarginPercent?: number;
}

export const NORTHLINE_COMPANY: CompanySettings = {
  name: "Northline Construction",
  slug: "northline-construction",
  phone: "(303) 555-0140",
  email: "office@northlineco.com",
  website: "northlineco.com",
  street: "2840 Larimer Street",
  city: "Denver",
  state: "CO",
  postalCode: "80205",
  licenseNumber: "CO-GC-44821",
  defaultEstimateTerms: null,
  defaultInvoiceTerms: null,
  minimumMarginPercent: 0,
};

export interface StaffMember {
  id: string;
  name: string;
  title: string;
  role: SeatRole;
  teamId: string | null;
  initials: string;
  email: string;
  phone: string;
  /** first.last, unique per company. Sticky on rename. */
  cardSlug: string;
  locked: boolean;
  restricted: boolean;
  inviteExpiresAt: string | null;
  inviteToken: string | null;
}

export interface Team {
  id: string;
  name: string;
  leadStaffId: string;
}

export interface Client {
  id: string;
  name: string;
  type: ClientType;
  city: string;
  state: string;
  notes: string;
}

export interface Contact {
  id: string;
  clientId: string | null;
  name: string;
  title: string;
  email: string;
  phone: string;
  ownerStaffId: string;
  isReferralPartner: boolean;
}

export interface Opportunity {
  id: string;
  code: string;
  name: string;
  clientId: string | null;
  primaryContactId: string;
  stage: PipelineStage;
  value: number;
  bidDueAt: string | null;
  preBidWalkAt: string | null;
  location: string;
  projectType: ProjectType;
  market?: JobMarket;
  deliveryMethod: DeliveryMethod;
  estimator: string;
  winProbability: number;
  nextStep: string;
  createdAt: string;
  lostReason?: string;
  ownerStaffId: string;
  originatorStaffId?: string;
  leadSource?: LeadSource | "";
  referralContactId?: string | null;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  notes?: string;
}

export interface JobCustomField {
  id: string;
  label: string;
  value: string;
}

export interface Job {
  id: string;
  code: string;
  opportunityId: string | null;
  name: string;
  clientId: string | null;
  primaryContactId: string | null;
  status: JobStatus;
  contractValue: number;
  startDate: string;
  substantialCompletion: string | null;
  superintendent: string;
  projectManager: string;
  location: string;
  ownerStaffId: string;
  description: string;
  tags: string[];
  street: string;
  city: string;
  state: string;
  postalCode: string;
  salesRep: string;
  assigned: string[];
  subcontractorIds: string[];
  relatedContactIds: string[];
  customFields: JobCustomField[];
  projectType: ProjectType | "";
  market: JobMarket;
  leadSource: LeadSource | "";
  deletedAt: string | null;
  deletedReason: string;
  deletedBy: string;
}

export interface Activity {
  id: string;
  entityType: "opportunity" | "job" | "client";
  entityId: string;
  type: ActivityType;
  body: string;
  createdAt: string;
  author: string;
}

export interface Task {
  id: string;
  title: string;
  dueAt: string;
  completed: boolean;
  relatedType: "opportunity" | "job" | "client" | null;
  relatedId: string | null;
  assignee: string;
}

export const CATALOG_KINDS = [
  "labor",
  "material",
  "equipment",
  "allowance",
  "subcontract",
] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const ESTIMATE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const EVENT_KINDS = [
  "site_walk",
  "pre_bid",
  "inspection",
  "production",
  "meeting",
  "punch",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const PHOTO_CATEGORIES = ["before", "progress", "after", "issue"] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export const QB_SYNC_STATUSES = ["not_in_qb", "queued", "entered", "error", "returned"] as const;
export type QbSyncStatus = (typeof QB_SYNC_STATUSES)[number];

export function parseQbStatus(value: string | null | undefined): QbSyncStatus {
  if (
    value === "entered" ||
    value === "error" ||
    value === "queued" ||
    value === "returned"
  ) {
    return value;
  }
  return "not_in_qb";
}

export const QB_REVIEW_KINDS = ["invoice", "expense", "payment"] as const;
export type QbReviewKind = (typeof QB_REVIEW_KINDS)[number];

export const QB_REVIEW_INTENTS = ["comment", "return", "approve", "resubmit"] as const;
export type QbReviewIntent = (typeof QB_REVIEW_INTENTS)[number];

export interface QbReviewComment {
  id: string;
  kind: QbReviewKind;
  recordId: string;
  body: string;
  intent: QbReviewIntent;
  authorStaffId: string;
  authorName: string;
  mentionedStaffIds: string[];
  createdAt: string;
}

export interface PriceList {
  id: string;
  name: string;
  /** Vendor or office date this book takes effect. YYYY-MM-DD. */
  effectiveOn: string;
  /** Set when a newer list replaces this one. Null means the list is still live. */
  outdatedAt: string | null;
  createdAt: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  kind: CatalogKind;
  unit: string;
  unitCost: number;
  /** Markup over unit cost when this item is added to a proposal. 20 means 20%. */
  marginPercent: number;
  costCode: string;
  /** Dated price list this row belongs to. Null until the SQL backfill runs. */
  priceListId?: string | null;
}

export interface Estimate {
  id: string;
  number: string;
  name: string;
  clientId: string | null;
  opportunityId: string | null;
  jobId: string | null;
  contactId: string | null;
  secondContactId: string | null;
  status: EstimateStatus;
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
  secondShareToken: string;
  signatureName: string;
  signatureImage: string;
  secondSignatureName: string;
  secondSignatureImage: string;
  /** `gbb` offers mutually exclusive Good / Better / Best packages. Empty is a single-scope proposal. */
  packageMode: "" | "gbb";
  /** Which package is selected for preview, signing, and convert-to-invoice. */
  selectedPackage: "good" | "better" | "best";
}

export const SIGNATURE_EVENT_KINDS = ["sent", "opened", "signed", "declined"] as const;
export type SignatureEventKind = (typeof SIGNATURE_EVENT_KINDS)[number];

export const SIGNATURE_EVENT_ROLES = ["", "primary", "second", "contractor"] as const;
export type SignatureEventRole = (typeof SIGNATURE_EVENT_ROLES)[number];

export interface EstimateSignatureEvent {
  id: string;
  companyId?: string;
  estimateId: string;
  kind: SignatureEventKind;
  signerRole: SignatureEventRole;
  contactId: string | null;
  signerName: string;
  tokenSuffix: string;
  tokenSha256: string;
  ipAddress: string;
  forwardedFor: string;
  userAgent: string;
  acceptLanguage: string;
  timeZone: string;
  deliveryChannel: string;
  deliveryTo: string;
  consentText: string;
  consentVersion: string;
  documentSha256: string;
  capturedInOffice: boolean;
  staffId: string | null;
  createdAt: string;
}

export interface EstimateLinePhoto {
  id: string;
  imageUrl: string;
  caption: string;
}

export interface EstimateLine {
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
  /** Empty = in every package. `good` / `better` / `best` = only that package. */
  package: "" | "good" | "better" | "best";
  photoIds: string[];
  photos?: EstimateLinePhoto[];
}

export interface EstimateTemplate {
  id: string;
  name: string;
  description: string;
  market: JobMarket;
  intro: string;
  terms: string;
  notes: string;
  taxRate: number;
  discountKind: "percent" | "amount";
  discountValue: number;
  depositKind: "percent" | "amount";
  depositValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateTemplateLine {
  id: string;
  templateId: string;
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
}

export interface Invoice {
  id: string;
  number: string;
  name: string;
  clientId: string | null;
  jobId: string | null;
  estimateId: string | null;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string | null;
  notes: string;
  terms: string;
  shareToken: string;
  qbStatus: QbSyncStatus;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  sortOrder: number;
}

export const EXPENSE_ACCOUNTS = [
  "materials",
  "subcontractors",
  "equipment_rental",
  "dumpsters",
  "permits",
  "labor",
  "fuel",
  "office",
  "insurance",
  "other",
] as const;
export type ExpenseAccount = (typeof EXPENSE_ACCOUNTS)[number];

export const EXPENSE_METHODS = ["credit_card", "debit", "check", "ach", "cash"] as const;
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

export interface Payment {
  id: string;
  invoiceId: string | null;
  jobId: string | null;
  amount: number;
  method: string;
  paidAt: string;
  reference: string;
  receiptUrl: string;
  receiptStoragePath: string | null;
  qbStatus: QbSyncStatus;
  createdBy: string;
}

export interface Expense {
  id: string;
  number: string;
  jobId: string | null;
  vendor: string;
  account: ExpenseAccount;
  amount: number;
  incurredAt: string;
  method: ExpenseMethod;
  memo: string;
  receiptUrl: string;
  receiptStoragePath: string | null;
  qbStatus: QbSyncStatus;
  extractedByAi: boolean;
  createdAt: string;
  createdBy: string;
}

export interface MaterialOrder {
  id: string;
  number: string;
  jobId: string;
  vendor: string;
  notes: string;
  neededBy: string | null;
  createdBy: string;
  createdAt: string;
}

export interface MaterialOrderLine {
  id: string;
  materialOrderId: string;
  catalogItemId: string | null;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  sortOrder: number;
}

export interface MaterialOrderTemplate {
  id: string;
  name: string;
  description: string;
  vendor: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialOrderTemplateLine {
  id: string;
  templateId: string;
  catalogItemId: string | null;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  sortOrder: number;
}

export interface QbVendor {
  id: string;
  listId: string;
  name: string;
  isActive: boolean;
  syncedAt: string;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  kind: EventKind;
  startsAt: string;
  endsAt: string;
  location: string;
  assignee: string;
  opportunityId: string | null;
  jobId: string | null;
  clientId: string | null;
  notes: string;
}

export interface CalendarAccount {
  staffId: string;
  googleEmail: string;
  calendarId: string;
  linked: boolean;
  linkedAt: string | null;
  shareWithTeam: boolean;
  source: "google" | "demo";
}

export interface CalendarShare {
  ownerStaffId: string;
  viewerStaffId: string;
}

export interface GmailAccount {
  id: string;
  staffId: string;
  googleEmail: string;
  linked: boolean;
  linkedAt: string | null;
  source: "google" | "demo";
}

export interface GmailMessage {
  id: string;
  accountId: string;
  gmailId: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  snippet: string;
  bodyText: string;
  receivedAt: string;
  direction: "inbound" | "outbound";
  jobId: string | null;
  contactId: string | null;
}

export interface JobPhoto {
  id: string;
  jobId: string;
  caption: string;
  category: PhotoCategory;
  takenAt: string;
  imageUrl: string;
  storagePath: string | null;
  createdBy?: string;
}

export interface JobFile {
  id: string;
  jobId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  storagePath: string;
  createdBy: string;
  createdAt: string;
  bucket?: string;
}

export const PHOTO_PAGE_LAYOUTS = ["one", "two", "four"] as const;
export type PhotoPageLayout = (typeof PHOTO_PAGE_LAYOUTS)[number];

export const PHOTO_PAGE_LAYOUT_LABELS: Record<PhotoPageLayout, string> = {
  one: "1 photo",
  two: "2 photos",
  four: "4 photos",
};

export const LETTERHEAD_KINDS = [
  "blank",
  "introduction",
  "findings",
  "scope",
  "next_steps",
  "materials",
  "punch",
] as const;
export type LetterheadKind = (typeof LETTERHEAD_KINDS)[number];

export const LETTERHEAD_KIND_LABELS: Record<LetterheadKind, string> = {
  blank: "Letterhead",
  introduction: "Introduction",
  findings: "Findings",
  scope: "Scope of work",
  next_steps: "Next steps",
  materials: "Materials",
  punch: "Punch list",
};

export interface PhotoReportCoverPage {
  id: string;
  type: "cover";
  title: string;
  subtitle: string;
  notes: string;
  showAddress: boolean;
  showDate: boolean;
  showDateOfLoss: boolean;
  showClaimNumber: boolean;
  heroPhotoId: string | null;
  dateOfLoss: string;
  claimNumber: string;
}

export interface PhotoReportPhotoItem {
  photoId: string;
  caption: string;
}

export interface PhotoReportPhotosPage {
  id: string;
  type: "photos";
  heading: string;
  notes: string;
  layout: PhotoPageLayout;
  showCaptions: boolean;
  showTakenAt: boolean;
  showCategory: boolean;
  items: PhotoReportPhotoItem[];
}

export interface PhotoReportTextPage {
  id: string;
  type: "text";
  kind: LetterheadKind;
  heading: string;
  body: string;
}

export type PhotoReportPage = PhotoReportCoverPage | PhotoReportPhotosPage | PhotoReportTextPage;

export const PAGE_TEMPLATES = ["photos", "inspection", "completion", "claim", "blank"] as const;
export type PageTemplateId = (typeof PAGE_TEMPLATES)[number];

export interface PhotoReport {
  id: string;
  jobId: string;
  title: string;
  pages: PhotoReportPage[];
  template: PageTemplateId;
  shareToken: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface TrainingAttempt {
  id: string;
  staffId: string;
  kind: "chapter" | "practice" | "exam";
  chapterId: string | null;
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  createdAt: string;
}

export interface TrainingProgress {
  staffId: string;
  read: Record<string, string>;
  badges: Record<string, string>;
  attempts: TrainingAttempt[];
}

export interface TrainingBulletin {
  id: string;
  title: string;
  body: string;
  author: string;
  createdAt: string;
}

export interface TextMessage {
  id: string;
  contactId: string | null;
  jobId: string | null;
  opportunityId: string | null;
  direction: "inbound" | "outbound";
  phone: string;
  body: string;
  handle: string;
  status: string;
  mediaUrl: string;
  createdAt: string;
  createdBy: string;
}

export type ReturningClientLeadStatus =
  | "assigned"
  | "offered"
  | "pending"
  | "reassigned"
  | "kept"
  | "dismissed";

export interface ReturningClientLead {
  id: string;
  opportunityId: string;
  jobId: string | null;
  contactId: string | null;
  previousJobId: string | null;
  previousStaffId: string;
  previousStaffName: string;
  previousJobCode: string;
  completedAt: string | null;
  openedByStaffId: string;
  openedByName: string;
  status: ReturningClientLeadStatus;
  decidedByStaffId: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface CrmState {
  staff: StaffMember[];
  teams: Team[];
  clients: Client[];
  contacts: Contact[];
  opportunities: Opportunity[];
  jobs: Job[];
  activities: Activity[];
  tasks: Task[];
  priceLists: PriceList[];
  catalog: CatalogItem[];
  estimates: Estimate[];
  estimateLines: EstimateLine[];
  estimateSignatureEvents: EstimateSignatureEvent[];
  estimateTemplates: EstimateTemplate[];
  estimateTemplateLines: EstimateTemplateLine[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  payments: Payment[];
  expenses: Expense[];
  materialOrders: MaterialOrder[];
  materialOrderLines: MaterialOrderLine[];
  materialOrderTemplates: MaterialOrderTemplate[];
  materialOrderTemplateLines: MaterialOrderTemplateLine[];
  qbVendors: QbVendor[];
  qbReviewComments: QbReviewComment[];
  events: ScheduleEvent[];
  photos: JobPhoto[];
  jobFiles: JobFile[];
  photoReports: PhotoReport[];
  calendarAccounts: CalendarAccount[];
  calendarShares: CalendarShare[];
  gmailAccounts: GmailAccount[];
  gmailMessages: GmailMessage[];
  trainingProgress: TrainingProgress[];
  trainingBulletins: TrainingBulletin[];
  messages: TextMessage[];
  returningClientLeads: ReturningClientLead[];
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  pursuing: "Lead",
  estimating: "Estimating",
  bid_submitted: "Proposal sent",
  interview: "Follow-up",
  awarded: "Job Sold",
  lost: "Lost",
};

export const STAGE_PROBABILITY: Record<PipelineStage, number> = {
  pursuing: 15,
  estimating: 30,
  bid_submitted: 45,
  interview: 65,
  awarded: 100,
  lost: 0,
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  precon: "Preconstruction",
  in_progress: "In progress",
  punch: "Punch list",
  complete: "Complete",
  on_hold: "On hold",
};

export const JOB_MARKET_LABELS: Record<JobMarket, string> = {
  residential: "Residential",
  commercial: "Commercial",
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  restoration: "Restoration",
  remodel: "Remodel",
  roofing: "Roofing",
  exterior: "Exterior / windows",
  addition: "Addition",
  commercial: "Commercial",
  multifamily: "Multifamily",
  healthcare: "Healthcare",
  education: "Education",
  industrial: "Industrial",
  hospitality: "Hospitality",
  civic: "Civic",
  tenant_improvement: "Tenant improvement",
};

export const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  insurance_claim: "Insurance claim",
  fixed_price: "Fixed price",
  time_and_materials: "Time & materials",
  design_bid_build: "Design-bid-build",
  cm_at_risk: "CM at risk",
  design_build: "Design-build",
  gc_mp: "GC / MP",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  podium: "Podium",
  website: "Website",
  google_ad: "Google Ad",
  phone: "Phone",
  angies_list: "Angie's List",
  realtor: "Realtor",
  referral: "Referral",
  sales_team: "Sales Team",
  text_main_line: "Text Main Line",
  past_client: "Past Client",
  chatgpt: "ChatGPT",
  social_media: "Social Media",
};

/** Older books may still store these; they stay readable, but the picker uses LEAD_SOURCES. */
export const LEGACY_LEAD_SOURCE_LABELS: Record<string, string> = {
  google: "Google search",
  facebook: "Facebook",
  instagram: "Instagram",
  yard_sign: "Yard sign",
  truck: "Truck / wrap",
  storm: "Storm canvass",
  insurance: "Insurance adjuster",
  repeat: "Repeat customer",
  neighbor: "Neighbor",
  other: "Other",
};

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  owner: "Owner / company",
  developer: "Developer",
  public: "Public agency",
  healthcare_system: "Health system",
  architect: "Architect",
  insurance: "Insurance / adjuster",
  realtor: "Realtor",
  trade_partner: "Trade partner",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  site_walk: "Site walk",
  stage_change: "Stage change",
  audit: "Audit",
  text: "Text",
};

export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  labor: "Labor",
  material: "Material",
  equipment: "Equipment",
  allowance: "Allowance",
  subcontract: "Subcontract",
};

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  site_walk: "Site walk",
  pre_bid: "Pre-bid",
  inspection: "Inspection",
  production: "Production",
  meeting: "Meeting",
  punch: "Punch",
};

export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = {
  before: "Before",
  progress: "Progress",
  after: "After",
  issue: "Issue",
};

export const QB_SYNC_STATUS_LABELS: Record<QbSyncStatus, string> = {
  not_in_qb: "Needs review",
  queued: "Queued for QuickBooks",
  entered: "Entered in QuickBooks",
  error: "QuickBooks rejected",
  returned: "Returned to PM",
};

export const EXPENSE_ACCOUNT_LABELS: Record<ExpenseAccount, string> = {
  materials: "Job materials",
  subcontractors: "Subcontractors",
  equipment_rental: "Equipment rental",
  dumpsters: "Dumpsters / disposal",
  permits: "Permits & fees",
  labor: "Direct labor",
  fuel: "Fuel",
  office: "Office / overhead",
  insurance: "Insurance",
  other: "Other",
};

export const EXPENSE_METHOD_LABELS: Record<ExpenseMethod, string> = {
  credit_card: "Credit card",
  debit: "Debit card",
  check: "Check",
  ach: "ACH",
  cash: "Cash",
};

export const NORTHLINE_TEAMS: Team[] = [
  { id: "team_field", name: "Field operations", leadStaffId: "staff_luis" },
  { id: "team_pursuits", name: "Healthcare & interiors", leadStaffId: "staff_maya" },
];

export const NORTHLINE_STAFF: StaffMember[] = [
  {
    id: "staff_jordan",
    name: "Jordan Hale",
    title: "Company admin",
    role: "company_admin",
    teamId: null,
    initials: "JH",
    email: "",
    phone: "",
    cardSlug: "jordan.hale",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  },
  {
    id: "staff_priya",
    name: "Priya Shah",
    title: "Director of Business Development",
    role: "business_development",
    teamId: null,
    initials: "PS",
    email: "",
    phone: "",
    cardSlug: "priya.shah",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  },
  {
    id: "staff_claire",
    name: "Claire Duvall",
    title: "Business development",
    role: "business_development",
    teamId: null,
    initials: "CD",
    email: "",
    phone: "",
    cardSlug: "claire.duvall",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  },
  {
    id: "staff_luis",
    name: "Luis Ortega",
    title: "Team lead, Field operations",
    role: "team_lead",
    teamId: "team_field",
    initials: "LO",
    email: "",
    phone: "",
    cardSlug: "luis.ortega",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  },
  {
    id: "staff_maya",
    name: "Maya Chen",
    title: "Team administrator, Healthcare & interiors",
    role: "team_admin",
    teamId: "team_pursuits",
    initials: "MC",
    email: "",
    phone: "",
    cardSlug: "maya.chen",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  },
  {
    id: "staff_elena",
    name: "Elena Voss",
    title: "Project manager",
    role: "project_manager",
    teamId: "team_field",
    initials: "EV",
    email: "",
    phone: "",
    cardSlug: "elena.voss",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  },
  {
    id: "staff_tom",
    name: "Tom Brennan",
    title: "Superintendent",
    role: "superintendent",
    teamId: "team_field",
    initials: "TB",
    email: "",
    phone: "",
    cardSlug: "tom.brennan",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  },
  {
    id: "staff_nora",
    name: "Nora Keene",
    title: "Controller",
    role: "accountant",
    teamId: null,
    initials: "NK",
    email: "",
    phone: "",
    cardSlug: "nora.keene",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  },
];

export const TEAM = NORTHLINE_STAFF.map((member) => member.name);

export function isNorthlineDemoName(name: string) {
  const needle = name.trim().toLowerCase();
  if (!needle) return false;
  return NORTHLINE_STAFF.some((member) => member.name.toLowerCase() === needle);
}

export function staffByName(name: string, roster: StaffMember[] = NORTHLINE_STAFF) {
  return roster.find((member) => member.name === name);
}

export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "TR";
}
