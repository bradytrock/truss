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

export const seedState: CrmState = {
  staff: structuredClone(NORTHLINE_STAFF),
  teams: structuredClone(NORTHLINE_TEAMS),
  clients: extraClients,
  contacts: extraContacts,
  opportunities: extraOpportunities,
  jobs: extraJobs,
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
