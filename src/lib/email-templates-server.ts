import { parseEmailTemplates, type CompanyEmailTemplates } from "@/lib/email-templates";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** Company email copy, including for cron jobs that are not signed in. */
export async function loadCompanyEmailTemplates(
  supabase: Client,
  companyId: string,
): Promise<CompanyEmailTemplates> {
  const id = companyId.trim();
  if (!id) return {};
  const { data, error } = await supabase.rpc("company_email_templates", { p_company_id: id });
  if (error || data == null) return {};
  return parseEmailTemplates(data);
}
