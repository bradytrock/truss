import type {
  CrmState,
  SeatRole,
  StaffMember,
  Team,
} from "@/lib/types";
import { SEAT_ROLE_LABELS, isNorthlineDemoName } from "@/lib/types";
import { bdOpportunityIds, hasBusinessDevelopmentSeat, jobInBdBook, referralPartnerIds } from "@/lib/bd";

export type AccessScope = "company" | "bd" | "team" | "own";

export function accessScope(role: SeatRole, restricted = false): AccessScope {
  if (restricted) return "own";
  if (role === "company_admin" || role === "accountant") return "company";
  if (role === "business_development") return "bd";
  if (role === "team_lead" || role === "team_admin") return "team";
  return "own";
}

export function canViewReports(role: SeatRole) {
  return (
    role === "company_admin" ||
    role === "business_development" ||
    role === "team_lead" ||
    role === "team_admin" ||
    role === "accountant"
  );
}

/** Dollar columns on reports — same seats that can open the page. */
export function canSeeReportMoney(role: SeatRole) {
  return canViewReports(role);
}

/** Other people’s names and close rates. Field seats never get this even if the page opens. */
export function canSeeTeamPerformance(role: SeatRole) {
  const scope = accessScope(role);
  return scope === "company" || scope === "team";
}

export function staffForReports(viewer: StaffMember, staff: StaffMember[]) {
  const scope = accessScope(viewer.role);
  if (scope === "company") return staff;
  if (scope === "team") {
    return staff.filter((member) => member.teamId === viewer.teamId || member.id === viewer.id);
  }
  return staff.filter((member) => member.id === viewer.id);
}

export function canViewAccounting(role: SeatRole) {
  return role === "company_admin" || role === "accountant";
}

export function canManageSettings(role: SeatRole, member?: StaffMember) {
  if (member?.restricted || member?.locked) return false;
  return role === "company_admin";
}

/** Default estimate/invoice terms, and the terms on a document or template. */
export function canEditDocumentTerms(role: SeatRole, member?: StaffMember) {
  return canManageSettings(role, member);
}

export function canDeleteJobs(viewer: StaffMember | undefined) {
  if (!viewer || viewer.restricted || viewer.locked) return false;
  return viewer.role === "company_admin";
}

export function canViewTeamTraining(role: SeatRole) {
  return role === "company_admin" || role === "team_lead" || role === "team_admin";
}

export function canPostTrainingBulletin(role: SeatRole) {
  return role === "company_admin" || role === "team_lead" || role === "team_admin";
}

export function canAssignLeadsToAnyone(
  viewer: StaffMember | undefined,
  extraRole?: SeatRole,
) {
  if (hasBusinessDevelopmentSeat(viewer, extraRole)) return true;
  if (!viewer) return true;
  return accessScope(viewer.role, viewer.restricted) === "company";
}

function sortAssignable(pool: StaffMember[], viewer?: StaffMember) {
  return [...pool].sort((left, right) => {
    if (viewer) {
      if (left.id === viewer.id && right.id !== viewer.id) return -1;
      if (right.id === viewer.id && left.id !== viewer.id) return 1;
    }
    return left.name.localeCompare(right.name);
  });
}

export function assignableStaff(
  viewer: StaffMember | undefined,
  staff: StaffMember[],
  extraRole?: SeatRole,
) {
  const pool = staff.filter((member) => !member.locked);
  if (canAssignLeadsToAnyone(viewer, extraRole)) return sortAssignable(pool, viewer);
  if (!viewer) return sortAssignable(pool);
  const scope = accessScope(viewer.role, viewer.restricted);
  if (scope === "team") {
    return sortAssignable(
      pool.filter((member) => member.teamId === viewer.teamId || member.id === viewer.id),
      viewer,
    );
  }
  return sortAssignable(
    pool.filter((member) => member.id === viewer.id),
    viewer,
  );
}

export function assignmentOptions(
  viewer: StaffMember | undefined,
  staff: StaffMember[],
  currentId?: string,
  extraRole?: SeatRole,
) {
  const allowed = assignableStaff(viewer, staff, extraRole);
  if (currentId && !allowed.some((member) => member.id === currentId)) {
    const current = staff.find((member) => member.id === currentId);
    if (current) return sortAssignable([current, ...allowed], viewer);
  }
  return allowed;
}

