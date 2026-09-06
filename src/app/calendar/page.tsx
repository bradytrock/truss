"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarWeekGrid } from "@/components/calendar-week-grid";
import { CreateEventDialog } from "@/components/create-ops-dialogs";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { Badge } from "@/components/ui/badge";
import { useCrm } from "@/lib/crm-store";
import {
  accountForStaff,
  calendarColor,
  calendarShareSummary,
  visibleCalendarStaff,
} from "@/lib/calendar";
import { demoGoogleEvents, type GoogleOverlayEvent } from "@/lib/google-calendar-demo";
import { formatDate, localYmd, startOfWeek } from "@/lib/format";
import type { EventKind, ScheduleEvent } from "@/lib/types";

type CreateDraft = {
  day: string;
  start?: string;
  end?: string;
  title?: string;
};

export default function CalendarPage() {
  const crm = useCrm();
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [oauthReady, setOauthReady] = useState(false);
  const [remoteGoogle, setRemoteGoogle] = useState<GoogleOverlayEvent[]>([]);

  const viewer = crm.impersonatedStaff ? crm.effectiveStaff : crm.viewer;
  const mine = viewer ? accountForStaff(crm.calendarAccounts, viewer.id) : undefined;
  const visiblePeople = useMemo(
    () =>
      visibleCalendarStaff(
        viewer,
        crm.book.staff,
        crm.calendarAccounts,
        crm.calendarShares,
      ),
    [crm.book.staff, crm.calendarAccounts, crm.calendarShares, viewer],
  );

  const selected = useMemo(
    () => visiblePeople.map((person) => person.id).filter((id) => !hidden.includes(id)),
    [hidden, visiblePeople],
  );

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + index);
      return date;
    });
  }, [anchor]);

  const today = localYmd(new Date());
  const rangeStart = days[0];
  const rangeEnd = useMemo(() => {
    const end = new Date(days[6] ?? days[0]);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [days]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      const email = params.get("email") || "";
      const staffId = params.get("staffId") || crm.user.staffId;
      void crm.markCalendarLinked(staffId, email, "google");
      toast.success(`Google Calendar linked${email ? ` as ${email}` : ""}.`);
      window.history.replaceState({}, "", "/calendar");
    } else if (params.get("google") === "error") {
      toast.error(params.get("reason") || "Google Calendar did not connect.");
      window.history.replaceState({}, "", "/calendar");
    }
    void fetch("/api/google/calendar/status")
      .then((response) => response.json())
      .then((json: { configured?: boolean }) => setOauthReady(Boolean(json.configured)))
      .catch(() => setOauthReady(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    const googleStaff = visiblePeople.filter((person) => {
      const account = accountForStaff(crm.calendarAccounts, person.id);
      return selected.includes(person.id) && account.linked && account.source === "google";
    });
    if (googleStaff.length === 0 || !rangeStart) return;
    let cancelled = false;
    void Promise.all(
      googleStaff.map((person) =>
        fetch(
          `/api/google/calendar/events?staffId=${encodeURIComponent(person.id)}&timeMin=${encodeURIComponent(rangeStart.toISOString())}&timeMax=${encodeURIComponent(rangeEnd.toISOString())}`,
        )
          .then((response) => response.json())
          .then((json: { events?: GoogleOverlayEvent[] }) => json.events ?? [])
          .catch(() => [] as GoogleOverlayEvent[]),
      ),
    ).then((groups) => {
      if (!cancelled) setRemoteGoogle(groups.flat());
    });
    return () => {
      cancelled = true;
    };
  }, [crm.calendarAccounts, rangeEnd, rangeStart, selected, visiblePeople]);

  const overlayEvents = useMemo(() => {
    const demo = visiblePeople.flatMap((person) => {
      if (!selected.includes(person.id)) return [];
      const account = accountForStaff(crm.calendarAccounts, person.id);
      if (!account.linked || account.source === "google") return [];
      return demoGoogleEvents(person, rangeStart, rangeEnd);
    });
    return [...demo, ...remoteGoogle.filter((event) => selected.includes(event.staffId))];
  }, [crm.calendarAccounts, rangeEnd, rangeStart, remoteGoogle, selected, visiblePeople]);

  const selectedNames = new Set(
    visiblePeople.filter((person) => selected.includes(person.id)).map((person) => person.name),
  );

  const weekEvents = crm.events.filter((event) => {
    const day = localYmd(new Date(event.startsAt));
    if (day < localYmd(days[0]) || day > localYmd(days[6])) return false;
    if (selectedNames.size === 0) return true;
    return selectedNames.has(event.assignee);
  });

  if (!crm.hydrated) return <LoadingScreen />;

  const isAdmin = crm.viewer?.role === "company_admin" && !crm.impersonatedStaff;
  const myTeam = crm.book.teams.find((team) => team.id === viewer?.teamId);
  const shareCandidates = crm.book.staff.filter((member) => member.id !== viewer?.id);

  function togglePerson(id: string) {
    setHidden((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function quickCreate(input: {
    title: string;
    startsAt: string;
    endsAt: string;
    kind: EventKind;
  }) {
    try {
      await crm.addScheduleEvent({
        title: input.title,
        kind: input.kind,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        location: "",
        assignee: crm.user.name || viewer?.name || "",
        opportunityId: null,
        jobId: null,
        clientId: null,
        notes: "",
      });
      toast.success("Event added.");
    } catch {
      // Store already toasted.
    }
  }

  async function quickDelete(eventId: string) {
    try {
      await crm.deleteScheduleEvent(eventId);
      toast.success("Event deleted.");
    } catch {
      // Store already toasted.
    }
  }

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Field"
        title="Calendar"
        description="Click or drag on the week grid to add an event — same flow as Google Calendar. Linked Google calendars overlay as read-only."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous week"
              onClick={() => {
                const next = new Date(anchor);
                next.setDate(anchor.getDate() - 7);
                setAnchor(next);
              }}
            >
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(startOfWeek(new Date()))}>
              Today
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next week"
              onClick={() => {
                const next = new Date(anchor);
                next.setDate(anchor.getDate() + 7);
                setAnchor(next);
              }}
            >
              <ChevronRight />
            </Button>
            <Button
              onClick={() =>
                setCreateDraft({
                  day: today,
                  start: "09:00",
                  end: "10:00",
                })
              }
            >
              New event
            </Button>
          </div>
        }
      />

      <p className="text-sm text-muted-foreground">
        Week of {formatDate(localYmd(days[0]))} · {weekEvents.length} TheRoofingCRM ·{" "}
        {overlayEvents.length} Google
      </p>

      <div className="grid gap-4 xl:grid-cols-[18.5rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Your Google Calendar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mine?.linked ? (
                <>
                  <p className="text-sm">
                    Linked as <span className="font-medium">{mine.googleEmail}</span>
                    {mine.source === "demo" ? (
                      <span className="text-muted-foreground"> · demo</span>
                    ) : null}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void crm.disconnectCalendar()}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Connect the Google Calendar for this seat. Teammates only see it if you share it.
                  </p>
                  {oauthReady ? (
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={
                        <a href={`/api/google/calendar/connect?staffId=${encodeURIComponent(crm.user.staffId)}`} />
                      }
                    >
                      Connect Google Calendar
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void crm.linkDemoCalendar()}>
                      Link demo Google Calendar
                    </Button>
                  )}
                  {!oauthReady ? (
                    <p className="text-xs text-muted-foreground">
                      Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to connect real Google accounts.
                    </p>
                  ) : null}
                </>
              )}

              {viewer?.teamId ? (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={Boolean(mine?.shareWithTeam)}
                    disabled={!mine?.linked}
                    onCheckedChange={(checked) => void crm.setShareWithTeam(Boolean(checked))}
                  />
                  <span>
                    Share with {myTeam?.name ?? "my team"}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Everyone on this team can overlay your Google events.
                    </span>
                  </span>
                </label>
              ) : (
                <p className="text-xs text-muted-foreground">
                  You are not on a field team. Share with specific people below, or rely on company admin access.
                </p>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Also share with
                </p>
                {shareCandidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No one else to share with yet.</p>
                ) : (
                  shareCandidates.map((member) => {
                    const checked = crm.calendarShares.some(
                      (share) =>
                        share.ownerStaffId === viewer?.id && share.viewerStaffId === member.id,
                    );
                    return (
                      <label key={member.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          disabled={!mine?.linked}
                          onCheckedChange={(value) => void crm.setCalendarShare(member.id, Boolean(value))}
                        />
                        <span>{member.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>{isAdmin ? "Everyone’s calendars" : "Calendars you can see"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {visiblePeople.map((person) => {
                const account = accountForStaff(crm.calendarAccounts, person.id);
                const on = selected.includes(person.id);
                return (
                  <label key={person.id} className="flex items-start gap-2 rounded-sm px-1 py-1.5 hover:bg-muted/60">
                    <Checkbox checked={on} onCheckedChange={() => togglePerson(person.id)} />
                    <span
                      className="mt-1 size-2.5 shrink-0 rounded-full"
                      style={{ background: calendarColor(person.id) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{person.name}</span>
                        {account.linked ? (
                          <Badge variant="outline">Linked</Badge>
                        ) : (
                          <Badge variant="secondary">Not linked</Badge>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {account.linked && account.googleEmail ? `${account.googleEmail} · ` : ""}
                        {calendarShareSummary(
                          person,
                          account,
                          crm.calendarShares,
                          crm.book.staff,
                          crm.book.teams,
                        )}
                      </span>
                    </span>
                  </label>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <CalendarWeekGrid
          days={days}
          crmEvents={weekEvents}
          googleEvents={overlayEvents}
          todayKey={today}
          onQuickCreate={(input) => void quickCreate(input)}
          onQuickDelete={(id) => void quickDelete(id)}
          onEditEvent={(event) => setEditingEvent(event)}
          onCreateEvent={(draft) =>
            setCreateDraft({
              day: localYmd(draft.day),
              start: draft.start,
              end: draft.end,
              title: draft.title,
            })
          }
        />
      </div>

      <CreateEventDialog
        open={createDraft !== null}
        onOpenChange={(open) => {
          if (!open) setCreateDraft(null);
        }}
        defaultDay={createDraft?.day}
        defaultStart={createDraft?.start}
        defaultEnd={createDraft?.end}
        defaultTitle={createDraft?.title}
      />

      <CreateEventDialog
        open={editingEvent !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEvent(null);
        }}
        event={editingEvent}
      />
    </div>
  );
}
