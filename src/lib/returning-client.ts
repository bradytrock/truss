import { documentOwnerStaff } from "@/lib/document-owner";
import { formatDate } from "@/lib/format";
import { isDeletedJob } from "@/lib/job-record";
import { phonesMatch } from "@/lib/job-messages";
import { digitsOnly } from "@/lib/phone";
import {
  JOB_STATUS_LABELS,
  type Contact,
  type Job,
  type Opportunity,
  type ReturningClientLead,
  type ReturningClientLeadStatus,
  type StaffMember,
} from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";

export type { ReturningClientLead, ReturningClientLeadStatus } from "@/lib/types";

export const RETURNING_CLIENT_STATUSES = [
  "assigned",
  "offered",
  "pending",
  "reassigned",
  "kept",
  "dismissed",
] as const;

export type ReturningClientNoticeKind = "assigned" | "offered" | "pending";

export type ReturningClientMatchOn = "phone" | "email" | "partial_phone";

export type ReturningClientMatch = {
  contact: Contact;
  job: Job | null;
  previousStaffId: string;
  previousStaffName: string;
  completedAt: string | null;
  assignable: boolean;
  matchedOn: ReturningClientMatchOn;
};

function jobTouchesContact(job: Job, opportunity: Opportunity | undefined, contactIds: Set<string>) {
  if (job.primaryContactId && contactIds.has(job.primaryContactId)) return true;
  if (job.relatedContactIds.some((id) => contactIds.has(id))) return true;
  return Boolean(opportunity?.primaryContactId && contactIds.has(opportunity.primaryContactId));
}

function jobRecency(job: Job) {
  return job.substantialCompletion || job.startDate || "";
}

export function emailsMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = (left ?? "").trim().toLowerCase();
  const b = (right ?? "").trim().toLowerCase();
  if (!a || !b || !a.includes("@") || !b.includes("@")) return false;
  return a === b;
}

function contactsMatchingPhone(contacts: Contact[], phone: string) {
  const needle = digitsOnly(phone);
  if (needle.length < 7) return [];
  return contacts.filter((contact) => {
    const stored = digitsOnly(contact.phone ?? "");
    if (!stored) return false;
    if (needle.length >= 10 && stored.length >= 10) return phonesMatch(contact.phone, phone);
    const storedKey = stored.length >= 10 ? stored.slice(-10) : stored;
    return storedKey.includes(needle) || (storedKey.length >= 7 && needle.includes(storedKey));
  });
}

function contactsForReturningInput(
  contacts: Contact[],
  phone: string,
  email: string,
): { contacts: Contact[]; matchedOn: ReturningClientMatchOn } | null {
  const exactPhone = digitsOnly(phone).length >= 10 ? contacts.filter((contact) => phonesMatch(contact.phone, phone)) : [];
  if (exactPhone.length) return { contacts: exactPhone, matchedOn: "phone" };

  const emailHits = email ? contacts.filter((contact) => emailsMatch(contact.email, email)) : [];
  if (emailHits.length) return { contacts: emailHits, matchedOn: "email" };

  const partial = contactsMatchingPhone(contacts, phone);
  if (partial.length === 1) return { contacts: partial, matchedOn: "partial_phone" };
  return null;
}

function pickContact(contacts: Contact[], jobs: Job[], opportunities: Opportunity[]) {
  return (
    contacts.find((item) => jobs.some((job) => job.primaryContactId === item.id)) ||
    contacts.find((item) => opportunities.some((row) => row.primaryContactId === item.id)) ||
    contacts[0]
  );
}

/** Past job for this phone or email, preferring a completed one and its project manager. */
export function findReturningClient(input: {
  phone?: string;
  email?: string;
  contacts: Contact[];
  jobs: Job[];
  opportunities: Opportunity[];
  staff: StaffMember[];
  estimates?: Array<{ jobId: string | null; contactId: string | null; secondContactId?: string | null }>;
}): ReturningClientMatch | null {
  const found = contactsForReturningInput(input.contacts, input.phone ?? "", input.email ?? "");
  if (!found) return null;
  const contactIds = new Set(found.contacts.map((contact) => contact.id));
  const estimateJobIds = new Set(
    (input.estimates ?? [])
      .filter(
        (estimate) =>
          (estimate.contactId && contactIds.has(estimate.contactId)) ||
          (estimate.secondContactId && contactIds.has(estimate.secondContactId)),
      )
      .map((estimate) => estimate.jobId)
      .filter((id): id is string => Boolean(id)),
  );
  const jobs = input.jobs.filter((job) => {
    if (isDeletedJob(job)) return false;
    const opportunity = input.opportunities.find((item) => item.id === job.opportunityId);
    return jobTouchesContact(job, opportunity, contactIds) || estimateJobIds.has(job.id);
  });
  const contact = pickContact(found.contacts, jobs, input.opportunities);
  if (!jobs.length) {
    return {
      contact,
      job: null,
      previousStaffId: "",
      previousStaffName: "",
      completedAt: null,
      assignable: false,
      matchedOn: found.matchedOn,
    };
  }
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
  const assignable = Boolean(ownerMember && !ownerMember.locked);
  return {
    contact,
    job,
    previousStaffId: ownerMember?.id ?? "",
    previousStaffName,
    completedAt: job.status === "complete" ? jobRecency(job) || null : null,
    assignable,
    matchedOn: found.matchedOn,
  };
}

