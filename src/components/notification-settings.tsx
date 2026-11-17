"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { SettingsCard, SettingsPageHeader, SettingsToggle } from "@/components/settings-chrome";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/format";
import {
  NOTIFY_CHANNEL_LABELS,
  NOTIFY_SECTIONS,
  alertsForMember,
  allowsNotification,
  channelLocked,
  setAlertsChannels,
  setNotificationChannel,
  type AlertDef,
  type AlertId,
  type NotificationPrefs,
  type NotifyChannel,
} from "@/lib/notification-prefs";
import {
  loadSavedPrefs,
  prefsMatch,
  saveSavedPrefs,
} from "@/lib/notification-prefs-client";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { StaffMember, Team } from "@/lib/types";
import { cn } from "@/lib/utils";

function notificationPermission() {
  if (typeof Notification === "undefined") return "unsupported" as const;
  return Notification.permission;
}

function useNotificationPermission() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("focus", onChange);
      return () => window.removeEventListener("focus", onChange);
    },
    notificationPermission,
    () => "default" as const,
  );
}

function givenName(name: string) {
  return name.trim().split(/\s+/)[0] || "them";
}

export function NotificationSettings({
  member,
  teams,
  companyId,
  self,
  profileUserId,
  embedded = false,
}: {
  member: StaffMember;
  teams: Team[];
  companyId: string;
  self: boolean;
  profileUserId?: string;
  embedded?: boolean;
}) {
  const permission = useNotificationPermission();
  const [saved, setSaved] = useState<NotificationPrefs>({});
  const [draft, setDraft] = useState<NotificationPrefs>({});
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [iphone, setIphone] = useState<boolean | null>(null);

  const alerts = useMemo(
    () => alertsForMember(member.role, member.id, teams),
    [member.id, member.role, teams],
  );
  const dirty = ready && !prefsMatch(draft, saved);
  const who = givenName(member.name);
  const phone = member.phone.trim();
  const email = member.email.trim();

  useEffect(() => {
    let cancelled = false;
    void loadSavedPrefs(member.id).then((prefs) => {
      if (cancelled) return;
      setSaved(prefs);
      setDraft(prefs);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  useEffect(() => {
    if (!self || !profileUserId || !isSupabaseConfigured()) return;
    let cancelled = false;
    void createClient()
      .from("device_tokens")
      .select("id")
      .eq("user_id", profileUserId)
      .eq("platform", "ios")
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return;
        setIphone(!error && (data?.length ?? 0) > 0);
      });
    return () => {
      cancelled = true;
    };
  }, [profileUserId, self]);

  function toggle(id: AlertId, channel: NotifyChannel, on: boolean) {
    setDraft((current) => setNotificationChannel(current, id, channel, on));
  }

  async function save(next: NotificationPrefs) {
    setPending(true);
    try {
      const where = await saveSavedPrefs({ staffId: member.id, companyId, prefs: next });
      setSaved(next);
      setDraft(next);
      toast.success(where === "remote" ? "Notification settings saved." : "Saved in this browser.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save notification settings.");
    } finally {
      setPending(false);
    }
  }

  async function allowBrowser() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") {
      toast.message("Notifications are blocked for this site. Allow them in the browser’s site settings.");
      return;
    }
    const result = await Notification.requestPermission();
    if (result === "granted") toast.success("This browser will show lead alerts while Truss is open.");
  }

  const reachTitle = self ? "Where we can reach you" : `Where we can reach ${who}`;
  const alertsTitle = self ? "Your alerts" : `${who}’s alerts`;

  return (
    <div className="space-y-5">
      {embedded ? null : (
        <SettingsPageHeader
          title="Notifications"
          description="Choose how you hear about leads, jobs, tasks, and weather. Lead alerts always show in the bell and lead popup cards in the app."
        />
      )}

      <SettingsCard>
        <div className="border-b border-[#f0ece8] px-5 py-4">
          <h2 className="text-base font-semibold">{reachTitle}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Emails come from the office address through Resend. Texts come from the office Photon line.
          </p>
        </div>
        <ReachRow
          label="Mobile phone for texts"
          value={phone ? formatPhone(phone) : "No phone on this profile"}
          action={
            self ? (
              phone ? (
                <Link href="/messages" className="text-sm font-medium text-foreground hover:underline">
                  Phone app
                </Link>
              ) : (
                <Link href="/profile" className="text-sm font-medium text-primary hover:underline">
                  Add a phone
                </Link>
              )
            ) : phone ? null : (
              <span className="text-sm text-muted-foreground">Add a phone on Details</span>
            )
          }
        />
        <ReachRow
          label="Email"
          value={email || "No email on this profile"}
          action={
            email || !self ? null : (
              <Link href="/profile" className="text-sm font-medium text-primary hover:underline">
                Add an email
              </Link>
            )
          }
        />
        {self ? (
          <ReachRow
            label="This browser"
            value={browserLabel(permission)}
            action={
              permission === "granted" || permission === "unsupported" ? null : (
                <Button type="button" variant="outline" className="h-8 rounded-lg bg-white" onClick={() => void allowBrowser()}>
                  Allow notifications
                </Button>
              )
            }
          />
        ) : null}
        {self && profileUserId ? (
          <ReachRow
            label="iPhone"
            value={
              !isSupabaseConfigured()
                ? "Not on your iPhone"
                : iphone == null
                  ? "Checking your iPhone…"
                  : iphone
                    ? "On your iPhone"
                    : "Not on your iPhone"
            }
            action={
              iphone ? null : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-lg bg-white"
                  disabled={isSupabaseConfigured() && iphone == null}
                  onClick={() =>
                    toast.message("Open Truss on your iPhone and allow notifications. Pass-backs and rep notes show up there.")
                  }
                >
                  Turn on your iPhone
                </Button>
              )
            }
            last
          />
        ) : null}
      </SettingsCard>

      <SettingsCard>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f0ece8] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{alertsTitle}</h2>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Turn each alert on or off. A lead always shows in the bell and the popup cards.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              className="font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setDraft(setAlertsChannels(draft, alerts, false))}
            >
              All off
            </button>
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
            <button
              type="button"
              className="font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setDraft(setAlertsChannels(draft, alerts, true))}
            >
              All on
            </button>
          </div>
        </div>

        {NOTIFY_SECTIONS.map((section) => {
          const rows = alerts.filter((alert) => alert.section === section.id);
          if (!rows.length) return null;
          const canToggle = rows.some((alert) => alert.channels.some((channel) => !channelLocked(alert, channel)));
          return (
            <div key={section.id} className="border-b border-[#f0ece8] last:border-b-0">
              <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {section.label}
                </p>
                {canToggle ? (
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setDraft(setAlertsChannels(draft, rows, false))}
                  >
                    Turn all off
                  </button>
                ) : null}
              </div>
              <ul>
                {rows.map((alert) => (
                  <li key={alert.id} className="border-t border-[#f6f3ef] px-5 py-4 first:border-t-0">
                    <AlertRow alert={alert} prefs={draft} disabled={!ready || pending} onToggle={toggle} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </SettingsCard>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Safety warnings and Stripe notices can’t be turned off.</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg bg-white"
            disabled={!ready || pending || prefsMatch(draft, {})}
            onClick={() => setDraft({})}
          >
            Reset to defaults
          </Button>
          <Button type="button" className="h-10 rounded-lg px-4" disabled={!dirty || pending} onClick={() => void save(draft)}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReachRow({
  label,
  value,
  action,
  last = false,
}: {
  label: string;
  value: string;
  action?: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_auto] sm:items-center",
        last ? "" : "border-b border-[#f6f3ef]",
      )}
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="text-sm text-muted-foreground">{value}</p>
      <div className="sm:justify-self-end">{action}</div>
    </div>
  );
}

function AlertRow({
  alert,
  prefs,
  disabled,
  onToggle,
}: {
  alert: AlertDef;
  prefs: NotificationPrefs;
  disabled: boolean;
  onToggle: (id: AlertId, channel: NotifyChannel, on: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{alert.title}</p>
          {alert.badge ? (
            <span className="rounded-full bg-[#f3efe9] px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {alert.badge}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">{alert.description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {alert.channels.map((channel) => {
          const locked = channelLocked(alert, channel);
          const on = allowsNotification(prefs, alert.id, channel);
          return (
            <div
              key={channel}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-[#e7e1da] bg-[#faf8f6] py-1 pr-1.5 pl-3",
                locked && "bg-[#f6f4f1]",
              )}
            >
              {locked ? <Lock className="size-3.5 text-muted-foreground" aria-hidden /> : null}
              <span className="text-sm">{NOTIFY_CHANNEL_LABELS[channel]}</span>
              {locked ? <span className="pr-1.5 text-xs text-muted-foreground">Always on</span> : null}
              <SettingsToggle
                checked={on}
                disabled={disabled || locked}
                label={`${alert.title}, ${NOTIFY_CHANNEL_LABELS[channel]}`}
                onCheckedChange={(next) => onToggle(alert.id, channel, next)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function browserLabel(permission: NotificationPermission | "unsupported") {
  if (permission === "unsupported") return "This browser can’t show alerts";
  if (permission === "granted") return "On in this browser";
  if (permission === "denied") return "Blocked in this browser";
  return "Off in this browser";
}
