"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { LeadAlertCard } from "@/components/lead-alerts/lead-alert-card";
import { AssignRepDialog, NoteToAdminDialog, PassAlongDialog } from "@/components/lead-alerts/lead-alert-dialogs";
import { CreateEventDialog } from "@/components/create-ops-dialogs";
import { useCrm } from "@/lib/crm-store";
import {
  acceptAlert,
  alertForMyAssignmentInsert,
  alertForMyAssignmentUpdate,
  alertForRepNote,
  alertForUnassignedInsert,
  alertForUnassignedUpdate,
  alertFromCatchUp,
  announcementFor,
  asSelfOpened,
  dismissAlert,
  leadOpenedByAssignee,
  markSelfAssignedLead,
  maybeBrowserNotify,
  readCatchUpCursor,
  rememberCatchUpCursor,
  snapshotFromPayload,
  stackAlerts,
  stampStorageKey,
  takeSelfAssignedLead,
  type AlertMemory,
  type LeadActivitySnapshot,
  type LeadAlert,
} from "@/lib/lead-alerts";
import {
  assignLead,
  fetchAssignedToMeSince,
  fetchLead,
  fetchRepNotesSince,
  fetchUnassignedSince,
  passLeadBack,
  sendRepNote,
} from "@/lib/lead-alerts-api";
import { NOTIFICATIONS_REFRESH } from "@/lib/notification-inbox";
import { isUnsignedDemo } from "@/lib/seats";
import { createClient } from "@/lib/supabase/client";
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

function useCoarsePointer() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(pointer: coarse)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

