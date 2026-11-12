import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  emailStatusNeedsRefresh,
  nextEmailStatus,
  normalizeEmailStatus,
} from "@/lib/email-status";
import { resendApiKey } from "@/lib/resend-mail";
import { railwayClientOptions } from "@/lib/railway-rest";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseUrl } from "@/lib/supabase/env";

type Client = SupabaseClient<Database>;

const REFRESH_LIMIT = 12;

export function emailDeliveryServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!key) return null;
  return createClient<Database>(getSupabaseUrl(), key, {
    ...railwayClientOptions(),
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function fetchResendLastEvent(id: string) {
  const key = resendApiKey();
  const emailId = id.trim();
  if (!key || !emailId) return null;
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { last_event?: unknown } | null;
  return normalizeEmailStatus(typeof data?.last_event === "string" ? data.last_event : "") || null;
}

async function mapPool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    const slice = items.slice(index, index + size);
    results.push(...(await Promise.all(slice.map((item) => run(item)))));
  }
  return results;
}

/** Pull last_event for open sends and write the status back onto those activities. */
export async function refreshEmailActivities(supabase: Client, activityIds: string[]) {
  const ids = [...new Set(activityIds.map((id) => id.trim()).filter(Boolean))].slice(0, 40);
  if (!ids.length || !resendApiKey()) return { updates: [] as { id: string; emailStatus: string }[], pending: false };

  const { data, error } = await supabase
    .from("activities")
    .select("id, resend_id, email_status")
    .in("id", ids);
  if (error || !data) return { updates: [] as { id: string; emailStatus: string }[], pending: false };

  const open = data.filter((row) => row.resend_id.trim() && emailStatusNeedsRefresh(row.email_status));
  const updates: { id: string; emailStatus: string }[] = [];
  await mapPool(open.slice(0, REFRESH_LIMIT), 4, async (row) => {
    const incoming = await fetchResendLastEvent(row.resend_id);
    if (!incoming) return;
    const emailStatus = nextEmailStatus(row.email_status, incoming);
    if (emailStatus === normalizeEmailStatus(row.email_status)) return;
    const { error: updateError } = await supabase
      .from("activities")
      .update({ email_status: emailStatus })
      .eq("id", row.id);
    if (!updateError) updates.push({ id: row.id, emailStatus });
  });

  const advanced = new Map(updates.map((row) => [row.id, row.emailStatus]));
  const pending = open.some((row) => emailStatusNeedsRefresh(advanced.get(row.id) ?? row.email_status));
  return { updates, pending };
}

/** Apply one Resend webhook event to every activity that stored that email id. */
export async function applyResendDeliveryEvent(supabase: Client, resendId: string, incoming: string) {
  const id = resendId.trim();
  const status = normalizeEmailStatus(incoming);
  if (!id || !status) return 0;
  const { data, error } = await supabase
    .from("activities")
    .select("id, email_status")
    .eq("resend_id", id);
  if (error || !data?.length) return 0;
  let changed = 0;
  for (const row of data) {
    const emailStatus = nextEmailStatus(row.email_status, status);
    if (emailStatus === normalizeEmailStatus(row.email_status)) continue;
    const { error: updateError } = await supabase
      .from("activities")
      .update({ email_status: emailStatus })
      .eq("id", row.id);
    if (!updateError) changed += 1;
  }
  return changed;
}
