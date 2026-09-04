import type { CompanyAuditAction, CompanyAuditEntityType, CompanyAuditEvent } from "@/lib/types";

export const COMPANY_AUDIT_ENTITY_LABELS: Record<CompanyAuditEntityType, string> = {
  job: "Job",
  contact: "Contact",
  opportunity: "Opportunity",
  photo: "Photo",
  job_file: "Job file",
  estimate: "Estimate",
  invoice: "Invoice",
  company_file: "Company file",
};

export const COMPANY_AUDIT_ACTION_LABELS: Record<CompanyAuditAction, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  restored: "Restored",
  status_changed: "Status changed",
  reverted: "Reverted",
};

export function asAuditState(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function changedAuditFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort((a, b) => a.localeCompare(b));
}

export function pickAuditFields(
  source: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in source) next[field] = source[field];
  }
  return next;
}

export function summarizeAuditChange(input: {
  entityType: CompanyAuditEntityType;
  action: CompanyAuditAction;
  label?: string;
  changedFields?: string[];
  detail?: string;
}) {
  const entity = COMPANY_AUDIT_ENTITY_LABELS[input.entityType];
  const label = input.label?.trim();
  const subject = label ? `${entity} “${label}”` : entity;
  if (input.action === "created") return `Created ${subject}`;
  if (input.action === "deleted") return `Deleted ${subject}`;
  if (input.action === "restored") return `Restored ${subject}`;
  if (input.action === "reverted") return input.detail?.trim() || `Reverted a change to ${subject}`;
  if (input.action === "status_changed") {
    return input.detail?.trim() || `Changed status on ${subject}`;
  }
  const fields = (input.changedFields ?? []).slice(0, 6);
  if (fields.length === 0) return `Updated ${subject}`;
  return `Updated ${subject}: ${fields.join(", ")}`;
}

export function parseCompanyAuditAction(value: unknown): CompanyAuditAction {
  switch (value) {
    case "created":
    case "updated":
    case "deleted":
    case "restored":
    case "status_changed":
    case "reverted":
      return value;
    default:
      return "updated";
  }
}

export function parseCompanyAuditEntityType(value: unknown): CompanyAuditEntityType {
  switch (value) {
    case "job":
    case "contact":
    case "opportunity":
    case "photo":
    case "job_file":
    case "estimate":
    case "invoice":
    case "company_file":
      return value;
    default:
      return "job";
  }
}

export function mapCompanyAuditEvent(row: {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  actor_staff_id: string | null;
  summary: string;
  before_state: unknown;
  after_state: unknown;
  changed_fields: string[] | null;
  related_job_id: string | null;
  related_opportunity_id: string | null;
  reverted_at: string | null;
  reverted_by: string;
  revert_of_event_id: string | null;
  created_at: string;
}): CompanyAuditEvent {
  return {
    id: row.id,
    entityType: parseCompanyAuditEntityType(row.entity_type),
    entityId: row.entity_id,
    action: parseCompanyAuditAction(row.action),
    actor: row.actor ?? "",
    actorStaffId: row.actor_staff_id,
    summary: row.summary ?? "",
    beforeState: asAuditState(row.before_state),
    afterState: asAuditState(row.after_state),
    changedFields: Array.isArray(row.changed_fields) ? row.changed_fields.map(String) : [],
    relatedJobId: row.related_job_id,
    relatedOpportunityId: row.related_opportunity_id,
    revertedAt: row.reverted_at,
    revertedBy: row.reverted_by ?? "",
    revertOfEventId: row.revert_of_event_id,
    createdAt: row.created_at,
  };
}

export function canRevertCompanyAudit(event: CompanyAuditEvent) {
  if (event.revertedAt) return false;
  if (event.action === "reverted") return false;
  if (event.action === "created") return false;
  if (event.entityType === "job_file" && event.action === "deleted") return false;
  if (event.entityType === "company_file" && event.action === "deleted") return false;
  return (
    event.action === "updated" ||
    event.action === "deleted" ||
    event.action === "restored" ||
    event.action === "status_changed"
  );
}
