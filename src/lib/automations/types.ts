import type { WorkColumn } from "@/lib/work-board";

export const AUTOMATION_TRIGGERS = [
  "job_created",
  "job_stage_changed",
  "job_stage_after_days",
  "invoice_paid",
  "estimate_sent_after_days",
  "event_in_days",
] as const;

export type AutomationTriggerKind = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTriggerKind, string> = {
  job_created: "A job is created",
  job_stage_changed: "A job moves to a stage",
  job_stage_after_days: "X days after a job enters a stage",
  invoice_paid: "An invoice is paid",
  estimate_sent_after_days: "X days after an estimate is sent",
  event_in_days: "X days before a calendar event",
};

export const AUTOMATION_ACTIONS = [
  "send_sms",
  "send_email",
  "create_task",
  "notify_staff",
  "webhook",
] as const;

export type AutomationActionKind = (typeof AUTOMATION_ACTIONS)[number];

export const AUTOMATION_ACTION_LABELS: Record<AutomationActionKind, string> = {
  send_sms: "Send text",
  send_email: "Send email",
  create_task: "Create task",
  notify_staff: "Notify a team member",
  webhook: "Send to a webhook",
};

export const AUTOMATION_CONDITION_FIELDS = [
  "job.stage",
  "job.status",
  "job.city",
  "job.state",
  "job.projectType",
  "job.market",
  "customer.name",
  "contact.email",
  "rep.id",
] as const;

export type AutomationConditionField = (typeof AUTOMATION_CONDITION_FIELDS)[number];

export const AUTOMATION_CONDITION_FIELD_LABELS: Record<AutomationConditionField, string> = {
  "job.stage": "Job stage",
  "job.status": "Job status",
  "job.city": "Job city",
  "job.state": "Job state",
  "job.projectType": "Project type",
  "job.market": "Market",
  "customer.name": "Customer name",
  "contact.email": "Customer email",
  "rep.id": "Job owner",
};

export const AUTOMATION_OPERATORS = ["eq", "neq", "contains", "is_set", "is_empty"] as const;
export type AutomationOperator = (typeof AUTOMATION_OPERATORS)[number];

export const AUTOMATION_OPERATOR_LABELS: Record<AutomationOperator, string> = {
  eq: "is",
  neq: "is not",
  contains: "contains",
  is_set: "is filled in",
  is_empty: "is empty",
};

export const AUTOMATION_MERGE_FIELDS = [
  "companyName",
  "companyPhone",
  "staffName",
  "staffPhone",
  "jobName",
  "jobCode",
  "jobAddress",
  "jobCity",
  "jobStage",
  "contactName",
  "contactPhone",
  "contactEmail",
  "reviewUrl",
] as const;

export type AutomationMergeField = (typeof AUTOMATION_MERGE_FIELDS)[number];

export const AUTOMATION_MERGE_FIELD_LABELS: Record<AutomationMergeField, string> = {
  companyName: "Company name",
  companyPhone: "Company phone",
  staffName: "Rep name",
  staffPhone: "Rep phone",
  jobName: "Job name",
  jobCode: "Job code",
  jobAddress: "Job address",
  jobCity: "Job city",
  jobStage: "Job stage",
  contactName: "Customer name",
  contactPhone: "Customer phone",
  contactEmail: "Customer email",
  reviewUrl: "Review link",
};

export type AutomationTriggerConfig = {
  stage?: WorkColumn | "";
  days?: number;
};

export type AutomationCondition = {
  id: string;
  field: AutomationConditionField;
  operator: AutomationOperator;
  value: string;
};

export type AutomationActionTo = "customer" | "rep" | "staff";

export type AutomationAction = {
  id: string;
  kind: AutomationActionKind;
  to?: AutomationActionTo;
  staffId?: string;
  body?: string;
  subject?: string;
  title?: string;
  dueInDays?: number;
  url?: string;
};

export const AUTOMATION_RUN_STATUSES = [
  "scheduled",
  "pending_confirmation",
  "confirmed",
  "skipped",
  "running",
  "sent",
  "failed",
] as const;

export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export type Automation = {
  id: string;
  companyId: string;
  name: string;
  description: string;
  triggerKind: AutomationTriggerKind;
  triggerConfig: AutomationTriggerConfig;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  requiresConfirmation: boolean;
  oncePerJob: boolean;
  enabled: boolean;
  createdByStaffId: string | null;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AutomationRun = {
  id: string;
  companyId: string;
  automationId: string;
  jobId: string | null;
  invoiceId: string | null;
  estimateId: string | null;
  eventId: string | null;
  status: AutomationRunStatus;
  scheduledFor: string | null;
  renderedPreview: string;
  deliveryStatus: string;
  errorText: string;
  confirmedByStaffId: string | null;
  confirmedByName: string;
  decidedAt: string | null;
  dryRun: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AutomationTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string;
  triggerKind: AutomationTriggerKind;
  triggerConfig: AutomationTriggerConfig;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  requiresConfirmation: boolean;
  oncePerJob: boolean;
  sortOrder: number;
};

export type AutomationEventKind =
  | "job_created"
  | "job_stage_changed"
  | "invoice_paid"
  | "estimate_sent";

export type AutomationEvent = {
  kind: AutomationEventKind;
  jobId?: string;
  invoiceId?: string;
  estimateId?: string;
  stage?: WorkColumn;
  at?: string;
};