export function returningClientWhen(match: Pick<ReturningClientMatch, "job" | "completedAt">) {
  if (!match.job) return "No past job is linked yet.";
  if (match.completedAt) return `Completed ${formatDate(match.completedAt)}`;
  return `Last job is ${JOB_STATUS_LABELS[match.job.status]} (started ${formatDate(match.job.startDate)})`;
}

export function returningClientBannerTitle(match: ReturningClientMatch) {
  if (match.matchedOn === "email") return "This email is already in the book";
  if (match.matchedOn === "partial_phone") return "This number looks like a contact already in the book";
  return "This phone is already in the book";
}

export function hasPreviousPm(match: ReturningClientMatch | null | undefined) {
  if (!match) return false;
  return Boolean(match.previousStaffId || match.previousStaffName.trim());
}

export function assignsToPreviousPm(match: ReturningClientMatch | null, assigneeId: string | null | undefined) {
  if (!match?.previousStaffId || !assigneeId) return false;
  return match.previousStaffId === assigneeId;
}

/** Ask before saving when a past PM is known and the assignee is not that person. */
export function needsReturningClientConfirm(
  match: ReturningClientMatch | null,
  assigneeId: string | null | undefined,
) {
  if (!hasPreviousPm(match)) return false;
  return !assignsToPreviousPm(match, assigneeId);
}

/** Who should see the in-app notice after the lead is saved. */
export function returningClientNoticeKind(
  match: ReturningClientMatch | null,
  assigneeId: string | null | undefined,
  openerStaffId: string | null | undefined,
): ReturningClientNoticeKind | null {
  if (!match || !hasPreviousPm(match)) return null;
  const toPm = assignsToPreviousPm(match, assigneeId);
  const openerIsPm = Boolean(match.previousStaffId && match.previousStaffId === openerStaffId);
  if (toPm) return openerIsPm ? null : "assigned";
  if (openerIsPm) return "pending";
  if (match.assignable && match.previousStaffId) return "offered";
  return "pending";
}

export function isOpenReturningClientStatus(status: ReturningClientLeadStatus) {
  return status === "assigned" || status === "offered" || status === "pending";
}

export function actionableReturningClientNotices(
  notices: ReturningClientLead[] | undefined,
  actor: StaffMember | undefined,
) {
  if (!actor) return [];
  const isAdmin = canManageSettings(actor.role, actor);
  return (notices ?? []).filter((notice) => {
    if (notice.status === "offered" || notice.status === "assigned") {
      return notice.previousStaffId === actor.id;
    }
    if (notice.status === "pending") return isAdmin;
    return false;
  });
}

export function companyAdminsForNotice(staff: StaffMember[], exceptIds: string[] = []) {
  const unlocked = staff.filter((member) => member.role === "company_admin" && !member.locked && !member.restricted);
  const filtered = unlocked.filter((member) => !exceptIds.includes(member.id));
  return filtered.length ? filtered : unlocked;
}

export function returningClientSms(
  kind: ReturningClientNoticeKind,
  input: {
    openerName: string;
    contactName: string;
    previousStaffName: string;
    jobCode: string;
    when: string;
  },
) {
  const who = input.contactName.trim() || "a past client";
  const job = input.jobCode ? ` You ran ${input.jobCode}.` : "";
  if (kind === "assigned") {
    return `${input.openerName} opened a returning-client lead for ${who}.${job} Open Home in Truss to dismiss.`;
  }
  if (kind === "offered") {
    return `${input.openerName} opened a returning-client lead for ${who}.${job} ${input.when}. Take it or decline on Home in Truss.`;
  }
  return `${input.openerName} opened a returning-client lead for ${who}. Previous PM: ${input.previousStaffName}. Decide on Home in Truss.`;
}

export function returningClientTaskTitle(kind: ReturningClientNoticeKind, contactName: string) {
  const who = contactName.trim() || "past client";
  if (kind === "assigned") return `Past client called back: ${who}`;
  if (kind === "offered") return `Take or decline returning-client lead: ${who}`;
  return `Decide returning-client lead: ${who}`;
}

export function askTrussReturningClientPrompt(match: ReturningClientMatch) {
  const pm = match.previousStaffName || "the previous project manager";
  const job = match.job?.code ? ` on ${match.job.code}` : "";
  return [
    `This person is already in the book (${match.contact.name}).`,
    `${pm} was the project manager${job}.`,
    `${returningClientWhen(match)}.`,
    `Ask the user whether to assign this lead to ${pm}.`,
    "Then retry create_lead with the same fields and assignToPreviousPm true or false.",
  ].join(" ");
}

export function parseReturningClientStatus(value: string | null | undefined): ReturningClientLeadStatus {
  if (
    value === "assigned" ||
    value === "offered" ||
    value === "pending" ||
    value === "reassigned" ||
    value === "kept" ||
    value === "dismissed"
  ) {
    return value;
  }
  return "pending";
}
