import { mapPhotoAuditEvent } from "@/lib/photo-trash";
import { mapCompanyAuditEvent } from "@/lib/company-audit";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapActivity,
  mapCalendarAccount,
  mapCalendarShare,
  mapCatalogItem,
  mapClient,
  mapContact,
  mapEstimate,
  mapEstimateLine,
  mapEstimateSignatureEvent,
  mapEstimateTemplate,
  mapEstimateTemplateLine,
  mapInvoice,
  mapInvoiceLine,
  mapJob,
  mapJobPhoto,
  mapJobFile,
  mapEstimateFile,
  mapInvoiceFile,
  mapCompanyFile,
  mapPhotoReport,
  mapOpportunity,
  mapPayment,
  mapExpense,
  mapForecastedExpense,
  mapJobInsurance,
  mapQbVendor,
  mapVendorFeedback,
  mapVendorPrice,
  mapVendorProfile,
  mapQbReviewComment,
  mapScheduleEvent,
  mapStaff,
  mapTask,
  mapGoogleLocation,
  mapTeam,
  mapTrainingBulletin,
  mapTrainingProgress,
  mapMessage,
  mapCompanyProfile,
  mapMessageThreadMember,
  mapMessageThreadOpen,
  mapGmailAccount,
  mapGmailMessage,
  mapReturningClientLead,
  mapMaterialOrder,
  mapMaterialOrderLine,
  mapMaterialOrderTemplate,
  mapMaterialOrderTemplateLine,
  mapPriceList,
  mapEagleviewOrder,
  mapAutomation,
  mapAutomationRun,
  mapAutomationTemplate,
} from "@/lib/supabase/mappers";
import type { Database } from "@/lib/supabase/database.types";
import { initialsFromName, type CrmState, type SeatRole } from "@/lib/types";
import { jobFilesFromJobs, mergeJobFiles } from "@/lib/job-files";
import { jobsFilledFromLeads } from "@/lib/job-record";
import { overlayById, replaceIfEmpty } from "@/lib/supabase/book-merge";

type Client = SupabaseClient<Database>;

function inferRole(title: string): SeatRole {
  const lower = title.toLowerCase();
  if (lower.includes("admin") && lower.includes("team")) return "team_admin";
  if (lower.includes("lead")) return "team_lead";
  if (lower.includes("business")) return "business_development";
  if (lower.includes("super")) return "superintendent";
  if (lower.includes("estimat")) return "estimator";
  if (lower.includes("account") || lower.includes("controller") || lower.includes("bookkeep") || lower.includes("cpa")) {
    return "accountant";
  }
  if (lower.includes("admin")) return "company_admin";
  return "project_manager";
}

function requireTable(
  table: string,
  result: { error?: { message?: string } | null },
) {
  if (result.error) throw new Error(`${table}: ${result.error.message || "query failed"}`);
}

function mapRows<T, R>(rows: T[] | null | undefined, map: (row: T) => R): R[] {
  return (rows ?? []).flatMap((row) => {
    try {
      return [map(row)];
    } catch {
      return [];
    }
  });
}

export type CompanyBook = {
  state: CrmState;
  team: string[];
  /** Set when the messages read failed. An empty list is not the same as no texts. */
  messagesError: string | null;
};

export const TEXTS_UNAVAILABLE = "Texts could not load. Check the connection and try again.";

/** PostgREST and the browser both surface a dropped pool connection this way. */
export function isTransientRequestError(
  error: { message?: string; code?: string } | null | undefined,
) {
  if (!error) return false;
  if (error.code === "PGRST003" || error.code === "57014") return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("fetcherror") ||
    message.includes("network") ||
    message.includes("connection pool") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

const BOOK_QUERY_WIDTH = 4;
let bookQueriesActive = 0;
const bookQueryWaiters: Array<() => void> = [];

/** Keep the company book from opening every table at once. That exhausts the pool. */
export function limitBookQuery<T>(run: () => PromiseLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      bookQueriesActive += 1;
      Promise.resolve()
        .then(run)
        .then(resolve, reject)
        .finally(() => {
          bookQueriesActive -= 1;
          bookQueryWaiters.shift()?.();
        });
    };
    if (bookQueriesActive < BOOK_QUERY_WIDTH) start();
    else bookQueryWaiters.push(start);
  });
}

