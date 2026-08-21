import { seedCalendarAccounts, seedCalendarShares } from "@/lib/calendar-seed";
import { seedTrainingBulletins, seedTrainingProgress } from "@/lib/training/seed";
import { backfillRecordCodes } from "@/lib/job-code";
import { fillJobRecord, JOB_RECORD_EXTRAS, jobsFromOpenLeads } from "@/lib/job-record";
import { NORTHLINE_STAFF, NORTHLINE_TEAMS, type CrmState } from "@/lib/types";
import { demoOps } from "@/lib/demo-ops";
import {
  extraActivities,
  extraClients,
  extraContacts,
  extraJobs,
  extraOpportunities,
  extraTasks,
} from "@/lib/northline-extra";

const stamped = backfillRecordCodes(
  extraOpportunities.map((opportunity) => ({
    ...opportunity,
    code: "",
    originatorStaffId: opportunity.originatorStaffId || opportunity.ownerStaffId,
  })),
  extraJobs.map((job) => ({ ...job, code: "" })),
  NORTHLINE_STAFF,
);

const jobs = stamped.jobs.map((job) => {
  const opportunity = stamped.opportunities.find((item) => item.id === job.opportunityId);
  return fillJobRecord({ ...job, ...JOB_RECORD_EXTRAS[job.id] }, opportunity);
});
const allJobs = [...jobs, ...jobsFromOpenLeads(stamped.opportunities, jobs)];

export const seedState: CrmState = {
  staff: structuredClone(NORTHLINE_STAFF),
  teams: structuredClone(NORTHLINE_TEAMS),
  clients: extraClients,
  contacts: extraContacts,
  opportunities: stamped.opportunities,
  jobs: allJobs,
  activities: extraActivities,
  tasks: extraTasks,
  catalog: demoOps.catalog,
  estimates: demoOps.estimates.map((estimate) => {
    if (estimate.jobId) return estimate;
    const job = allJobs.find((item) => item.opportunityId === estimate.opportunityId);
    return job ? { ...estimate, jobId: job.id } : estimate;
  }),
  estimateLines: demoOps.estimateLines,
  estimateTemplates: [],
  estimateTemplateLines: [],
  invoices: demoOps.invoices,
  invoiceLines: demoOps.invoiceLines,
  payments: demoOps.payments,
  events: demoOps.events,
  photos: demoOps.photos,
  photoReports: [],
  expenses: demoOps.expenses,
  calendarAccounts: structuredClone(seedCalendarAccounts),
  calendarShares: structuredClone(seedCalendarShares),
  trainingProgress: structuredClone(seedTrainingProgress),
  trainingBulletins: structuredClone(seedTrainingBulletins),
};
