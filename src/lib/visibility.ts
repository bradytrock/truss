import type {
  Client,
  Contact,
  CrmState,
  Job,
  Opportunity,
  SeatRole,
  StaffMember,
  Team,
} from "@/lib/types";
import { SEAT_ROLE_LABELS, isNorthlineDemoName } from "@/lib/types";
import { bdOpportunityIds, hasBusinessDevelopmentSeat, jobInBdBook, referralPartnerIds } from "@/lib/bd";
import { documentOwnerStaff } from "@/lib/document-owner";

export type AccessScope = "company" | "bd" | "team" | "own";

/** Company-wide seat. Directors match a company admin on the book, not on settings or accounting. */
export function isCompanyLeader(role: SeatRole | undefined) {
  return role === "company_admin" || role === "director";
}

/** Unlocked company admin or director. Operational leadership, not business settings. */
export function canLeadCompany(
  role: SeatRole,
  member?: Pick<StaffMember, "locked" | "restricted">,
) {
  if (member?.restricted || member?.locked) return false;
  return isCompanyLeader(role);
}

export function accessScope(role: SeatRole, restricted = false): AccessScope {
  if (restricted) return "own";
  if (isCompanyLeader(role) || role === "accountant") return "company";
  if (role === "business_development") return "bd";
  if (role === "team_lead" || role === "team_admin") return "team";
  return "own";
}

