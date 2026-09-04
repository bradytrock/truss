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
  mapPhotoReport,
  mapOpportunity,
  mapPayment,
  mapExpense,
  mapQbVendor,
  mapQbReviewComment,
  mapScheduleEvent,
  mapStaff,
  mapTask,
  mapGoogleLocation,
  mapTeam,
  mapTrainingBulletin,
  mapTrainingProgress,
  mapMessage,
  mapGmailAccount,
  mapGmailMessage,
  mapReturningClientLead,
  mapMaterialOrder,
  mapMaterialOrderLine,
  mapMaterialOrderTemplate,
  mapMaterialOrderTemplateLine,
  mapPriceList,
  mapEagleviewOrder,
} from "@/lib/supabase/mappers";
import type { Database } from "@/lib/supabase/database.types";
import { initialsFromName, type CrmState, type SeatRole } from "@/lib/types";
import { jobFilesFromJobs, mergeJobFiles } from "@/lib/job-files";
import { jobsFilledFromLeads } from "@/lib/job-record";

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

export async function fetchCompanyBook(supabase: Client, companyId: string) {
  const [
    clientsRes,
    contactsRes,
    oppsRes,
    jobsRes,
    activitiesRes,
    tasksRes,
    teamRes,
    teamsRes,
    googleLocationsRes,
    catalogRes,
    estimatesRes,
    estimateLinesRes,
    estimateSignatureEventsRes,
    estimateTemplatesRes,
    estimateTemplateLinesRes,
    invoicesRes,
    invoiceLinesRes,
    paymentsRes,
    eventsRes,
    photosRes,
    expensesRes,
    qbVendorsRes,
    qbReviewCommentsRes,
    calendarAccountsRes,
    calendarSharesRes,
    trainingProgressRes,
    trainingBulletinsRes,
    photoReportsRes,
    messagesRes,
    gmailAccountsRes,
    gmailMessagesRes,
    returningClientLeadsRes,
    jobFilesRes,
    materialOrdersRes,
    materialOrderLinesRes,
    materialOrderTemplatesRes,
    materialOrderTemplateLinesRes,
    priceListsRes,
    eagleviewOrdersRes,
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("company_id", companyId).order("name"),
    supabase.from("contacts").select("*").eq("company_id", companyId).order("name"),
    supabase
      .from("opportunities")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase.from("jobs").select("*").eq("company_id", companyId).order("start_date", { ascending: false }),
    supabase
      .from("activities")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("company_id", companyId).order("due_at"),
    supabase.from("team_members").select("*").eq("company_id", companyId).order("name"),
    supabase.from("teams").select("*").eq("company_id", companyId).order("name"),
    supabase.from("google_locations").select("*").eq("company_id", companyId).order("name"),
    supabase.from("catalog_items").select("*").eq("company_id", companyId).order("cost_code"),
    supabase.from("estimates").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("estimate_lines").select("*").eq("company_id", companyId).order("sort_order"),
    supabase
      .from("estimate_signature_events")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase.from("estimate_templates").select("*").eq("company_id", companyId).order("name"),
    supabase.from("estimate_template_lines").select("*").eq("company_id", companyId).order("sort_order"),
    supabase.from("invoices").select("*").eq("company_id", companyId).order("issued_at", { ascending: false }),
    supabase.from("invoice_lines").select("*").eq("company_id", companyId).order("sort_order"),
    supabase.from("payments").select("*").eq("company_id", companyId).order("paid_at", { ascending: false }),
    supabase.from("schedule_events").select("*").eq("company_id", companyId).order("starts_at"),
    supabase.from("job_photos").select("*").eq("company_id", companyId).order("taken_at", { ascending: false }),
    supabase.from("expenses").select("*").eq("company_id", companyId).order("incurred_at", { ascending: false }),
    supabase.from("qb_vendors").select("*").eq("company_id", companyId).order("name"),
    supabase.from("qb_review_comments").select("*").eq("company_id", companyId).order("created_at"),
    supabase.from("calendar_accounts").select("*").eq("company_id", companyId),
    supabase.from("calendar_shares").select("*").eq("company_id", companyId),
    supabase.from("training_progress").select("*").eq("company_id", companyId),
    supabase.from("training_bulletins").select("*").eq("company_id", companyId).order("created_at", {
      ascending: false,
    }),
    supabase.from("photo_reports").select("*").eq("company_id", companyId).order("updated_at", {
      ascending: false,
    }),
    supabase.from("messages").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("gmail_accounts").select("*").eq("company_id", companyId),
    supabase
      .from("gmail_messages")
      .select("*")
      .eq("company_id", companyId)
      .order("received_at", { ascending: false }),
    supabase.from("returning_client_leads").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("job_files").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("material_orders").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("material_order_lines").select("*").eq("company_id", companyId).order("sort_order"),
    supabase.from("material_order_templates").select("*").eq("company_id", companyId).order("name"),
    supabase.from("material_order_template_lines").select("*").eq("company_id", companyId).order("sort_order"),
    supabase.from("price_lists").select("*").eq("company_id", companyId).order("effective_on", { ascending: false }),
    supabase
      .from("eagleview_orders")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
  ]);

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

  const invitesRes = await supabase.from("account_invites").select("staff_id, token, expires_at").eq("company_id", companyId);
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
    qbVendors: qbVendorsRes.error ? [] : (qbVendorsRes.data ?? []).map(mapQbVendor),
    qbReviewComments: qbReviewCommentsRes.error
      ? []
      : (qbReviewCommentsRes.data ?? []).map(mapQbReviewComment),
    events: eventsRes.error ? [] : mapRows(eventsRes.data, mapScheduleEvent),
    photos: photosRes.error ? [] : mapRows(photosRes.data, mapJobPhoto),
    jobFiles: mergeJobFiles(
      jobFilesRes.error ? [] : (jobFilesRes.data ?? []).map(mapJobFile),
      jobFilesFromJobs(jobs),
    ),
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
    messages: messagesRes.error ? [] : (messagesRes.data ?? []).map(mapMessage),
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
  };

  return {
    state,
    team: state.staff.map((member) => member.name),
  };
}
