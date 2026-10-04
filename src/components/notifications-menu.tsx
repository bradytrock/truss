"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buttonVariants } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import {
  alertTimeLabel,
  leadRecordHref,
  notificationBody,
  passbackSummary,
} from "@/lib/lead-alerts";
import {
  inboxReadKey,
  markInboxStampsRead,
  NOTIFICATIONS_REFRESH,
  readInboxStamps,
  rememberInboxStamps,
  unreadInbox,
  type InboxItem,
} from "@/lib/notification-inbox";
import { loadNotificationInbox } from "@/lib/notification-inbox-api";
import { isUnsignedDemo } from "@/lib/seats";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const READ_EVENT = "notifications:read";

type InboxSnapshot = {
  items: InboxItem[];
  error: string;
  loading: boolean;
};

const EMPTY_INBOX: InboxSnapshot = { items: [], error: "", loading: true };
const inboxSnapshots = new Map<string, InboxSnapshot>();
const inboxListeners = new Map<string, Set<() => void>>();

function inboxSnapshot(key: string) {
  return inboxSnapshots.get(key) ?? EMPTY_INBOX;
}

function publishInbox(key: string, next: InboxSnapshot) {
  inboxSnapshots.set(key, next);
  inboxListeners.get(key)?.forEach((listener) => listener());
}

function subscribeInbox(key: string, listener: () => void) {
  let listeners = inboxListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    inboxListeners.set(key, listeners);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function NotificationsMenu() {
  const { user } = useCrm();
  if (!user.id || isUnsignedDemo(user)) return null;
  return <NotificationsSession key={user.id} />;
}

function NotificationsSession() {
  const { user } = useCrm();
  const router = useRouter();
  const isAdmin = user.role === "company_admin";
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const inboxKey = `${user.id}:${isAdmin ? "admin" : "rep"}`;
  const inbox = useSyncExternalStore(
    (listener) => subscribeInbox(inboxKey, listener),
    () => inboxSnapshot(inboxKey),
    () => EMPTY_INBOX,
  );
  const readRaw = useSyncExternalStore(
    (listener) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === inboxReadKey(user.id)) listener();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(READ_EVENT, listener);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(READ_EVENT, listener);
      };
    },
    () => window.localStorage.getItem(inboxReadKey(user.id)) ?? "",
    () => "",
  );
  const readStamps = useMemo(() => {
    if (!readRaw) return readInboxStamps(null, user.id);
    try {
      const parsed = JSON.parse(readRaw);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }, [readRaw, user.id]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      void loadNotificationInbox(createClient(), {
        userId: user.id,
        companyId: user.companyId,
        isAdmin,
      })
        .then((items) => {
          if (!cancelled) publishInbox(inboxKey, { items, error: "", loading: false });
        })
        .catch(() => {
          if (!cancelled) publishInbox(inboxKey, { items: inboxSnapshot(inboxKey).items, error: "failed", loading: false });
        });
    };
    run();
    window.addEventListener(NOTIFICATIONS_REFRESH, run);
    window.addEventListener("focus", run);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATIONS_REFRESH, run);
      window.removeEventListener("focus", run);
    };
  }, [inboxKey, isAdmin, user.companyId, user.id]);

  const unread = unreadInbox(inbox.items, readStamps);

  function saveRead(stamps: string[]) {
    const next = markInboxStampsRead(readStamps, stamps);
    rememberInboxStamps(window.localStorage, user.id, next);
    window.dispatchEvent(new Event(READ_EVENT));
  }

  function openItem(item: InboxItem) {
    saveRead([item.stamp]);
    setOpen(false);
    const href = leadRecordHref(item.alert.lead);
    if (href) router.push(href);
  }

  const countLabel = unread.length > 9 ? "9+" : String(unread.length);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setNow(Date.now());
        setOpen(next);
      }}
    >
      <PopoverTrigger
        nativeButton
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "relative text-muted-foreground hover:text-foreground",
        )}
      >
        <Bell />
        <span className="hidden md:inline">Notifications</span>
        {unread.length > 0 ? (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E0302E] px-1 text-[10px] font-medium text-white">
            {countLabel}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-1.5rem))] gap-0 p-0">
        <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread.length > 0 ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              onClick={() => saveRead(unread.map((item) => item.stamp))}
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {inbox.loading ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">Loading notifications…</p>
          ) : inbox.error && inbox.items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">Could not load notifications.</p>
          ) : inbox.items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul>
              {inbox.items.map((item) => {
                const unreadItem = unread.some((entry) => entry.stamp === item.stamp);
                const detail =
                  item.alert.kind === "passed_back"
                    ? passbackSummary(item.alert.lead) || notificationBody(item.alert)
                    : item.alert.kind === "rep_note"
                      ? item.alert.noteBody
                      : notificationBody(item.alert);
                const when = Date.parse(item.at);
                return (
                  <li key={item.alert.id} className="border-b last:border-b-0">
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className="flex w-full gap-2 px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          unreadItem ? "bg-[#E0302E]" : "bg-transparent",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn("truncate text-sm", unreadItem && "font-medium")}>{item.alert.title}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {Number.isFinite(when) ? alertTimeLabel(when, now) : ""}
                          </span>
                        </span>
                        {detail ? (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
