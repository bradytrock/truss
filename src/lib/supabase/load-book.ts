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
  mapInvoice,
  mapInvoiceLine,
  mapJob,
  mapJobPhoto,
  mapOpportunity,
  mapPayment,
  mapExpense,
  mapScheduleEvent,
  mapStaff,
  mapTask,
  mapTeam,
  mapTrainingBulletin,
  mapTrainingProgress,
} from "@/lib/supabase/mappers";
import type { Database } from "@/lib/supabase/database.types";
import { initialsFromName, type CrmState, type SeatRole } from "@/lib/types";

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
    catalogRes,
    estimatesRes,
    estimateLinesRes,
    invoicesRes,
    invoiceLinesRes,
    paymentsRes,
    eventsRes,
    photosRes,
    expensesRes,
    calendarAccountsRes,
    calendarSharesRes,
    trainingProgressRes,
    trainingBulletinsRes,
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
    supabase.from("catalog_items").select("*").eq("company_id", companyId).order("cost_code"),
    supabase.from("estimates").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("estimate_lines").select("*").eq("company_id", companyId).order("sort_order"),
    supabase.from("invoices").select("*").eq("company_id", companyId).order("issued_at", { ascending: false }),
    supabase.from("invoice_lines").select("*").eq("company_id", companyId).order("sort_order"),
    supabase.from("payments").select("*").eq("company_id", companyId).order("paid_at", { ascending: false }),
    supabase.from("schedule_events").select("*").eq("company_id", companyId).order("starts_at"),
    supabase.from("job_photos").select("*").eq("company_id", companyId).order("taken_at", { ascending: false }),
    supabase.from("expenses").select("*").eq("company_id", companyId).order("incurred_at", { ascending: false }),
    supabase.from("calendar_accounts").select("*").eq("company_id", companyId),
    supabase.from("calendar_shares").select("*").eq("company_id", companyId),
    supabase.from("training_progress").select("*").eq("company_id", companyId),
    supabase.from("training_bulletins").select("*").eq("company_id", companyId).order("created_at", {
      ascending: false,
    }),
  ]);

  const missingTeams = Boolean(teamsRes.error);
  const error =
    clientsRes.error ||
    contactsRes.error ||
    oppsRes.error ||
    jobsRes.error ||
    activitiesRes.error ||
    tasksRes.error ||
    teamRes.error ||
    catalogRes.error ||
    estimatesRes.error ||
    estimateLinesRes.error ||
    invoicesRes.error ||
    invoiceLinesRes.error ||
    paymentsRes.error ||
    eventsRes.error ||
    photosRes.error;
  if (error) throw error;

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
      };
    }
  });

  const teams = missingTeams ? [] : (teamsRes.data ?? []).map(mapTeam);

  const state: CrmState = {
    staff,
    teams: teams.length > 0 ? teams : [],
    clients: (clientsRes.data ?? []).map(mapClient),
    contacts: (contactsRes.data ?? []).map((row) => {
      try {
        return mapContact(row);
      } catch {
        return {
          id: row.id,
          clientId: row.client_id,
          name: row.name,
          title: row.title,
          email: row.email,
          phone: row.phone,
          ownerStaffId: "",
          isReferralPartner: false,
        };
      }
    }),
    opportunities: (oppsRes.data ?? []).map(mapOpportunity),
    jobs: (jobsRes.data ?? []).map(mapJob),
    activities: (activitiesRes.data ?? []).map(mapActivity),
    tasks: (tasksRes.data ?? []).map(mapTask),
    catalog: (catalogRes.data ?? []).map(mapCatalogItem),
    estimates: (estimatesRes.data ?? []).map(mapEstimate),
    estimateLines: (estimateLinesRes.data ?? []).map(mapEstimateLine),
    invoices: (invoicesRes.data ?? []).map(mapInvoice),
    invoiceLines: (invoiceLinesRes.data ?? []).map(mapInvoiceLine),
    payments: (paymentsRes.data ?? []).map(mapPayment),
    expenses: expensesRes.error ? [] : (expensesRes.data ?? []).map(mapExpense),
    events: (eventsRes.data ?? []).map(mapScheduleEvent),
    photos: (photosRes.data ?? []).map(mapJobPhoto),
    calendarAccounts: calendarAccountsRes.error
      ? []
      : (calendarAccountsRes.data ?? []).map(mapCalendarAccount),
    calendarShares: calendarSharesRes.error
      ? []
      : (calendarSharesRes.data ?? []).map(mapCalendarShare),
    trainingProgress: trainingProgressRes.error
      ? []
      : (trainingProgressRes.data ?? []).map(mapTrainingProgress),
    trainingBulletins: trainingBulletinsRes.error
      ? []
      : (trainingBulletinsRes.data ?? []).map(mapTrainingBulletin),
  };

  return {
    state,
    team: state.staff.map((member) => member.name),
  };
}
