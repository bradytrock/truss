import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapActivity,
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
  mapScheduleEvent,
  mapTask,
} from "@/lib/supabase/mappers";
import type { Database } from "@/lib/supabase/database.types";
import type { CrmState } from "@/lib/types";

type Client = SupabaseClient<Database>;

export async function fetchCompanyBook(supabase: Client, companyId: string) {
  const [
    clientsRes,
    contactsRes,
    oppsRes,
    jobsRes,
    activitiesRes,
    tasksRes,
    teamRes,
    catalogRes,
    estimatesRes,
    estimateLinesRes,
    invoicesRes,
    invoiceLinesRes,
    paymentsRes,
    eventsRes,
    photosRes,
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
    supabase.from("team_members").select("name").eq("company_id", companyId).order("name"),
    supabase.from("catalog_items").select("*").eq("company_id", companyId).order("cost_code"),
    supabase.from("estimates").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("estimate_lines").select("*").eq("company_id", companyId).order("sort_order"),
    supabase.from("invoices").select("*").eq("company_id", companyId).order("issued_at", { ascending: false }),
    supabase.from("invoice_lines").select("*").eq("company_id", companyId).order("sort_order"),
    supabase.from("payments").select("*").eq("company_id", companyId).order("paid_at", { ascending: false }),
    supabase.from("schedule_events").select("*").eq("company_id", companyId).order("starts_at"),
    supabase.from("job_photos").select("*").eq("company_id", companyId).order("taken_at", { ascending: false }),
  ]);

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

  const state: CrmState = {
    clients: (clientsRes.data ?? []).map(mapClient),
    contacts: (contactsRes.data ?? []).map(mapContact),
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
    events: (eventsRes.data ?? []).map(mapScheduleEvent),
    photos: (photosRes.data ?? []).map(mapJobPhoto),
  };

  return {
    state,
    team: (teamRes.data ?? []).map((row) => row.name),
  };
}
