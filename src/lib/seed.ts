import { backfillRecordCodes } from "@/lib/job-code";
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
  extraOpportunities.map((opportunity) => ({ ...opportunity, code: "" })),
  extraJobs.map((job) => ({ ...job, code: "" })),
  NORTHLINE_STAFF,
);

export const seedState: CrmState = {
  staff: structuredClone(NORTHLINE_STAFF),
  teams: structuredClone(NORTHLINE_TEAMS),
  clients: extraClients,
  contacts: extraContacts,
  opportunities: stamped.opportunities,
  jobs: stamped.jobs,
  activities: extraActivities,
  tasks: extraTasks,
  catalog: demoOps.catalog,
  estimates: demoOps.estimates,
  estimateLines: demoOps.estimateLines,
  invoices: demoOps.invoices,
  invoiceLines: demoOps.invoiceLines,
  payments: demoOps.payments,
  events: demoOps.events,
  photos: demoOps.photos,
};
