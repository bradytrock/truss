import type { CrmState, StaffMember } from "@/lib/types";
import { accessScope, teamMemberIds } from "@/lib/visibility";

const OPEN_JOB_STATUSES = new Set(["precon", "in_progress", "punch"]);

export function yearOf(value: string | null | undefined) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

export function buildReports(state: CrmState, viewer: StaffMember, now = new Date()) {
  const year = now.getFullYear();
  const scope = accessScope(viewer.role, viewer.restricted);
  const staffIds =
    scope === "team" ? teamMemberIds(viewer.teamId, state.staff) : new Set(state.staff.map((s) => s.id));
  const names = new Set(
    state.staff.filter((member) => staffIds.has(member.id)).map((member) => member.name)
  );

  const jobs =
    scope === "team"
      ? state.jobs.filter(
          (job) =>
            staffIds.has(job.ownerStaffId) ||
            names.has(job.projectManager) ||
            names.has(job.superintendent)
        )
      : state.jobs;

  const openJobs = jobs.filter((job) => OPEN_JOB_STATUSES.has(job.status) && !job.deletedAt);
  const closedYtd = jobs.filter((job) => {
    if (job.status !== "complete") return false;
    const closedYear = yearOf(job.substantialCompletion) ?? yearOf(job.startDate);
    return closedYear === year;
  });

  const ytdRevenue = state.payments
    .filter((payment) => yearOf(payment.paidAt) === year)
    .filter((payment) => {
      if (scope !== "team") return true;
      if (!payment.invoiceId) return false;
      const invoice = state.invoices.find((item) => item.id === payment.invoiceId);
      if (!invoice?.jobId) return false;
      return jobs.some((job) => job.id === invoice.jobId);
    })
    .reduce((sum, payment) => sum + payment.amount, 0);

  const projectManagers = state.staff.filter((member) => {
    if (member.role !== "project_manager") return false;
    if (scope === "team") return staffIds.has(member.id);
    return true;
  });
  const referralByPm = projectManagers.map((pm) => {
    const book = state.contacts.filter((contact) => contact.ownerStaffId === pm.id);
    return {
      staff: pm,
      contacts: book.length,
      referralPartners: book.filter((contact) => contact.isReferralPartner).length,
    };
  });

  const teamStaff = state.staff.filter((member) => staffIds.has(member.id));
  const activity = state.activities
    .filter((item) => names.has(item.author))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    year,
    scope,
    openJobs,
    closedYtd,
    ytdRevenue,
    referralByPm,
    teamStaff,
    activity,
    jobs,
  };
}
