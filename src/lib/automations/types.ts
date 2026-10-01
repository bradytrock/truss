import type { WorkColumn } from "@/lib/work-board";

export const AUTOMATION_TRIGGERS = [
  "job_created",
  "lead_created",
  "lead_created_after_days",
  "lead_assigned",
  "appointment_scheduled",
  "job_stage_changed",
  "job_stage_after_days",
  "estimate_sent",
  "estimate_sent_after_days",
  "estimate_won",
  "estimate_lost",
  "invoice_sent",
  "invoice_paid",
  "event_in_days",
] as const;

export type AutomationTriggerKind = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTriggerKind, string> = {
  job_created: "A job is created",
  lead_created: "A new lead is created",
  lead_created_after_days: "X days after a new lead is created",
  lead_assigned: "A lead is assigned",
  appointment_scheduled: "An appointment is scheduled",
  job_stage_changed: "A job moves to a stage",
  job_stage_after_days: "X days after a job enters a stage",
  estimate_sent: "A proposal is sent",
  estimate_sent_after_days: "X days after a proposal is sent",
  estimate_won: "A proposal is won",
  estimate_lost: "A proposal is lost",
  invoice_sent: "An invoice is sent",
  invoice_paid: "An invoice is paid",
  event_in_days: "X days before a calendar event",
};

export const AUTOMATION_ACTIONS = [
  "send_sms",
  "send_email",
  "create_task",
  "notify_staff",
  "set_job_value",
  "set_job_stage",
  "add_note",
  "webhook",
] as const;

export type AutomationActionKind = (typeof AUTOMATION_ACTIONS)[number];

export const AUTOMATION_ACTION_LABELS: Record<AutomationActionKind, string> = {
  send_sms: "Send text",
  send_email: "Send email",
  create_task: "Create task",
  notify_staff: "Notify a team member",
  set_job_value: "Change job value",
  set_job_stage: "Change job stage",
  add_note: "Add a job note",
  webhook: "Send to a webhook",
};

export const AUTOMATION_VALUE_MODES = ["estimate", "amount", "zero"] as const;
export type AutomationValueMode = (typeof AUTOMATION_VALUE_MODES)[number];

export const AUTOMATION_VALUE_MODE_LABELS: Record<AutomationValueMode, string> = {
  estimate: "The proposal total",
  amount: "A dollar amount",
  zero: "Zero",
};

export const AUTOMATION_CONDITION_FIELDS = [
  "job.stage",
  "job.status",
  "job.city",
  "job.state",
  "job.projectType",
  "job.market",
  "job.leadSource",
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
  "job.leadSource": "Lead source",
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
  "jobValue",
  "estimateTotal",
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
  jobValue: "Job value",
  estimateTotal: "Proposal total",
};

export const WORKFLOW_WAIT_UNITS = ["minutes", "hours", "days"] as const;
export type WorkflowWaitUnit = (typeof WORKFLOW_WAIT_UNITS)[number];

export type WorkflowStep =
  | { id: string; kind: "action"; action: AutomationAction }
  | { id: string; kind: "wait"; amount: number; unit: WorkflowWaitUnit };

export type WorkflowReply = {
  amount: number;
  unit: WorkflowWaitUnit;
  yes: WorkflowStep[];
  no: WorkflowStep[];
  timeout: WorkflowStep[];
};

/** Ordered steps, with an optional yes / no / no-reply split at the end. */
export type AutomationWorkflow = {
  enabled: true;
  steps: WorkflowStep[];
  reply?: WorkflowReply;
};

export type WorkflowLane = "main" | "yes" | "no" | "timeout";

/** Where a paused run resumes. Index is the next step in that lane. */
export type WorkflowCursor = {
  lane: WorkflowLane;
  index: number;
};

export type AutomationTriggerConfig = {
  stage?: WorkColumn | "";
  days?: number;
  workflow?: AutomationWorkflow;
};

export type AutomationCondition = {
  id: string;
  field: AutomationConditionField;
  operator: AutomationOperator;
  value: string;
};

export type AutomationActionTo = "customer" | "rep" | "staff" | "phone" | "email";

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
  /** Where a job-value action gets its number. */
  valueMode?: AutomationValueMode;
  /** Dollar amount when valueMode is `amount`. */
  amount?: number;
  /** Board column for a stage action. */
  stage?: WorkColumn | "";
  /** Mobile number when `to` is `phone`. */
  phone?: string;
  /** Address when `to` is `email`. */
  email?: string;
};

export const AUTOMATION_RUN_STATUSES = [
  "scheduled",
  "pending_confirmation",
  "confirmed",
  "skipped",
  "running",
  "waiting_reply",
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
  /** Set while a wait or a reply split is in progress. */
  workflowCursor?: WorkflowCursor | null;
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
  | "lead_created"
  | "lead_assigned"
  | "appointment_scheduled"
  | "job_stage_changed"
  | "invoice_sent"
  | "invoice_paid"
  | "estimate_sent"
  | "estimate_won"
  | "estimate_lost";

export type AutomationEvent = {
  kind: AutomationEventKind;
  jobId?: string;
  invoiceId?: string;
  estimateId?: string;
  eventId?: string;
  stage?: WorkColumn;
  at?: string;
};