const DEFERRED_ID_KEYS = [
  "googleLocations",
  "estimateSignatureEvents",
  "estimateTemplates",
  "estimateTemplateLines",
  "photos",
  "photoAuditEvents",
  "companyAuditEvents",
  "forecastedExpenses",
  "jobInsurance",
  "qbVendors",
  "vendorProfiles",
  "vendorFeedback",
  "vendorPrices",
  "qbReviewComments",
  "jobFiles",
  "estimateFiles",
  "invoiceFiles",
  "companyFiles",
  "photoReports",
  "trainingBulletins",
  "messages",
  "companyProfiles",
  "messageThreadMembers",
  "messageThreadOpens",
  "gmailAccounts",
  "gmailMessages",
  "materialOrders",
  "materialOrderLines",
  "materialOrderTemplates",
  "materialOrderTemplateLines",
  "eagleviewOrders",
  "automations",
  "automationRuns",
  "automationTemplates",
] as const satisfies readonly (keyof CrmState)[];

/** Merge photos, mail, files, and the rest onto a book that already painted. */
export function applyDeferredBook(current: CrmState, incoming: CrmState): CrmState {
  const next: CrmState = { ...current };
  const target = next as Record<(typeof DEFERRED_ID_KEYS)[number], { id: string }[]>;
  const local = current as Record<(typeof DEFERRED_ID_KEYS)[number], { id: string }[]>;
  const remote = incoming as Record<(typeof DEFERRED_ID_KEYS)[number], { id: string }[]>;
  for (const key of DEFERRED_ID_KEYS) {
    target[key] = overlayById(local[key], remote[key]);
  }
  next.calendarAccounts = replaceIfEmpty(current.calendarAccounts, incoming.calendarAccounts);
  next.calendarShares = replaceIfEmpty(current.calendarShares, incoming.calendarShares);
  next.trainingProgress = replaceIfEmpty(current.trainingProgress, incoming.trainingProgress);
  return next;
}

function messageQuery(supabase: Client, companyId: string) {
  return supabase
    .from("messages")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
}

async function loadMessages(supabase: Client, companyId: string) {
  let last = await limitBookQuery(() => messageQuery(supabase, companyId));
  for (let attempt = 1; attempt < 3 && last.error && isTransientRequestError(last.error); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    last = await limitBookQuery(() => messageQuery(supabase, companyId));
  }
  return last;
}

