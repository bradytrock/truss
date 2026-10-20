import { mapCompanyAuditEvent } from "@/lib/company-audit";
import { jobsFilledFromLeads } from "@/lib/job-record";
import { mapPhotoAuditEvent } from "@/lib/photo-trash";
import { isRowProtected } from "@/lib/supabase/local-writes";
import {
  mapActivity,
  mapAutomation,
  mapAutomationRun,
  mapAutomationTemplate,
  mapCatalogItem,
  mapClient,
  mapCompanyFile,
  mapCompanyProfile,
  mapContact,
  mapEagleviewOrder,
  mapEstimate,
  mapEstimateFile,
  mapEstimateLine,
  mapEstimateSignatureEvent,
  mapEstimateTemplate,
  mapEstimateTemplateLine,
  mapExpense,
  mapForecastedExpense,
  mapGmailAccount,
  mapGmailMessage,
  mapGoogleLocation,
  mapInvoice,
  mapInvoiceFile,
  mapInvoiceLine,
  mapJob,
  mapJobFile,
  mapJobInsurance,
  mapJobPhoto,
  mapMaterialOrder,
  mapMaterialOrderLine,
  mapMaterialOrderTemplate,
  mapMaterialOrderTemplateLine,
  mapMessage,
  mapMessageThreadMember,
  mapMessageThreadOpen,
  mapOpportunity,
  mapPayment,
  mapPhotoReport,
  mapPriceList,
  mapQbReviewComment,
  mapQbVendor,
  mapReturningClientLead,
  mapScheduleEvent,
  mapStaff,
  mapTask,
  mapTeam,
  mapTrainingBulletin,
  mapVendorFeedback,
  mapVendorPrice,
  mapVendorProfile,
} from "@/lib/supabase/mappers";
import type { CrmState } from "@/lib/types";

export type LiveChange = {
  eventType?: string;
  table?: string;
  new?: unknown;
  old?: unknown;
};

type Row = { id: string };