export function canViewReports(role: SeatRole) {
  return (
    isCompanyLeader(role) ||
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

/** Jobs board people filter — company admin, accounting, and team leads/admins. Restricted seats stay on their own book. */
export function canFilterJobsByOwner(viewer: StaffMember | undefined) {
  if (!viewer || viewer.restricted || viewer.locked) return false;
  const scope = accessScope(viewer.role, viewer.restricted);
  return scope === "company" || scope === "team";
}

export const JOBS_UNASSIGNED_OWNER = "unassigned";
export const JOBS_OWNERS_PARAM = "owners";

export function staffForJobsOwnerFilter(viewer: StaffMember, staff: StaffMember[]) {
  return staffForReports(viewer, staff)
    .filter((member) => !isNorthlineDemoName(member.name))
    .sort((left, right) => {
      if (left.id === viewer.id && right.id !== viewer.id) return -1;
      if (right.id === viewer.id && left.id !== viewer.id) return 1;
      return left.name.localeCompare(right.name);
    });
}

export function jobsOwnerFilterIds(people: StaffMember[]) {
  return [...people.map((member) => member.id), JOBS_UNASSIGNED_OWNER];
}

export function parseJobsOwnerFilter(raw: string | null, allowedIds: readonly string[]): Set<string> | null {
  if (raw === null) return null;
  const allowed = new Set(allowedIds);
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return new Set();
  const selected = new Set(tokens.filter((token) => allowed.has(token)));
  if (selected.size === 0) return null;
  if (selected.size === allowedIds.length && allowedIds.every((id) => selected.has(id))) {
    return null;
  }
  return selected;
}

export function serializeJobsOwnerFilter(
  selected: Set<string> | null,
  allowedIds: readonly string[],
): string | null {
  if (!selected) return null;
  if (selected.size === 0) return "";
  if (selected.size === allowedIds.length && allowedIds.every((id) => selected.has(id))) return null;
  return allowedIds.filter((id) => selected.has(id)).join(",");
}

export function toggleJobsOwnerFilter(
  id: string,
  selected: Set<string> | null,
  allowedIds: readonly string[],
): Set<string> | null {
  const current = selected ?? new Set(allowedIds);
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  const serialized = serializeJobsOwnerFilter(next, allowedIds);
  return parseJobsOwnerFilter(serialized, allowedIds);
}

export function jobsOwnerFilterLabel(selected: Set<string> | null, people: StaffMember[]) {
  if (!selected) return "Everyone";
  if (selected.size === 0) return "Nobody";
  const names: string[] = [];
  for (const member of people) {
    if (selected.has(member.id)) names.push(member.name);
  }
  if (selected.has(JOBS_UNASSIGNED_OWNER)) names.push("Unassigned");
  if (names.length === 1) return names[0] ?? "People";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} + ${names.length - 1} more`;
}

export function jobPipelineOwnerId(
  job: Pick<Job, "ownerStaffId" | "projectManager" | "salesRep">,
  opportunity: Pick<Opportunity, "ownerStaffId" | "estimator"> | undefined,
  staff: StaffMember[],
) {
  return (
    documentOwnerStaff({
      job,
      opportunity,
      staff,
    })?.id ?? JOBS_UNASSIGNED_OWNER
  );
}

export function jobMatchesOwnerFilter(
  job: Pick<Job, "ownerStaffId" | "projectManager" | "salesRep">,
  opportunity: Pick<Opportunity, "ownerStaffId" | "estimator"> | undefined,
  selected: Set<string> | null | undefined,
  staff: StaffMember[],
) {
  if (!selected) return true;
  return selected.has(jobPipelineOwnerId(job, opportunity, staff));
}

/** Accounting Suite: review desk, QuickBooks queue, and closeout review. Directors do not get this. */
export function canViewAccounting(role: SeatRole) {
  return role === "company_admin" || role === "accountant";
}

/**
 * Job books: invoices, expenses, payments, profit, and the Financials tab.
 * Business development only sees what the job sold for.
 */
export function canViewProjectFinancials(role: SeatRole | undefined) {
  return Boolean(role) && role !== "business_development";
}

/** Draft and edit estimates. Business development assigns the work; ops writes the proposal. */
export function canCreateEstimates(role: SeatRole | undefined) {
  return Boolean(role) && role !== "business_development";
}

/** Draft invoices. Same seats that see project financials. */
export function canCreateInvoices(role: SeatRole | undefined) {
  return canViewProjectFinancials(role);
}

/**
 * Branded Pages on a job (work orders, photo docs, claim packets).
 * Business development can open existing pages but not create or edit them.
 */
export function canCreatePages(role: SeatRole | undefined) {
  return Boolean(role) && role !== "business_development";
}

export function canEditPages(role: SeatRole | undefined) {
  return canCreatePages(role);
}

/** Link, unlink, or create a CompanyCam project on a job. */
export function canManageCompanyCamMapping(role: SeatRole | undefined) {
  return Boolean(role) && role !== "business_development";
}

/** Job Paper tab — estimates, invoices, material orders, and related tasks. */
export function canViewJobPaper(role: SeatRole | undefined) {
  return Boolean(role) && role !== "business_development";
}

/** Company insurance desk and the job Insurance tab. */
export function canViewInsurance(role: SeatRole | undefined) {
  return Boolean(role) && role !== "business_development";
}

/** Company name, people, payments, integrations, and other business settings. Directors do not get this. */
export function canManageSettings(role: SeatRole, member?: StaffMember) {
  if (member?.restricted || member?.locked) return false;
  return role === "company_admin";
}

export function canManageAutomations(role: SeatRole, member?: StaffMember) {
  if (member?.restricted || member?.locked) return false;
  if (isCompanyLeader(role)) return true;
  return Boolean(member?.manageAutomations);
}

/** Company default estimate/invoice terms in Settings. Payment sections on a document are separate. */
export function canEditDocumentTerms(role: SeatRole, member?: StaffMember) {
  return canManageSettings(role, member);
}

export function canGenerateSignatureCertificate(viewer: StaffMember | undefined) {
  if (!viewer || viewer.restricted || viewer.locked) return false;
  return isCompanyLeader(viewer.role);
}

export function canDeleteJobs(viewer: StaffMember | undefined) {
  if (!viewer || viewer.restricted || viewer.locked) return false;
  return isCompanyLeader(viewer.role);
}

/** Field school / training resources. Business development does not use this library. */
export function canViewTraining(role: SeatRole | undefined) {
  return Boolean(role) && role !== "business_development";
}

/** Add, trash, restore, or set primary job photos. BD can view the gallery only. */
export function canManageJobPhotos(role: SeatRole | undefined) {
  return Boolean(role) && role !== "business_development";
}

export function canViewTeamTraining(role: SeatRole) {
  return isCompanyLeader(role) || role === "team_lead" || role === "team_admin";
}

export function canPostTrainingBulletin(role: SeatRole) {
  return isCompanyLeader(role) || role === "team_lead" || role === "team_admin";
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

/** New Lead “Assigned to” is the project manager. Any unlocked seat in the company can take it. */
export function companyLeadAssignees(
  viewer: StaffMember | undefined,
  staff: StaffMember[],
  currentId?: string,
) {
  const allowed = sortAssignable(
    staff.filter((member) => !member.locked),
    viewer,
  );
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
    isCompanyLeader(viewer.role) ||
    viewer.role === "team_lead" ||
    viewer.role === "team_admin"
  );
}

export function loginAsTargets(viewer: StaffMember, staff: StaffMember[]) {
  const real = staff.filter(
    (member) => !isNorthlineDemoName(member.name) && !member.locked,
  );
  if (isCompanyLeader(viewer.role)) {
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

/**
 * The full contact directory: every person, including business development’s
 * private book. Directors still see people on company work, not that book.
 */
export function canSeeAllContacts(role: SeatRole | undefined, restricted = false) {
  if (!role || restricted) return false;
  return role === "company_admin" || role === "business_development" || role === "accountant";
}

function developerStaffIds(staff: StaffMember[]) {
  return new Set(staff.filter((member) => hasBusinessDevelopmentSeat(member)).map((member) => member.id));
}

function listedIds(ids: readonly string[] | null | undefined) {
  return ids ?? [];
}

function contactOnVisibleWork(contactId: string, opportunities: Opportunity[], jobs: Job[]) {
  for (const opportunity of opportunities) {
    if (opportunity.primaryContactId === contactId || opportunity.referralContactId === contactId) return true;
  }
  for (const job of jobs) {
    if (job.primaryContactId === contactId) return true;
    if (listedIds(job.relatedContactIds).includes(contactId)) return true;
    if (listedIds(job.subcontractorIds).includes(contactId)) return true;
  }
  return false;
}

/** Referral partners and people a business development seat owns, unless this viewer owns them. */
function privateBdContact(contact: Contact, developers: Set<string>, viewerId: string) {
  if (contact.ownerStaffId === viewerId) return false;
  if (contact.isReferralPartner) return true;
  return Boolean(contact.ownerStaffId && developers.has(contact.ownerStaffId));
}

function contactsSharedWithSeat(
  contacts: Contact[],
  effective: StaffMember,
  staff: StaffMember[],
  staffIds: Set<string>,
  opportunities: Opportunity[],
  jobs: Job[],
) {
  const developers = developerStaffIds(staff);
  return contacts.filter((contact) => {
    if (contactOnVisibleWork(contact.id, opportunities, jobs)) return true;
    if (privateBdContact(contact, developers, effective.id)) return false;
    return staffIds.has(contact.ownerStaffId);
  });
}

function withParentClients(clients: Client[], ids: Set<string>) {
  const shown = new Set(ids);
  for (const client of clients) {
    if (shown.has(client.id) && client.parentClientId) shown.add(client.parentClientId);
  }
  return clients.filter((client) => shown.has(client.id));
}

export function scopeBook(
  state: CrmState,
  effective: StaffMember | undefined
): CrmState {
  if (!effective) return state;
  const scope = accessScope(effective.role, effective.restricted);
  if (scope === "company") {
    if (canSeeAllContacts(effective.role, effective.restricted)) return state;
    return scopeCompanyContacts(state, effective);
  }

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

  const workContacts =
    scope === "bd"
      ? state.contacts.filter((contact) => {
          if (contact.isReferralPartner) return true;
          if (contact.ownerStaffId === effective.id) return true;
          if (partnerIds.has(contact.id)) return true;
          return opportunities.some(
            (opportunity) =>
              opportunity.primaryContactId === contact.id || opportunity.referralContactId === contact.id,
          );
        })
      : contactsSharedWithSeat(state.contacts, effective, state.staff, staffIds, opportunities, jobs);
  const contacts = canSeeAllContacts(effective.role, effective.restricted) ? state.contacts : workContacts;

  const clientIds = new Set<string>();
  for (const job of jobs) if (job.clientId) clientIds.add(job.clientId);
  for (const opportunity of opportunities) if (opportunity.clientId) clientIds.add(opportunity.clientId);
  for (const contact of workContacts) if (contact.clientId) clientIds.add(contact.clientId);
  const shownClientIds = new Set(clientIds);
  for (const contact of contacts) if (contact.clientId) shownClientIds.add(contact.clientId);
  const clients = withParentClients(state.clients, shownClientIds);

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
  const jobInsurance = (state.jobInsurance ?? []).filter((item) => jobIds.has(item.jobId));
  const forecastedExpenses = (state.forecastedExpenses ?? []).filter((item) => {
    if (item.jobId && jobIds.has(item.jobId)) return true;
    if (scope === "bd" && !item.jobId && item.createdBy === effective.name) return true;
    return false;
  });
  const materialOrders = (state.materialOrders ?? []).filter((order) => jobIds.has(order.jobId));
  const materialOrderIds = new Set(materialOrders.map((order) => order.id));
  const photos = state.photos;
  const photoAuditEvents = (state.photoAuditEvents ?? []).filter(
    (event) => !event.jobId || jobIds.has(event.jobId),
  );
  const companyAuditEvents = state.companyAuditEvents ?? [];
  const jobFiles = (state.jobFiles ?? []).filter((file) => jobIds.has(file.jobId));
  const estimateFiles = (state.estimateFiles ?? []).filter((file) =>
    estimateIds.has(file.estimateId),
  );
  const invoiceFiles = (state.invoiceFiles ?? []).filter((file) => invoiceIds.has(file.invoiceId));
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
    forecastedExpenses,
    jobInsurance,
    commissionCloseouts: (state.commissionCloseouts ?? []).filter((item) => jobIds.has(item.jobId)),
    refundRequests: (state.refundRequests ?? []).filter((item) => jobIds.has(item.jobId)),
    materialOrders,
    materialOrderLines: (state.materialOrderLines ?? []).filter((line) =>
      materialOrderIds.has(line.materialOrderId),
    ),
    events,
    photos,
    photoAuditEvents,
    companyAuditEvents,
    jobFiles,
    estimateFiles,
    invoiceFiles,
    companyFiles: state.companyFiles ?? [],
    photoReports,
    estimateLines: state.estimateLines.filter((line) => estimateIds.has(line.estimateId)),
    estimateSignatureEvents: (state.estimateSignatureEvents ?? []).filter((event) =>
      estimateIds.has(event.estimateId),
    ),
    invoiceLines: state.invoiceLines.filter((line) => invoiceIds.has(line.invoiceId)),
    trainingProgress: state.trainingProgress.filter((item) => staffIds.has(item.staffId)),
    messages: state.messages.filter((message) => {
      if (!message.jobId && !message.opportunityId && !message.contactId) return true;
      if (message.jobId && jobIds.has(message.jobId)) return true;
      if (message.opportunityId && opportunityIds.has(message.opportunityId)) return true;
      if (message.contactId && workContacts.some((contact) => contact.id === message.contactId)) return true;
      return false;
    }),
    gmailMessages: (state.gmailMessages ?? []).filter((message) => {
      if (message.jobId && jobIds.has(message.jobId)) return true;
      if (message.contactId && workContacts.some((contact) => contact.id === message.contactId)) return true;
      if (!message.jobId && !message.contactId) return true;
      return false;
    }),
    returningClientLeads: (state.returningClientLeads ?? []).filter((notice) => {
      if (canLeadCompany(effective.role, effective)) return true;
      if (notice.previousStaffId && notice.previousStaffId === effective.id) return true;
      return notice.openedByStaffId === effective.id;
    }),
    eagleviewOrders: (state.eagleviewOrders ?? []).filter((order) => jobIds.has(order.jobId)),
    automations: state.automations ?? [],
    automationTemplates: state.automationTemplates ?? [],
    automationRuns: (state.automationRuns ?? []).filter((run) => {
      if (canManageAutomations(effective.role, effective)) return true;
      if (!run.jobId) return false;
      return jobIds.has(run.jobId);
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
      return "Accounting — every contact, every job’s books, receipts, and the QuickBooks entry queue.";
    }
    if (effective.role === "director") {
      return "Director — every job and report in the company. The full contact book stays with company admin, business development, and accounting. Business settings and the Accounting Suite stay with a company admin.";
    }
    return "Company admin — every job, contact, and report in the company.";
  }
  if (scope === "bd") {
    return "Business development — every contact in the company, pipeline you sourced, jobs from the agents you brought in, and company BD ROI. Assign the work; estimates, invoices, Paper, insurance, closeout, and training stay with ops.";
  }
  if (scope === "team") {
    return `${team?.name ?? "Your team"} — every job and contact owned by people on this team, except the business development book. Login As a teammate to inspect their book.`;
  }
  return "Your jobs and contact book only. Business development contacts stay with company admin, business development, and accounting.";
}

function scopeCompanyContacts(state: CrmState, effective: StaffMember): CrmState {
  const contacts = contactsSharedWithSeat(
    state.contacts,
    effective,
    state.staff,
    new Set(state.staff.map((member) => member.id)),
    state.opportunities,
    state.jobs,
  );
  const contactIds = new Set(contacts.map((contact) => contact.id));
  const clientIds = new Set<string>();
  for (const job of state.jobs) if (job.clientId) clientIds.add(job.clientId);
  for (const opportunity of state.opportunities) if (opportunity.clientId) clientIds.add(opportunity.clientId);
  for (const contact of contacts) if (contact.clientId) clientIds.add(contact.clientId);
  return {
    ...state,
    contacts,
    clients: withParentClients(state.clients, clientIds),
    messages: state.messages.filter((message) => {
      if (!message.contactId || message.jobId || message.opportunityId) return true;
      return contactIds.has(message.contactId);
    }),
    gmailMessages: (state.gmailMessages ?? []).filter((message) => {
      if (message.jobId || !message.contactId) return true;
      return contactIds.has(message.contactId);
    }),
  };
}

const SEAT_SHORT: Record<SeatRole, string> = {
  company_admin: "company admin",
  director: "director",
  business_development: "business development",
  team_lead: "team lead",
  team_admin: "team administrator",
  project_manager: "project manager",
  estimator: "estimator",
  superintendent: "superintendent",
  accountant: "accounting",
};
