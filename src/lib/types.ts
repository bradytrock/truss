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
  phone: string;
  email: string;
  website: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  licenseNumber: string;
}

export const NORTHLINE_COMPANY: CompanySettings = {
  name: "Northline Construction",
  phone: "(303) 555-0140",
  email: "office@northlineco.com",
  website: "northlineco.com",
  street: "2840 Larimer Street",
  city: "Denver",
  state: "CO",
  postalCode: "80205",
  licenseNumber: "CO-GC-44821",
};

export interface StaffMember {
  id: string;
  name: string;
  title: string;
  role: SeatRole;
  teamId: string | null;
  initials: string;
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
  deliveryMethod: DeliveryMethod;
  estimator: string;
  winProbability: number;
  nextStep: string;
  createdAt: string;
  lostReason?: string;
  ownerStaffId: string;
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

export interface CatalogItem {
  id: string;
  name: string;
  kind: CatalogKind;
  unit: string;
  unitCost: number;
  costCode: string;
}

export interface Estimate {
  id: string;
  number: string;
  name: string;
  clientId: string | null;
  opportunityId: string | null;
  jobId: string | null;
  status: EstimateStatus;
  notes: string;
  validUntil: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export interface EstimateLine {
  id: string;
  estimateId: string;
  catalogItemId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  sortOrder: number;
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

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  paidAt: string;
  reference: string;
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

export interface JobPhoto {
  id: string;
  jobId: string;
  caption: string;
  category: PhotoCategory;
  takenAt: string;
  imageUrl: string;
  storagePath: string | null;
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
  catalog: CatalogItem[];
  estimates: Estimate[];
  estimateLines: EstimateLine[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  payments: Payment[];
  events: ScheduleEvent[];
  photos: JobPhoto[];
  calendarAccounts: CalendarAccount[];
  calendarShares: CalendarShare[];
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  pursuing: "Lead",
  estimating: "Estimating",
  bid_submitted: "Proposal sent",
  interview: "Follow-up",
  awarded: "Sold",
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
  },
  {
    id: "staff_priya",
    name: "Priya Shah",
    title: "Director of Business Development",
    role: "business_development",
    teamId: null,
    initials: "PS",
  },
  {
    id: "staff_luis",
    name: "Luis Ortega",
    title: "Team lead, Field operations",
    role: "team_lead",
    teamId: "team_field",
    initials: "LO",
  },
  {
    id: "staff_maya",
    name: "Maya Chen",
    title: "Team administrator, Healthcare & interiors",
    role: "team_admin",
    teamId: "team_pursuits",
    initials: "MC",
  },
  {
    id: "staff_elena",
    name: "Elena Voss",
    title: "Project manager",
    role: "project_manager",
    teamId: "team_field",
    initials: "EV",
  },
  {
    id: "staff_tom",
    name: "Tom Brennan",
    title: "Superintendent",
    role: "superintendent",
    teamId: "team_field",
    initials: "TB",
  },
];

export const TEAM = NORTHLINE_STAFF.map((member) => member.name);

export function staffByName(name: string, roster: StaffMember[] = NORTHLINE_STAFF) {
  return roster.find((member) => member.name === name);
}

export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "TR";
}
