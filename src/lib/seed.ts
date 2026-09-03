import { seedCalendarAccounts, seedCalendarShares } from "@/lib/calendar-seed";
import { seedTrainingBulletins, seedTrainingProgress } from "@/lib/training/seed";
import { backfillRecordCodes } from "@/lib/job-code";
import { fillJobRecord, JOB_RECORD_EXTRAS, jobsFromOpenLeads } from "@/lib/job-record";
import { NORTHLINE_STAFF, NORTHLINE_TEAMS, type CrmState } from "@/lib/types";
import { demoOps, NORTHLINE_PRICE_LIST_ID } from "@/lib/demo-ops";
import { extraMessages } from "@/lib/demo-messages";
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
  googleLocations: [],
  clients: extraClients,
  contacts: extraContacts,
  opportunities: stamped.opportunities,
  jobs: allJobs,
  activities: extraActivities,
  tasks: extraTasks,
  priceLists: [
    {
      id: NORTHLINE_PRICE_LIST_ID,
      name: "Price list",
      effectiveOn: "2024-01-15",
      outdatedAt: null,
      createdAt: "2024-01-15T12:00:00.000Z",
    },
  ],
  catalog: demoOps.catalog,
  estimates: demoOps.estimates.map((estimate) => {
    if (estimate.jobId) return estimate;
    const job = allJobs.find((item) => item.opportunityId === estimate.opportunityId);
    return job ? { ...estimate, jobId: job.id } : estimate;
  }),
  estimateLines: demoOps.estimateLines,
  estimateSignatureEvents: [],
  estimateTemplates: [],
  estimateTemplateLines: [],
  invoices: demoOps.invoices,
  invoiceLines: demoOps.invoiceLines,
  payments: demoOps.payments,
  events: demoOps.events,
  photos: demoOps.photos,
  jobFiles: [],
  photoReports: [],
  expenses: demoOps.expenses,
  materialOrders: [],
  materialOrderLines: [],
  materialOrderTemplates: [],
  materialOrderTemplateLines: [],
  qbVendors: [...new Set(demoOps.expenses.map((item) => item.vendor.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((name, index) => ({
      id: `seed-vendor-${index}`,
      listId: `seed-${index}`,
      name,
      isActive: true,
      syncedAt: new Date().toISOString(),
    })),
  qbReviewComments: [],
  calendarAccounts: structuredClone(seedCalendarAccounts),
  calendarShares: structuredClone(seedCalendarShares),
  gmailAccounts: [],
  gmailMessages: [],
  trainingProgress: structuredClone(seedTrainingProgress),
  trainingBulletins: structuredClone(seedTrainingBulletins),
  messages: extraMessages,
  returningClientLeads: [],
};
