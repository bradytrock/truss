import {
  allowsNotification,
  parseNotificationPrefs,
  type AlertId,
  type NotificationPrefs,
  type NotifyChannel,
} from "@/lib/notification-prefs";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type RpcResult = { data: unknown; error: { message?: string } | null };

type AllowsClient = {
  rpc: (
    fn: "notification_allows",
    args: { p_staff_id: string; p_kind: string; p_channel: string },
  ) => PromiseLike<RpcResult>;
};

type EmailAllowsClient = {
  rpc: (
    fn: "notification_allows_email",
    args: { p_email: string; p_kind: string; p_channel: string },
  ) => PromiseLike<RpcResult>;
};

function openFromRpc(data: unknown, error: { message?: string } | null) {
  if (error) return true;
  return data !== false;
}

function lockedOn(kind: AlertId, channel: NotifyChannel) {
  return allowsNotification({ [kind]: { [channel]: false } }, kind, channel);
}

/** Missing rows and a missing function both stay on, so a new switch does not silence anyone. */
export async function channelOpen(
  supabase: AllowsClient,
  staffId: string,
  kind: AlertId,
  channel: NotifyChannel,
) {
  if (!allowsNotification(undefined, kind, channel)) return false;
  if (!staffId || lockedOn(kind, channel)) return true;
  try {
    const { data, error } = await supabase.rpc("notification_allows", {
      p_staff_id: staffId,
      p_kind: kind,
      p_channel: channel,
    });
    return openFromRpc(data, error);
  } catch {
    return true;
  }
}

export async function emailChannelOpen(
  supabase: EmailAllowsClient,
  email: string,
  kind: AlertId,
  channel: NotifyChannel,
) {
  const to = email.trim();
  if (!to || !allowsNotification(undefined, kind, channel)) return false;
  if (lockedOn(kind, channel)) return true;
  try {
    const { data, error } = await supabase.rpc("notification_allows_email", {
      p_email: to,
      p_kind: kind,
      p_channel: channel,
    });
    return openFromRpc(data, error);
  } catch {
    return true;
  }
}

export async function loadCompanyNotificationPrefs(supabase: SupabaseClient<Database>, companyId: string) {
  const map = new Map<string, NotificationPrefs>();
  try {
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("staff_id, channels")
      .eq("company_id", companyId);
    if (error || !data) return map;
    for (const row of data) {
      if (row.staff_id) map.set(row.staff_id, parseNotificationPrefs(row.channels));
    }
  } catch {
    return map;
  }
  return map;
}
