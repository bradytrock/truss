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

export interface CurrentUser {
  id: string;
  companyId: string;
  name: string;
  title: string;
  company: string;
  initials: string;
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
  clientId: string;
  name: string;
  title: string;
  email: string;
  phone: string;
}

export interface Opportunity {
  id: string;
  name: string;
  clientId: string;
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
}

export interface Job {
  id: string;
  opportunityId: string | null;
  name: string;
  clientId: string;
  status: JobStatus;
  contractValue: number;
  startDate: string;
  substantialCompletion: string | null;
  superintendent: string;
  projectManager: string;
  location: string;
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

export interface CrmState {
  clients: Client[];
  contacts: Contact[];
  opportunities: Opportunity[];
  jobs: Job[];
  activities: Activity[];
  tasks: Task[];
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  pursuing: "Pursuing",
  estimating: "Estimating",
  bid_submitted: "Bid submitted",
  interview: "Interview / VE",
  awarded: "Awarded",
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
  design_bid_build: "Design-bid-build",
  cm_at_risk: "CM at risk",
  design_build: "Design-build",
  gc_mp: "GC / MP",
};

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  owner: "Owner",
  developer: "Developer",
  public: "Public agency",
  healthcare_system: "Health system",
  architect: "Architect",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  site_walk: "Site walk",
  stage_change: "Stage change",
};

export const TEAM = [
  "Jordan Hale",
  "Maya Chen",
  "Priya Shah",
  "Luis Ortega",
  "Elena Voss",
  "Tom Brennan",
] as const;
