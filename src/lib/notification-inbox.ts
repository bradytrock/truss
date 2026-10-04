import { alertStamp, type LeadAlert } from "@/lib/lead-alerts";

export const NOTIFICATIONS_REFRESH = "notifications:refresh";
export const INBOX_LIMIT = 40;

export type InboxItem = {
  alert: LeadAlert;
  stamp: string;
  at: string;
};

export function inboxReadKey(userId: string) {
  return `notifications.read.${userId}`;
}

export function inboxItem(alert: LeadAlert, at: string, activityAt = ""): InboxItem {
  return {
    alert,
    stamp: alertStamp({ ...alert, activityAt }),
    at,
  };
}

export function mergeInbox(items: InboxItem[]) {
  const byId = new Map<string, InboxItem>();
  for (const item of items) {
    const current = byId.get(item.alert.id);
    if (!current || item.at > current.at) byId.set(item.alert.id, item);
  }
  return [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, INBOX_LIMIT);
}

export function readInboxStamps(storage: Pick<Storage, "getItem"> | null, userId: string) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(inboxReadKey(userId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function rememberInboxStamps(storage: Pick<Storage, "setItem"> | null, userId: string, stamps: string[]) {
  storage?.setItem(inboxReadKey(userId), JSON.stringify(stamps.slice(-400)));
}

export function unreadInbox(items: InboxItem[], readStamps: string[]) {
  const read = new Set(readStamps);
  return items.filter((item) => !read.has(item.stamp));
}

export function markInboxStampsRead(readStamps: string[], stamps: string[]) {
  return [...new Set([...readStamps, ...stamps])].slice(-400);
}