function queryCore(supabase: Client, companyId: string) {
  return Promise.all([
    limitBookQuery(() => supabase.from("clients").select("*").eq("company_id", companyId).order("name")),
    limitBookQuery(() => supabase.from("contacts").select("*").eq("company_id", companyId).order("name")),
    limitBookQuery(() =>
      supabase
        .from("opportunities")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase.from("jobs").select("*").eq("company_id", companyId).order("start_date", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase
        .from("activities")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ),
    limitBookQuery(() => supabase.from("tasks").select("*").eq("company_id", companyId).order("due_at")),
    limitBookQuery(() => supabase.from("team_members").select("*").eq("company_id", companyId).order("name")),
    limitBookQuery(() => supabase.from("teams").select("*").eq("company_id", companyId).order("name")),
    limitBookQuery(() => supabase.from("catalog_items").select("*").eq("company_id", companyId).order("cost_code")),
    limitBookQuery(() =>
      supabase.from("estimates").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    ),
    limitBookQuery(() => supabase.from("estimate_lines").select("*").eq("company_id", companyId).order("sort_order")),
    limitBookQuery(() =>
      supabase.from("invoices").select("*").eq("company_id", companyId).order("issued_at", { ascending: false }),
    ),
    limitBookQuery(() => supabase.from("invoice_lines").select("*").eq("company_id", companyId).order("sort_order")),
    limitBookQuery(() =>
      supabase.from("payments").select("*").eq("company_id", companyId).order("paid_at", { ascending: false }),
    ),
    limitBookQuery(() => supabase.from("schedule_events").select("*").eq("company_id", companyId).order("starts_at")),
    limitBookQuery(() =>
      supabase.from("expenses").select("*").eq("company_id", companyId).order("incurred_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase
        .from("returning_client_leads")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase.from("price_lists").select("*").eq("company_id", companyId).order("effective_on", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase.from("account_invites").select("staff_id, token, expires_at").eq("company_id", companyId),
    ),
  ]);
}

function queryDeferred(
  supabase: Client,
  companyId: string,
  messagesPromise: ReturnType<typeof loadMessages>,
) {
  return Promise.all([
    limitBookQuery(() => supabase.from("google_locations").select("*").eq("company_id", companyId).order("name")),
    limitBookQuery(() =>
      supabase
        .from("estimate_signature_events")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ),
    limitBookQuery(() => supabase.from("estimate_templates").select("*").eq("company_id", companyId).order("name")),
    limitBookQuery(() =>
      supabase.from("estimate_template_lines").select("*").eq("company_id", companyId).order("sort_order"),
    ),
    limitBookQuery(() =>
      supabase.from("job_photos").select("*").eq("company_id", companyId).order("taken_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase
        .from("photo_audit_events")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(2000),
    ),
    limitBookQuery(() =>
      supabase
        .from("company_audit_events")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(2000),
    ),
    limitBookQuery(() =>
      supabase
        .from("forecasted_expenses")
        .select("*")
        .eq("company_id", companyId)
        .order("expected_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase.from("job_insurance").select("*").eq("company_id", companyId).order("updated_at", { ascending: false }),
    ),
    limitBookQuery(() => supabase.from("qb_vendors").select("*").eq("company_id", companyId).order("name")),
    limitBookQuery(() => supabase.from("vendor_profiles").select("*").eq("company_id", companyId).order("name")),
    limitBookQuery(() =>
      supabase
        .from("vendor_feedback")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ),
    limitBookQuery(() => supabase.from("vendor_prices").select("*").eq("company_id", companyId).order("sort_order")),
    limitBookQuery(() =>
      supabase.from("qb_review_comments").select("*").eq("company_id", companyId).order("created_at"),
    ),
    limitBookQuery(() => supabase.from("calendar_accounts").select("*").eq("company_id", companyId)),
    limitBookQuery(() => supabase.from("calendar_shares").select("*").eq("company_id", companyId)),
    limitBookQuery(() => supabase.from("training_progress").select("*").eq("company_id", companyId)),
    limitBookQuery(() =>
      supabase.from("training_bulletins").select("*").eq("company_id", companyId).order("created_at", {
        ascending: false,
      }),
    ),
    limitBookQuery(() =>
      supabase.from("photo_reports").select("*").eq("company_id", companyId).order("updated_at", {
        ascending: false,
      }),
    ),
    messagesPromise,
    limitBookQuery(() => supabase.from("profiles").select("*").eq("company_id", companyId).order("full_name")),
    limitBookQuery(() => supabase.from("message_thread_members").select("*").eq("company_id", companyId)),
    limitBookQuery(() => supabase.from("message_thread_opens").select("*").eq("company_id", companyId)),
    limitBookQuery(() => supabase.from("gmail_accounts").select("*").eq("company_id", companyId)),
    limitBookQuery(() =>
      supabase
        .from("gmail_messages")
        .select("*")
        .eq("company_id", companyId)
        .order("received_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase.from("job_files").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase.from("estimate_files").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase.from("invoice_files").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase.from("company_files").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase.from("material_orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase.from("material_order_lines").select("*").eq("company_id", companyId).order("sort_order"),
    ),
    limitBookQuery(() =>
      supabase.from("material_order_templates").select("*").eq("company_id", companyId).order("name"),
    ),
    limitBookQuery(() =>
      supabase.from("material_order_template_lines").select("*").eq("company_id", companyId).order("sort_order"),
    ),
    limitBookQuery(() =>
      supabase
        .from("eagleview_orders")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase.from("automations").select("*").eq("company_id", companyId).order("updated_at", { ascending: false }),
    ),
    limitBookQuery(() =>
      supabase
        .from("automation_runs")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500),
    ),
    limitBookQuery(() => supabase.from("automation_templates").select("*").order("sort_order")),
  ]);
}

type CoreRows = Awaited<ReturnType<typeof queryCore>>;
type DeferredRows = Awaited<ReturnType<typeof queryDeferred>>;

function emptyDeferred(): DeferredRows {
  const blank = { data: [] as never[], error: null };
  return Array.from({ length: 37 }, () => blank) as unknown as DeferredRows;
}

function assembleBook(core: CoreRows, deferred: DeferredRows): CompanyBook {
  const [
    clientsRes,
    contactsRes,
    oppsRes,
    jobsRes,
    activitiesRes,
    tasksRes,
    teamRes,
    teamsRes,
    catalogRes,
    estimatesRes,
    estimateLinesRes,
    invoicesRes,
    invoiceLinesRes,
    paymentsRes,
    eventsRes,
    expensesRes,
    returningClientLeadsRes,
    priceListsRes,
    invitesRes,
  ] = core;
  const [
    googleLocationsRes,
    estimateSignatureEventsRes,
    estimateTemplatesRes,
    estimateTemplateLinesRes,
    photosRes,
    photoAuditRes,
    companyAuditRes,
    forecastedExpensesRes,
    jobInsuranceRes,
    qbVendorsRes,
    vendorProfilesRes,
    vendorFeedbackRes,
    vendorPricesRes,
    qbReviewCommentsRes,
    calendarAccountsRes,
    calendarSharesRes,
    trainingProgressRes,
    trainingBulletinsRes,
    photoReportsRes,
    messagesRes,
    profilesRes,
    threadMembersRes,
    threadOpensRes,
    gmailAccountsRes,
    gmailMessagesRes,
    jobFilesRes,
    estimateFilesRes,
    invoiceFilesRes,
    companyFilesRes,
    materialOrdersRes,
    materialOrderLinesRes,
    materialOrderTemplatesRes,
    materialOrderTemplateLinesRes,
    eagleviewOrdersRes,
    automationsRes,
    automationRunsRes,
    automationTemplatesRes,
  ] = deferred;
  const missingTeams = Boolean(teamsRes.error);
  requireTable("clients", clientsRes);
  requireTable("contacts", contactsRes);
  requireTable("opportunities", oppsRes);
  requireTable("jobs", jobsRes);
  requireTable("team_members", teamRes);

  const staff = (teamRes.data ?? []).map((row) => {
    try {
      return mapStaff(row);
    } catch {
      return {
        id: row.id,
        name: row.name,
        title: row.title,
        role: inferRole(row.title),
        teamId: row.team_id ?? null,
        initials: initialsFromName(row.name),
        email: "",
        phone: "",
        cardSlug: "card_slug" in row ? String(row.card_slug ?? "") : "",
        emailSignature: "",
        locked: false,
        restricted: false,
        inviteExpiresAt: null,
        inviteToken: null,
      };
    }
  });

  const invites = invitesRes.error ? [] : (invitesRes.data ?? []);
  const staffWithInvites = staff.map((member) => {
    const invite = invites.find((row) => row.staff_id === member.id);
    if (!invite) return member;
    return {
      ...member,
      inviteToken: invite.token,
      inviteExpiresAt: invite.expires_at,
    };
  });

  const teams = missingTeams ? [] : (teamsRes.data ?? []).map(mapTeam);
  const googleLocations = googleLocationsRes.error
    ? []
    : (googleLocationsRes.data ?? []).map(mapGoogleLocation);
  const opportunities = mapRows(oppsRes.data, mapOpportunity);
  const jobs = jobsFilledFromLeads(mapRows(jobsRes.data, mapJob), opportunities);

  const state: CrmState = {
    staff: staffWithInvites,
    teams: teams.length > 0 ? teams : [],
    googleLocations,
    clients: mapRows(clientsRes.data, mapClient),
    contacts: mapRows(contactsRes.data, mapContact),
    opportunities,
    jobs,
    activities: activitiesRes.error ? [] : mapRows(activitiesRes.data, mapActivity),
    tasks: tasksRes.error ? [] : mapRows(tasksRes.data, mapTask),
    catalog: catalogRes.error ? [] : mapRows(catalogRes.data, mapCatalogItem),
    priceLists: priceListsRes.error ? [] : (priceListsRes.data ?? []).map(mapPriceList),
    estimates: estimatesRes.error ? [] : mapRows(estimatesRes.data, mapEstimate),
    estimateLines: estimateLinesRes.error ? [] : mapRows(estimateLinesRes.data, mapEstimateLine),
    estimateSignatureEvents: estimateSignatureEventsRes.error
      ? []
      : (estimateSignatureEventsRes.data ?? []).map(mapEstimateSignatureEvent),
    estimateTemplates: estimateTemplatesRes.error ? [] : (estimateTemplatesRes.data ?? []).map(mapEstimateTemplate),
    estimateTemplateLines: estimateTemplateLinesRes.error
      ? []
      : (estimateTemplateLinesRes.data ?? []).map(mapEstimateTemplateLine),
    invoices: invoicesRes.error ? [] : mapRows(invoicesRes.data, mapInvoice),
    invoiceLines: invoiceLinesRes.error ? [] : mapRows(invoiceLinesRes.data, mapInvoiceLine),
    payments: paymentsRes.error ? [] : mapRows(paymentsRes.data, mapPayment),
    expenses: expensesRes.error ? [] : (expensesRes.data ?? []).map(mapExpense),
    forecastedExpenses: forecastedExpensesRes.error
      ? []
      : (forecastedExpensesRes.data ?? []).map(mapForecastedExpense),
    jobInsurance: jobInsuranceRes.error ? [] : (jobInsuranceRes.data ?? []).map(mapJobInsurance),
    qbVendors: qbVendorsRes.error ? [] : (qbVendorsRes.data ?? []).map(mapQbVendor),
    vendorProfiles: vendorProfilesRes.error ? [] : (vendorProfilesRes.data ?? []).map(mapVendorProfile),
    vendorFeedback: vendorFeedbackRes.error ? [] : (vendorFeedbackRes.data ?? []).map(mapVendorFeedback),
    vendorPrices: vendorPricesRes.error ? [] : (vendorPricesRes.data ?? []).map(mapVendorPrice),
    qbReviewComments: qbReviewCommentsRes.error
      ? []
      : (qbReviewCommentsRes.data ?? []).map(mapQbReviewComment),
    events: eventsRes.error ? [] : mapRows(eventsRes.data, mapScheduleEvent),
    photos: photosRes.error ? [] : mapRows(photosRes.data, mapJobPhoto),
    photoAuditEvents: photoAuditRes.error
      ? []
      : (photoAuditRes.data ?? []).map(mapPhotoAuditEvent),
    companyAuditEvents: companyAuditRes.error
      ? []
      : (companyAuditRes.data ?? []).map(mapCompanyAuditEvent),
    jobFiles: mergeJobFiles(
      jobFilesRes.error ? [] : (jobFilesRes.data ?? []).map(mapJobFile),
      jobFilesFromJobs(jobs),
    ),
    estimateFiles: estimateFilesRes.error
      ? []
      : (estimateFilesRes.data ?? []).map(mapEstimateFile),
    invoiceFiles: invoiceFilesRes.error
      ? []
      : (invoiceFilesRes.data ?? []).map(mapInvoiceFile),
    companyFiles: companyFilesRes.error ? [] : mapRows(companyFilesRes.data, mapCompanyFile),
    photoReports: photoReportsRes.error ? [] : (photoReportsRes.data ?? []).map(mapPhotoReport),
    calendarAccounts: calendarAccountsRes.error
      ? []
      : (calendarAccountsRes.data ?? []).map(mapCalendarAccount),
    calendarShares: calendarSharesRes.error
      ? []
      : mapRows(calendarSharesRes.data, mapCalendarShare),
    trainingProgress: trainingProgressRes.error
      ? []
      : (trainingProgressRes.data ?? []).map(mapTrainingProgress),
    trainingBulletins: trainingBulletinsRes.error
      ? []
      : (trainingBulletinsRes.data ?? []).map(mapTrainingBulletin),
    messages: messagesRes.error ? [] : mapRows(messagesRes.data, mapMessage),
    companyProfiles: profilesRes.error ? [] : (profilesRes.data ?? []).map(mapCompanyProfile),
    messageThreadMembers: threadMembersRes.error
      ? []
      : (threadMembersRes.data ?? []).map(mapMessageThreadMember),
    messageThreadOpens: threadOpensRes.error
      ? []
      : (threadOpensRes.data ?? []).map(mapMessageThreadOpen),
    gmailAccounts: gmailAccountsRes.error ? [] : (gmailAccountsRes.data ?? []).map(mapGmailAccount),
    gmailMessages: gmailMessagesRes.error ? [] : (gmailMessagesRes.data ?? []).map(mapGmailMessage),
    returningClientLeads: returningClientLeadsRes.error
      ? []
      : (returningClientLeadsRes.data ?? []).flatMap((row) => {
          try {
            return [mapReturningClientLead(row)];
          } catch {
            return [];
          }
        }),
    materialOrders: materialOrdersRes.error ? [] : (materialOrdersRes.data ?? []).map(mapMaterialOrder),
    materialOrderLines: materialOrderLinesRes.error
      ? []
      : (materialOrderLinesRes.data ?? []).map(mapMaterialOrderLine),
    materialOrderTemplates: materialOrderTemplatesRes.error
      ? []
      : (materialOrderTemplatesRes.data ?? []).map(mapMaterialOrderTemplate),
    materialOrderTemplateLines: materialOrderTemplateLinesRes.error
      ? []
      : (materialOrderTemplateLinesRes.data ?? []).map(mapMaterialOrderTemplateLine),
    eagleviewOrders: eagleviewOrdersRes.error
      ? []
      : mapRows(eagleviewOrdersRes.data, mapEagleviewOrder),
    automations: automationsRes.error ? [] : mapRows(automationsRes.data, mapAutomation),
    automationRuns: automationRunsRes.error ? [] : mapRows(automationRunsRes.data, mapAutomationRun),
    automationTemplates: automationTemplatesRes.error
      ? []
      : mapRows(automationTemplatesRes.data, mapAutomationTemplate),
  };

  return {
    state,
    team: state.staff.map((member) => member.name),
    messagesError: messagesRes.error ? TEXTS_UNAVAILABLE : null,
  };
}

/**
 * Core tables unblock the desk. Photos, mail, files, and audit history stream in after.
 * Both groups start together, so the slow tables do not add a second waterfall.
 */
export function loadCompanyBook(supabase: Client, companyId: string) {
  const messagesPromise = loadMessages(supabase, companyId);
  const corePromise = queryCore(supabase, companyId);
  const deferredPromise = queryDeferred(supabase, companyId, messagesPromise);
  return {
    core: corePromise.then((core) => assembleBook(core, emptyDeferred())),
    full: Promise.all([corePromise, deferredPromise]).then(([core, deferred]) =>
      assembleBook(core, deferred),
    ),
  };
}

export async function fetchCompanyBook(supabase: Client, companyId: string) {
  return loadCompanyBook(supabase, companyId).full;
}
