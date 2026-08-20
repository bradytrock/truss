import type {
  CrmState,
  SeatRole,
  StaffMember,
  Team,
} from "@/lib/types";

export type AccessScope = "company" | "all_jobs" | "team" | "own";

export function accessScope(role: SeatRole): AccessScope {
  if (role === "company_admin" || role === "accountant") return "company";
  if (role === "business_development") return "all_jobs";
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

export function canViewAccounting(role: SeatRole) {
  return role === "company_admin" || role === "accountant";
}

export function canManageSettings(role: SeatRole) {
  return role === "company_admin";
}

export function canViewTeamTraining(role: SeatRole) {
  return (
    role === "company_admin" ||
    role === "business_development" ||
    role === "team_lead" ||
    role === "team_admin"
  );
}

export function canPostTrainingBulletin(role: SeatRole) {
  return role === "company_admin" || role === "team_lead" || role === "team_admin";
}

export function assignableStaff(viewer: StaffMember | undefined, staff: StaffMember[]) {
  if (!viewer) return staff;
  const scope = accessScope(viewer.role);
  if (scope === "company" || scope === "all_jobs") return staff;
  if (scope === "team") {
    return staff.filter((member) => member.teamId === viewer.teamId || member.id === viewer.id);
  }
  return staff.filter((member) => member.id === viewer.id);
}

export function canLoginAs(viewer: StaffMember) {
  return (
    viewer.role === "company_admin" ||
    viewer.role === "team_lead" ||
    viewer.role === "team_admin"
  );
}

export function loginAsTargets(viewer: StaffMember, staff: StaffMember[]) {
  if (viewer.role === "company_admin") {
    return staff.filter((member) => member.id !== viewer.id);
  }
  if (!canLoginAs(viewer) || !viewer.teamId) return [];
  return staff.filter(
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
  const scope = accessScope(effective.role);
  if (scope === "company" || scope === "all_jobs") {
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
  const scope = accessScope(effective.role);
  if (scope === "company") return state;

  const staffIds = visibleStaffIdsForScope(effective, state.staff);
  const names = new Set(
    state.staff.filter((member) => staffIds.has(member.id)).map((member) => member.name)
  );
  names.add(effective.name);

  const jobs =
    scope === "all_jobs"
      ? state.jobs
      : state.jobs.filter((job) => {
          if (staffIds.has(job.ownerStaffId)) return true;
          if (names.has(job.projectManager) || names.has(job.superintendent)) return true;
          return false;
        });
  const jobIds = new Set(jobs.map((job) => job.id));

  const opportunities =
    scope === "all_jobs"
      ? state.opportunities
      : state.opportunities.filter((opportunity) => {
          if (staffIds.has(opportunity.ownerStaffId) || names.has(opportunity.estimator)) {
            return true;
          }
          return Boolean(opportunity.id && jobs.some((job) => job.opportunityId === opportunity.id));
        });
  const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.id));

  const contacts =
    scope === "all_jobs"
      ? state.contacts
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
    return Boolean(estimate.clientId && clientIds.has(estimate.clientId) && scope === "all_jobs");
  });
  const estimateIds = new Set(estimates.map((estimate) => estimate.id));

  const invoices = state.invoices.filter((invoice) => {
    if (invoice.jobId && jobIds.has(invoice.jobId)) return true;
    if (invoice.estimateId && estimateIds.has(invoice.estimateId)) return true;
    return Boolean(invoice.clientId && clientIds.has(invoice.clientId) && (scope === "all_jobs" || jobIds.size > 0));
  });
  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));

  const payments = state.payments.filter((payment) => {
    if (payment.jobId && jobIds.has(payment.jobId)) return true;
    return Boolean(payment.invoiceId && invoiceIds.has(payment.invoiceId));
  });
  const expenses = state.expenses.filter((expense) => {
    if (!expense.jobId) return false;
    return jobIds.has(expense.jobId);
  });
  const photos = state.photos.filter((photo) => jobIds.has(photo.jobId));
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
    estimateLines: state.estimateLines.filter((line) => estimateIds.has(line.estimateId)),
    invoiceLines: state.invoiceLines.filter((line) => invoiceIds.has(line.invoiceId)),
    trainingProgress: state.trainingProgress.filter((item) => staffIds.has(item.staffId)),
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
  const scope = accessScope(viewer.role);
  if (scope === "company") {
    if (effective.role === "accountant") {
      return "Accounting — every job’s books, receipts, and the QuickBooks entry queue.";
    }
    return "Company admin — every job, contact, and report in the company.";
  }
  if (scope === "all_jobs") {
    return "Business development — all jobs, plus restricted reports (open / closed YTD, referral partners by PM, YTD revenue).";
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