export function staffAssignmentLabel(member: StaffMember) {
  return `${member.name} · ${SEAT_ROLE_LABELS[member.role]}`;
}

export function canLoginAs(viewer: StaffMember) {
  if (viewer.restricted || viewer.locked) return false;
  return (
    viewer.role === "company_admin" ||
    viewer.role === "team_lead" ||
    viewer.role === "team_admin"
  );
}

export function loginAsTargets(viewer: StaffMember, staff: StaffMember[]) {
  const real = staff.filter(
    (member) => !isNorthlineDemoName(member.name) && !member.locked,
  );
  if (viewer.role === "company_admin") {
    return real.filter((member) => member.id !== viewer.id);
  }
  if (!canLoginAs(viewer) || !viewer.teamId) return [];
  return real.filter(
    (member) => member.teamId === viewer.teamId && member.id !== viewer.id
  );
}

export function teamMemberIds(teamId: string | null, staff: StaffMember[]) {
  if (!teamId) return new Set<string>();
  return new Set(staff.filter((member) => member.teamId === teamId).map((member) => member.id));
}

export function teamMemberNames(teamId: string | null, staff: StaffMember[]) {
  if (!teamId) return new Set<string>();
  return new Set(staff.filter((member) => member.teamId === teamId).map((member) => member.name));
}

function visibleStaffIdsForScope(effective: StaffMember, staff: StaffMember[]) {
  const scope = accessScope(effective.role, effective.restricted);
  if (scope === "company") {
    return new Set(staff.map((member) => member.id));
  }
  if (scope === "team") return teamMemberIds(effective.teamId, staff);
  return new Set([effective.id]);
}

