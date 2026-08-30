import { documentOwnerStaff } from "@/lib/document-owner";
import { formatDate } from "@/lib/format";
import { isDeletedJob } from "@/lib/job-record";
import { phonesMatch } from "@/lib/job-messages";
import { JOB_STATUS_LABELS, type Contact, type Job, type Opportunity, type ReturningClientLeadStatus, type StaffMember } from "@/lib/types";

export type { ReturningClientLead, ReturningClientLeadStatus } from "@/lib/types";

export type ReturningClientMatch = {
  contact: Contact;
  job: Job;
  previousStaffId: string;
  previousStaffName: string;
  completedAt: string | null;
  assignable: boolean;
};

function jobTouchesContact(job: Job, opportunity: Opportunity | undefined, contactIds: Set<string>) {
  if (job.primaryContactId && contactIds.has(job.primaryContactId)) return true;
  if (job.relatedContactIds.some((id) => contactIds.has(id))) return true;
  return Boolean(opportunity?.primaryContactId && contactIds.has(opportunity.primaryContactId));
}

function jobRecency(job: Job) {
  return job.substantialCompletion || job.startDate || "";
}

/** Past job for this phone, preferring a completed one and its project manager. */
export function findReturningClient(input: {
  phone: string;
  contacts: Contact[];
  jobs: Job[];
  opportunities: Opportunity[];
  staff: StaffMember[];
}): ReturningClientMatch | null {
  const contacts = input.contacts.filter((contact) => phonesMatch(contact.phone, input.phone));
  if (!contacts.length) return null;
  const contactIds = new Set(contacts.map((contact) => contact.id));
  const jobs = input.jobs.filter((job) => {
    if (isDeletedJob(job)) return false;
    const opportunity = input.opportunities.find((item) => item.id === job.opportunityId);
    return jobTouchesContact(job, opportunity, contactIds);
  });
  if (!jobs.length) return null;
  const ranked = [...jobs].sort((left, right) => {
    const leftDone = left.status === "complete" ? 0 : 1;
    const rightDone = right.status === "complete" ? 0 : 1;
    if (leftDone !== rightDone) return leftDone - rightDone;
    return jobRecency(right).localeCompare(jobRecency(left));
  });
  const job = ranked[0];
  const opportunity = input.opportunities.find((item) => item.id === job.opportunityId);
  const owner = documentOwnerStaff({ job, opportunity, staff: input.staff });
  const ownerMember = owner ? input.staff.find((member) => member.id === owner.id) : undefined;
  const previousStaffName = ownerMember?.name.trim() || owner?.name.trim() || job.projectManager.trim();
  if (!previousStaffName) return null;
  const assignable = Boolean(ownerMember && !ownerMember.locked);
  const contact =
    contacts.find((item) => item.id === job.primaryContactId) ||
    contacts.find((item) => opportunity && item.id === opportunity.primaryContactId) ||
    contacts[0];
  return {
    contact,
    job,
    previousStaffId: assignable && ownerMember ? ownerMember.id : "",
    previousStaffName,
    completedAt: job.status === "complete" ? jobRecency(job) || null : null,
    assignable,
  };
}

export function returningClientWhen(match: Pick<ReturningClientMatch, "job" | "completedAt">) {
  if (match.completedAt) return `Completed ${formatDate(match.completedAt)}`;
  return `Last job is ${JOB_STATUS_LABELS[match.job.status]} (started ${formatDate(match.job.startDate)})`;
}

export function assignsToPreviousPm(match: ReturningClientMatch | null, assigneeId: string | null | undefined) {
  if (!match?.assignable || !match.previousStaffId) return false;
  return match.previousStaffId === assigneeId;
}

/** Ask before saving when this phone is a past client and the assignee is not that PM. */
export function needsReturningClientConfirm(
  match: ReturningClientMatch | null,
  assigneeId: string | null | undefined,
) {
  if (!match) return false;
  return !assignsToPreviousPm(match, assigneeId);
}

/** Company admins already decided if they keep another assignee. Everyone else files a Home notice. */
export function needsReturningClientAdminNotice(
  match: ReturningClientMatch | null,
  assigneeId: string | null | undefined,
  viewerIsCompanyAdmin: boolean,
) {
  if (!match || viewerIsCompanyAdmin) return false;
  return !assignsToPreviousPm(match, assigneeId);
}

export function parseReturningClientStatus(value: string | null | undefined): ReturningClientLeadStatus {
  if (value === "reassigned" || value === "kept") return value;
  return "pending";
}