function loadStamps(userId: string) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(stampStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function focusAlert(id: string) {
  const node = document.querySelector(`[data-alert-id="${CSS.escape(id)}"]`);
  if (node instanceof HTMLElement) node.focus();
}

export function LeadAlertHost() {
  const { user } = useCrm();
  if (!user.id || isUnsignedDemo(user)) return null;
  return <LeadAlertSession key={user.id} />;
}

function appointmentPlace(alert: LeadAlert) {
  return [alert.lead.street, alert.lead.city].filter(Boolean).join(", ");
}

function presentAssignment(alert: LeadAlert) {
  if (leadOpenedByAssignee(alert.lead)) return alert;
  if (takeSelfAssignedLead(alert.lead.id)) return asSelfOpened(alert);
  return alert;
}

function LeadAlertSession() {
  const { user, jobs } = useCrm();
  const isAdmin = user.role === "company_admin";
  const coarse = useCoarsePointer();
  const livePermission = useNotificationPermission();
  const [permissionOverride, setPermissionOverride] = useState<NotificationPermission | "unsupported" | null>(null);
  const permission = permissionOverride ?? livePermission;
  const [memory, setMemory] = useState<AlertMemory>({ queue: [], stamps: [] });
  const memoryRef = useRef(memory);
  const [announcement, setAnnouncement] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [modal, setModal] = useState<{ type: "pass" | "note" | "assign"; alert: LeadAlert } | null>(null);
  const [appointment, setAppointment] = useState<LeadAlert | null>(null);

  const persist = useCallback(
    (next: AlertMemory) => {
      memoryRef.current = next;
      setMemory(next);
      try {
        window.sessionStorage.setItem(stampStorageKey(user.id), JSON.stringify(next.stamps));
      } catch {
        // Private mode can reject sessionStorage. The in-memory queue still works.
      }
    },
    [user.id],
  );

  const stampsReady = useRef(false);
  const accept = useCallback(
    (alert: LeadAlert, activityAt = "") => {
      if (!stampsReady.current) {
        stampsReady.current = true;
        const stored = loadStamps(user.id);
        if (stored.length) {
          memoryRef.current = {
            queue: memoryRef.current.queue,
            stamps: [...new Set([...stored, ...memoryRef.current.stamps])].slice(-200),
          };
        }
      }
      const next = acceptAlert(memoryRef.current, alert, activityAt);
      if (next === memoryRef.current) return false;
      persist(next);
      setAnnouncement(announcementFor(alert));
      maybeBrowserNotify(alert, () => focusAlert(alert.id));
      window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH));
      return true;
    },
    [persist, user.id],
  );

  const dismiss = useCallback(
    (id: string) => {
      const next = dismissAlert(memoryRef.current, id);
      if (next === memoryRef.current) return;
      persist(next);
    },
    [persist],
  );

  const acceptLead = useCallback(
    (alert: LeadAlert) => {
      const presented = presentAssignment(alert);
      let next = memoryRef.current;
      for (const item of next.queue) {
        if (
          item.lead.id === presented.lead.id &&
          item.id !== presented.id &&
          (item.kind === "needs_rep" || item.kind === "passed_back" || item.kind === "new_lead")
        ) {
          next = dismissAlert(next, item.id);
        }
      }
      if (next !== memoryRef.current) persist(next);
      accept(presented);
    },
    [accept, persist],
  );

  useEffect(() => {
    if (!memory.queue.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [memory.queue.length]);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    let generation = 0;
    let everConnected = false;
    let dropped = false;
    let channel: RealtimeChannel | null = null;
    let retry: number | undefined;
    let delay = 1500;

    const catchUp = async () => {
      const since = readCatchUpCursor(window.sessionStorage, user.id);
      const nowIso = new Date().toISOString();
      if (!since) {
        rememberCatchUpCursor(window.sessionStorage, user.id, nowIso);
        return;
      }
      const [mine, unassigned, notes] = await Promise.all([
        fetchAssignedToMeSince(supabase, user.id, since),
        isAdmin ? fetchUnassignedSince(supabase, user.companyId, since) : Promise.resolve([]),
        isAdmin ? fetchRepNotesSince(supabase, since) : Promise.resolve([]),
      ]);
      if (stopped) return;
      for (const row of [...mine].reverse()) {
        const alert = alertFromCatchUp(row, user.id, false);
        if (alert) acceptLead(alert);
      }
      if (isAdmin) {
        for (const row of [...unassigned].reverse()) {
          if (row.assigned_to === user.id) continue;
          const alert = alertFromCatchUp(row, user.id, true);
          if (alert) accept(alert);
        }
        for (const activity of [...notes].reverse()) {
          const lead = await fetchLead(supabase, activity.lead_id);
          if (!lead || stopped) continue;
          const alert = alertForRepNote(activity, lead, user.id, true);
          if (alert) accept(alert, activity.created_at);
        }
      }
      rememberCatchUpCursor(window.sessionStorage, user.id, nowIso);
    };

    const connect = () => {
      if (stopped) return;
      const gen = ++generation;
      if (channel) void supabase.removeChannel(channel);
      const topic = supabase.channel(`lead-alerts-${user.id}`);
      topic.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads", filter: `assigned_to=eq.${user.id}` },
        (payload) => {
          const row = snapshotFromPayload(payload.new);
          if (!row || row.company_id !== user.companyId) return;
          const alert = alertForMyAssignmentInsert(row, user.id);
          if (alert) acceptLead(alert);
        },
      );
      topic.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads", filter: `assigned_to=eq.${user.id}` },
        (payload) => {
          const row = snapshotFromPayload(payload.new);
          if (!row || row.company_id !== user.companyId) return;
          const alert = alertForMyAssignmentUpdate(row, payload.old, user.id);
          if (alert) acceptLead(alert);
        },
      );
      if (isAdmin) {
        topic.on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "leads", filter: "status=eq.unassigned" },
          (payload) => {
            const row = snapshotFromPayload(payload.new);
            if (!row || row.company_id !== user.companyId) return;
            const alert = alertForUnassignedInsert(row, true);
            if (alert) accept(alert);
          },
        );
        topic.on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "leads", filter: "status=eq.unassigned" },
          (payload) => {
            const row = snapshotFromPayload(payload.new);
            if (!row || row.company_id !== user.companyId) return;
            const alert = alertForUnassignedUpdate(row, payload.old, true);
            if (alert) accept(alert);
          },
        );
        topic.on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "lead_activity", filter: "kind=eq.rep_note" },
          (payload) => {
            const activity = payload.new as LeadActivitySnapshot;
            if (activity.user_id === user.id) return;
            void fetchLead(supabase, activity.lead_id).then((lead) => {
              if (!lead || stopped || gen !== generation) return;
              const alert = alertForRepNote(activity, lead, user.id, true);
              if (alert) accept(alert, activity.created_at);
            });
          },
        );
      }
      channel = topic.subscribe((status) => {
        if (stopped || gen !== generation) return;
        if (status === "SUBSCRIBED") {
          const reconnect = everConnected && dropped;
          everConnected = true;
          dropped = false;
          delay = 1500;
          if (reconnect) void catchUp();
          else rememberCatchUpCursor(window.sessionStorage, user.id, new Date().toISOString());
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          dropped = true;
          window.clearTimeout(retry);
          const wait = delay;
          delay = Math.min(delay * 2, 15000);
          retry = window.setTimeout(() => connect(), wait);
        }
      });
    };

    connect();
    const onOnline = () => {
      dropped = true;
      connect();
    };
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      generation += 1;
      window.clearTimeout(retry);
      window.removeEventListener("online", onOnline);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [accept, acceptLead, isAdmin, user.companyId, user.id]);

  const { visible, hiddenCount } = stackAlerts(memory.queue);
  const showNotifyPrompt = permission === "default" && memory.queue.length > 0;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:inset-x-auto sm:right-4 sm:w-[380px] sm:p-0 sm:pt-4">
        <div className="sr-only" aria-live="assertive" aria-atomic="true">
          {announcement}
        </div>
        {showNotifyPrompt ? (
          <div className="pointer-events-auto flex flex-col gap-2 rounded-md border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm sm:w-[380px]">
            <p>Turn on desktop alerts for new leads while this tab is in the background.</p>
            <button
              type="button"
              className={cn(
                "shrink-0 rounded-md bg-[#E0302E] px-2.5 py-1 text-xs font-medium text-white",
                "focus-visible:ring-2 focus-visible:ring-[#E0302E]/50 focus-visible:outline-none",
              )}
              onClick={() => {
                if (typeof Notification === "undefined") return;
                void Notification.requestPermission().then((next) => setPermissionOverride(next));
              }}
            >
              Turn on desktop alerts
            </button>
          </div>
        ) : null}
        {visible.map((alert) => (
          <LeadAlertCard
            key={alert.id}
            alert={alert}
            now={now}
            coarse={coarse}
            isAdmin={isAdmin}
            onDismiss={() => dismiss(alert.id)}
            onCalled={() => dismiss(alert.id)}
            onPass={() => setModal({ type: "pass", alert })}
            onNote={() => setModal({ type: "note", alert })}
            onAssign={() => setModal({ type: "assign", alert })}
            onAppointment={() => setAppointment(alert)}
          />
        ))}
        {hiddenCount > 0 ? (
          <p className="pointer-events-none text-center text-xs font-medium text-muted-foreground sm:text-right">
            +{hiddenCount} more
          </p>
        ) : null}
      </div>
      <PassAlongDialog
        alert={modal?.type === "pass" ? modal.alert : null}
        onClose={() => setModal(null)}
        onSubmit={async (reason, note) => {
          if (modal?.type !== "pass") return;
          await passLeadBack(createClient(), {
            leadId: modal.alert.lead.id,
            userId: user.id,
            fullName: user.name,
            reason,
            note,
          });
          dismiss(modal.alert.id);
          setModal(null);
        }}
      />
      <NoteToAdminDialog
        alert={modal?.type === "note" ? modal.alert : null}
        onClose={() => setModal(null)}
        onSubmit={async (body) => {
          if (modal?.type !== "note") return;
          await sendRepNote(createClient(), {
            leadId: modal.alert.lead.id,
            userId: user.id,
            fullName: user.name,
            body,
          });
          dismiss(modal.alert.id);
          setModal(null);
        }}
      />
      {isAdmin ? (
        <AssignRepDialog
          alert={modal?.type === "assign" ? modal.alert : null}
          companyId={user.companyId}
          viewerId={user.id}
          onClose={() => setModal(null)}
          onSubmit={async (repId, note) => {
            if (modal?.type !== "assign") return;
            if (repId === user.id) markSelfAssignedLead(modal.alert.lead.id);
            await assignLead(createClient(), { leadId: modal.alert.lead.id, repId, note });
            dismiss(modal.alert.id);
            setModal(null);
          }}
        />
      ) : null}
      <CreateEventDialog
        open={Boolean(appointment)}
        onOpenChange={(open) => {
          if (!open) setAppointment(null);
        }}
        defaultTitle={appointment ? `Appointment with ${appointment.lead.homeowner_name || "homeowner"}` : ""}
        defaultLocation={appointment ? appointmentPlace(appointment) : ""}
        defaultJobId={
          appointment
            ? jobs.find((job) => job.id === appointment.lead.job_id)?.id
              ?? jobs.find((job) => job.opportunityId && job.opportunityId === appointment.lead.opportunity_id)?.id
              ?? appointment.lead.job_id
              ?? ""
            : ""
        }
        defaultOpportunityId={appointment?.lead.opportunity_id ?? ""}
        defaultKind="site_walk"
        onCreated={() => {
          if (appointment) dismiss(appointment.id);
          setAppointment(null);
        }}
      />
    </>
  );
}