const tables: Record<string, { key: keyof CrmState; map: (row: unknown) => Row }> = {
  clients: { key: "clients", map: (row) => mapClient(row as never) },
  contacts: { key: "contacts", map: (row) => mapContact(row as never) },
  opportunities: { key: "opportunities", map: (row) => mapOpportunity(row as never) },
  jobs: { key: "jobs", map: (row) => mapJob(row as never) },
  activities: { key: "activities", map: (row) => mapActivity(row as never) },
  tasks: { key: "tasks", map: (row) => mapTask(row as never) },
  team_members: { key: "staff", map: (row) => mapStaff(row as never) },
  teams: { key: "teams", map: (row) => mapTeam(row as never) },
  catalog_items: { key: "catalog", map: (row) => mapCatalogItem(row as never) },
  estimates: { key: "estimates", map: (row) => mapEstimate(row as never) },
  estimate_lines: { key: "estimateLines", map: (row) => mapEstimateLine(row as never) },
  estimate_signature_events: {
    key: "estimateSignatureEvents",
    map: (row) => mapEstimateSignatureEvent(row as never),
  },
  estimate_templates: { key: "estimateTemplates", map: (row) => mapEstimateTemplate(row as never) },
  estimate_template_lines: {
    key: "estimateTemplateLines",
    map: (row) => mapEstimateTemplateLine(row as never),
  },
  invoices: { key: "invoices", map: (row) => mapInvoice(row as never) },
  invoice_lines: { key: "invoiceLines", map: (row) => mapInvoiceLine(row as never) },
  payments: { key: "payments", map: (row) => mapPayment(row as never) },
  schedule_events: { key: "events", map: (row) => mapScheduleEvent(row as never) },
  expenses: { key: "expenses", map: (row) => mapExpense(row as never) },
  forecasted_expenses: { key: "forecastedExpenses", map: (row) => mapForecastedExpense(row as never) },
  job_insurance: { key: "jobInsurance", map: (row) => mapJobInsurance(row as never) },
  qb_vendors: { key: "qbVendors", map: (row) => mapQbVendor(row as never) },
  vendor_profiles: { key: "vendorProfiles", map: (row) => mapVendorProfile(row as never) },
  vendor_feedback: { key: "vendorFeedback", map: (row) => mapVendorFeedback(row as never) },
  vendor_prices: { key: "vendorPrices", map: (row) => mapVendorPrice(row as never) },
  qb_review_comments: { key: "qbReviewComments", map: (row) => mapQbReviewComment(row as never) },
  job_photos: { key: "photos", map: (row) => mapJobPhoto(row as never) },
  photo_audit_events: { key: "photoAuditEvents", map: (row) => mapPhotoAuditEvent(row as never) },
  company_audit_events: { key: "companyAuditEvents", map: (row) => mapCompanyAuditEvent(row as never) },
  job_files: { key: "jobFiles", map: (row) => mapJobFile(row as never) },
  estimate_files: { key: "estimateFiles", map: (row) => mapEstimateFile(row as never) },
  invoice_files: { key: "invoiceFiles", map: (row) => mapInvoiceFile(row as never) },
  company_files: { key: "companyFiles", map: (row) => mapCompanyFile(row as never) },
  photo_reports: { key: "photoReports", map: (row) => mapPhotoReport(row as never) },
  training_bulletins: { key: "trainingBulletins", map: (row) => mapTrainingBulletin(row as never) },
  messages: { key: "messages", map: (row) => mapMessage(row as never) },
  profiles: { key: "companyProfiles", map: (row) => mapCompanyProfile(row as never) },
  message_thread_members: { key: "messageThreadMembers", map: (row) => mapMessageThreadMember(row as never) },
  message_thread_opens: { key: "messageThreadOpens", map: (row) => mapMessageThreadOpen(row as never) },
  gmail_accounts: { key: "gmailAccounts", map: (row) => mapGmailAccount(row as never) },
  gmail_messages: { key: "gmailMessages", map: (row) => mapGmailMessage(row as never) },
  returning_client_leads: { key: "returningClientLeads", map: (row) => mapReturningClientLead(row as never) },
  price_lists: { key: "priceLists", map: (row) => mapPriceList(row as never) },
  google_locations: { key: "googleLocations", map: (row) => mapGoogleLocation(row as never) },
  material_orders: { key: "materialOrders", map: (row) => mapMaterialOrder(row as never) },
  material_order_lines: { key: "materialOrderLines", map: (row) => mapMaterialOrderLine(row as never) },
  material_order_templates: {
    key: "materialOrderTemplates",
    map: (row) => mapMaterialOrderTemplate(row as never),
  },
  material_order_template_lines: {
    key: "materialOrderTemplateLines",
    map: (row) => mapMaterialOrderTemplateLine(row as never),
  },
  eagleview_orders: { key: "eagleviewOrders", map: (row) => mapEagleviewOrder(row as never) },
  automations: { key: "automations", map: (row) => mapAutomation(row as never) },
  automation_runs: { key: "automationRuns", map: (row) => mapAutomationRun(row as never) },
  automation_templates: { key: "automationTemplates", map: (row) => mapAutomationTemplate(row as never) },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function rowId(value: Record<string, unknown> | null) {
  return typeof value?.id === "string" ? value.id : "";
}

function companyIdOf(value: Record<string, unknown> | null) {
  return typeof value?.company_id === "string" ? value.company_id : "";
}

function belongs(row: Record<string, unknown> | null, companyId: string) {
  const owner = companyIdOf(row);
  return !owner || owner === companyId;
}

function upsert(list: Row[], row: Row) {
  const index = list.findIndex((item) => item.id === row.id);
  if (index === -1) return [...list, row];
  if (list[index] === row) return list;
  const next = list.slice();
  next[index] = row;
  return next;
}

function remove(list: Row[], id: string) {
  if (!list.some((item) => item.id === id)) return list;
  return list.filter((item) => item.id !== id);
}

/** Patch one realtime row into the open book. Unknown tables are left for the next full load. */
export function applyLiveChange(state: CrmState, change: LiveChange, companyId: string): CrmState {
  const spec = change.table ? tables[change.table] : undefined;
  if (!spec || !companyId) return state;
  const list = state[spec.key];
  if (!Array.isArray(list)) return state;
  const event = (change.eventType ?? "UPDATE").toUpperCase();
  if (event === "DELETE") {
    const oldRow = asRecord(change.old);
    const id = rowId(oldRow);
    if (!id || isRowProtected(id) || !belongs(oldRow, companyId)) return state;
    const nextList = remove(list as Row[], id);
    if (nextList === list) return state;
    return { ...state, [spec.key]: nextList };
  }
  const incoming = asRecord(change.new);
  const id = rowId(incoming);
  if (!incoming || !id || isRowProtected(id) || !belongs(incoming, companyId)) return state;
  if (Object.keys(incoming).length < 2) return state;
  let mapped: Row;
  try {
    mapped = spec.map(incoming);
  } catch {
    return state;
  }
  if (!mapped?.id) return state;
  const nextList = upsert(list as Row[], mapped);
  if (nextList === list) return state;
  return { ...state, [spec.key]: nextList };
}

/** Apply a burst of realtime rows. Job rows are filled from their lead afterwards. */
export function applyLiveChanges(state: CrmState, changes: readonly LiveChange[], companyId: string): CrmState {
  let next = state;
  let fillJobs = false;
  for (const change of changes) {
    if (change.table === "jobs" || change.table === "opportunities") fillJobs = true;
    const updated = applyLiveChange(next, change, companyId);
    if (updated !== next) next = updated;
  }
  if (!fillJobs || next === state) return next;
  return { ...next, jobs: jobsFilledFromLeads(next.jobs, next.opportunities) };
}

/** Company profile row from a realtime event for this company, when it should replace local settings. */
export function liveCompanyRecord(change: LiveChange, companyId: string) {
  if (change.table !== "companies" || (change.eventType ?? "").toUpperCase() === "DELETE") return null;
  const row = asRecord(change.new);
  const id = rowId(row);
  if (!row || !id || id !== companyId || isRowProtected(id)) return null;
  if (typeof row.name !== "string") return null;
  return row;
}