export function scopeBook(
  state: CrmState,
  effective: StaffMember | undefined
): CrmState {
  if (!effective) return state;
  const scope = accessScope(effective.role, effective.restricted);
  if (scope === "company") return state;

  const staffIds = visibleStaffIdsForScope(effective, state.staff);
  const names = new Set(
    state.staff.filter((member) => staffIds.has(member.id)).map((member) => member.name)
  );
  names.add(effective.name);

  const bdOppIds = scope === "bd" ? bdOpportunityIds(state, effective) : new Set<string>();
  const partnerIds = scope === "bd" ? referralPartnerIds(state.contacts, effective.id) : new Set<string>();

  const jobs =
    scope === "bd"
      ? state.jobs.filter((job) => jobInBdBook(job, bdOppIds, state.opportunities))
      : state.jobs.filter((job) => {
          if (staffIds.has(job.ownerStaffId)) return true;
          if (names.has(job.projectManager) || names.has(job.superintendent)) return true;
          return false;
        });
  const jobIds = new Set(jobs.map((job) => job.id));

  const opportunities =
    scope === "bd"
      ? state.opportunities.filter((opportunity) => bdOppIds.has(opportunity.id))
      : state.opportunities.filter((opportunity) => {
          if (staffIds.has(opportunity.ownerStaffId) || names.has(opportunity.estimator)) {
            return true;
          }
          return Boolean(opportunity.id && jobs.some((job) => job.opportunityId === opportunity.id));
        });
  const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.id));

  const contacts =
    scope === "bd"
      ? state.contacts.filter((contact) => {
          if (contact.ownerStaffId === effective.id) return true;
          if (partnerIds.has(contact.id)) return true;
          return opportunities.some(
            (opportunity) =>
              opportunity.primaryContactId === contact.id || opportunity.referralContactId === contact.id,
          );
        })
      : state.contacts.filter((contact) => {
          if (staffIds.has(contact.ownerStaffId)) return true;
          return opportunities.some((opportunity) => opportunity.primaryContactId === contact.id);
        });

  const clientIds = new Set<string>();
  for (const job of jobs) if (job.clientId) clientIds.add(job.clientId);
  for (const opportunity of opportunities) if (opportunity.clientId) clientIds.add(opportunity.clientId);
  for (const contact of contacts) if (contact.clientId) clientIds.add(contact.clientId);
  const clients = state.clients.filter((client) => clientIds.has(client.id));

  const estimates = state.estimates.filter((estimate) => {
    if (estimate.jobId && jobIds.has(estimate.jobId)) return true;
    if (estimate.opportunityId && opportunityIds.has(estimate.opportunityId)) return true;
    return Boolean(estimate.clientId && clientIds.has(estimate.clientId) && scope === "bd");
  });
  const estimateIds = new Set(estimates.map((estimate) => estimate.id));

  const invoices = state.invoices.filter((invoice) => {
    if (invoice.jobId && jobIds.has(invoice.jobId)) return true;
    if (invoice.estimateId && estimateIds.has(invoice.estimateId)) return true;
    return Boolean(invoice.clientId && clientIds.has(invoice.clientId) && (scope === "bd" || jobIds.size > 0));
  });
  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));

  const payments = state.payments.filter((payment) => {
    if (payment.jobId && jobIds.has(payment.jobId)) return true;
    return Boolean(payment.invoiceId && invoiceIds.has(payment.invoiceId));
  });
  const expenses = state.expenses.filter((expense) => {
    if (expense.jobId && jobIds.has(expense.jobId)) return true;
    if (scope === "bd" && !expense.jobId && expense.createdBy === effective.name) return true;
    return false;
  });
  const photos = state.photos;
  const photoReports = state.photoReports.filter((report) => jobIds.has(report.jobId));
  const events = state.events.filter((event) => {
    if (event.jobId && jobIds.has(event.jobId)) return true;
    if (event.opportunityId && opportunityIds.has(event.opportunityId)) return true;
    if (names.has(event.assignee)) return true;
    return false;
  });
  const tasks = state.tasks.filter((task) => {
    if (names.has(task.assignee)) return true;
    if (task.relatedType === "job" && task.relatedId && jobIds.has(task.relatedId)) return true;
    if (task.relatedType === "opportunity" && task.relatedId && opportunityIds.has(task.relatedId)) {
      return true;
    }
    return false;
  });
  const activities = state.activities.filter((activity) => {
    if (names.has(activity.author) && (scope === "team" || scope === "own")) return true;
    if (activity.entityType === "job") return jobIds.has(activity.entityId);
    if (activity.entityType === "opportunity") return opportunityIds.has(activity.entityId);
    if (activity.entityType === "client") return clientIds.has(activity.entityId);
    return false;
  });

  return {
    ...state,
    clients,
    contacts,
    opportunities,
    jobs,
    activities,
    tasks,
    estimates,
    invoices,
    payments,
    expenses,
    events,
    photos,
    photoReports,
    estimateLines: state.estimateLines.filter((line) => estimateIds.has(line.estimateId)),
    invoiceLines: state.invoiceLines.filter((line) => invoiceIds.has(line.invoiceId)),
    trainingProgress: state.trainingProgress.filter((item) => staffIds.has(item.staffId)),
    messages: state.messages.filter((message) => {
      if (!message.jobId && !message.opportunityId && !message.contactId) return true;
      if (message.jobId && jobIds.has(message.jobId)) return true;
      if (message.opportunityId && opportunityIds.has(message.opportunityId)) return true;
      if (message.contactId && contacts.some((contact) => contact.id === message.contactId)) return true;
      return false;
    }),
  };
}

export function scopeDescription(
  effective: StaffMember,
  viewer: StaffMember,
  impersonating: boolean,
  teams: Team[]
) {
  const team = teams.find((item) => item.id === effective.teamId);
  if (impersonating) {
    return `Logged in as ${effective.name} (${SEAT_SHORT[effective.role]}). Showing that seat’s book.`;
  }
  const scope = accessScope(viewer.role, viewer.restricted);
  if (scope === "company") {
    if (effective.role === "accountant") {
      return "Accounting — every job’s books, receipts, and the QuickBooks entry queue.";
    }
    return "Company admin — every job, contact, and report in the company.";
  }
  if (scope === "bd") {
    return "Business development — pipeline you sourced, jobs from the agents you brought in, and company BD ROI. Assign the work; you still keep the numbers.";
  }
  if (scope === "team") {
    return `${team?.name ?? "Your team"} — every job and contact owned by people on this team. Login As a teammate to inspect their book.`;
  }
  return "Your jobs and contact book only.";
}

const SEAT_SHORT: Record<SeatRole, string> = {
  company_admin: "company admin",
  business_development: "business development",
  team_lead: "team lead",
  team_admin: "team administrator",
  project_manager: "project manager",
  estimator: "estimator",
  superintendent: "superintendent",
  accountant: "accounting",
};
