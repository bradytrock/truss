import type { Contact, CrmState, Expense, Job, Opportunity, SeatRole, StaffMember } from "@/lib/types";
import { yearOf } from "@/lib/reports";
import { paymentsForJob } from "@/lib/job-financials";
import { opportunityWonAt } from "@/lib/won";

export function isBusinessDevelopment(role: SeatRole | undefined) {
  return role === "business_development";
}

export function hasBusinessDevelopmentSeat(
  member?: Pick<StaffMember, "role" | "title"> | null,
  extraRole?: SeatRole,
) {
  if (isBusinessDevelopment(member?.role) || isBusinessDevelopment(extraRole)) return true;
  const title = member?.title?.trim().toLowerCase() ?? "";
  return title.includes("business development") || title.includes("business-development");
}

export function originatorStaffId(opportunity: Pick<Opportunity, "originatorStaffId" | "ownerStaffId">) {
  return opportunity.originatorStaffId || opportunity.ownerStaffId;
}

export function referralPartnerIds(contacts: Contact[], staffId: string) {
  return new Set(
    contacts
      .filter((contact) => contact.isReferralPartner && contact.ownerStaffId === staffId)
      .map((contact) => contact.id),
  );
}

export function opportunityInBdBook(
  opportunity: Opportunity,
  viewer: StaffMember,
  partnerIds: Set<string>,
) {
  if (originatorStaffId(opportunity) === viewer.id) return true;
  if (opportunity.ownerStaffId === viewer.id) return true;
  if (opportunity.referralContactId && partnerIds.has(opportunity.referralContactId)) return true;
  return false;
}

export function bdOpportunityIds(state: CrmState, viewer: StaffMember) {
  const partners = referralPartnerIds(state.contacts, viewer.id);
  return new Set(
    state.opportunities
      .filter((opportunity) => opportunityInBdBook(opportunity, viewer, partners))
      .map((opportunity) => opportunity.id),
  );
}

export function jobInBdBook(job: Job, opportunityIds: Set<string>, opportunities: Opportunity[]) {
  if (job.opportunityId && opportunityIds.has(job.opportunityId)) return true;
  const lead = opportunities.find((opportunity) => opportunity.id === job.opportunityId);
  return Boolean(lead && opportunityIds.has(lead.id));
}

export type BdPersonStats = {
  staff: StaffMember;
  leads: number;
  openLeads: number;
  openValue: number;
  won: number;
  wonValue: number;
  lost: number;
  cash: number;
  spend: number;
  agents: number;
};

export type BdRoiReport = {
  year: number;
  people: BdPersonStats[];
  company: Omit<BdPersonStats, "staff">;
  companyCash: number;
  bdShare: number;
};

function isOpenLead(
  opportunity: Opportunity,
  estimates: CrmState["estimates"],
  jobs: Job[],
) {
  if (opportunity.stage === "lost") return false;
  return !opportunityWonAt(opportunity, estimates, jobs);
}

function cashForJobs(jobs: Job[], state: CrmState, year: number) {
  let total = 0;
  for (const job of jobs) {
    for (const payment of paymentsForJob(job.id, state.payments, state.invoices)) {
      if (yearOf(payment.paidAt) === year) total += payment.amount;
    }
  }
  return total;
}

function bdSpend(expenses: Expense[], personName: string, year: number) {
  return expenses
    .filter((expense) => expense.createdBy === personName && expense.account === "office")
    .filter((expense) => yearOf(expense.incurredAt) === year)
    .reduce((sum, expense) => sum + expense.amount, 0);
}

function jobsForOriginator(state: CrmState, staffId: string) {
  const oppIds = new Set(
    state.opportunities.filter((opportunity) => originatorStaffId(opportunity) === staffId).map((item) => item.id),
  );
  return state.jobs.filter((job) => job.opportunityId && oppIds.has(job.opportunityId));
}

export function statsForOriginator(
  state: CrmState,
  staff: StaffMember,
  year: number,
): BdPersonStats {
  const leads = state.opportunities.filter((opportunity) => originatorStaffId(opportunity) === staff.id);
  const open = leads.filter((opportunity) => isOpenLead(opportunity, state.estimates, state.jobs));
  const won = leads.filter((opportunity) => {
    const wonAt = opportunityWonAt(opportunity, state.estimates, state.jobs);
    return Boolean(wonAt && yearOf(wonAt) === year);
  });
  const jobs = jobsForOriginator(state, staff.id);
  return {
    staff,
    leads: leads.length,
    openLeads: open.length,
    openValue: open.reduce((sum, opportunity) => sum + opportunity.value, 0),
    won: won.length,
    wonValue: won.reduce((sum, opportunity) => {
      const job = jobs.find((item) => item.opportunityId === opportunity.id);
      return sum + (job?.contractValue ?? opportunity.value);
    }, 0),
    lost: leads.filter((opportunity) => opportunity.stage === "lost").length,
    cash: cashForJobs(jobs, state, year),
    spend: bdSpend(state.expenses, staff.name, year),
    agents: state.contacts.filter((contact) => contact.isReferralPartner && contact.ownerStaffId === staff.id)
      .length,
  };
}

function emptyTotals(): Omit<BdPersonStats, "staff"> {
  return {
    leads: 0,
    openLeads: 0,
    openValue: 0,
    won: 0,
    wonValue: 0,
    lost: 0,
    cash: 0,
    spend: 0,
    agents: 0,
  };
}

export function roiMultiple(cash: number, spend: number) {
  if (spend <= 0) return null;
  return cash / spend;
}

export function buildBdRoi(state: CrmState, now = new Date()): BdRoiReport {
  const year = now.getFullYear();
  const developers = state.staff.filter((member) => member.role === "business_development");
  const people = developers.map((staff) => statsForOriginator(state, staff, year));
  const company = people.reduce((sum, row) => {
    sum.leads += row.leads;
    sum.openLeads += row.openLeads;
    sum.openValue += row.openValue;
    sum.won += row.won;
    sum.wonValue += row.wonValue;
    sum.lost += row.lost;
    sum.cash += row.cash;
    sum.spend += row.spend;
    sum.agents += row.agents;
    return sum;
  }, emptyTotals());
  const companyCash = state.payments
    .filter((payment) => yearOf(payment.paidAt) === year)
    .reduce((sum, payment) => sum + payment.amount, 0);
  return {
    year,
    people,
    company,
    companyCash,
    bdShare: companyCash > 0 ? company.cash / companyCash : 0,
  };
}
