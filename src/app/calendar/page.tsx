"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { CalendarWeekGrid } from "@/components/calendar-week-grid";
import { CreateEventDialog } from "@/components/create-ops-dialogs";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  accountForStaff,
  calendarColor,
  calendarShareSummary,
  visibleCalendarStaff,
} from "@/lib/calendar";
import { useCrm } from "@/lib/crm-store";
import { formatDate, localYmd, startOfWeek } from "@/lib/format";
import { demoGoogleEvents, type GoogleOverlayEvent } from "@/lib/google-calendar-demo";
import type { EventKind, ScheduleEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

type CreateDraft = {
  day: string;
  start?: string;
  end?: string;
  title?: string;
};

type ViewMode = "day" | "week";

function preferDayView() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 900px)").matches;
}

export default function CalendarPage() {
  const crm = useCrm();
  const [view, setView] = useState<ViewMode>("week");
  const [viewReady, setViewReady] = useState(false);
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [dayAnchor, setDayAnchor] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [oauthReady, setOauthReady] = useState(false);
  const [remoteGoogle, setRemoteGoogle] = useState<GoogleOverlayEvent[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showDemoGoogle, setShowDemoGoogle] = useState(false);

  useEffect(() => {
    if (viewReady) return;
    if (preferDayView()) setView("day");
    setViewReady(true);
  }, [viewReady]);

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
    if (view === "day") return [dayAnchor];
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + index);
      return date;
    });
  }, [anchor, dayAnchor, view]);

  const today = localYmd(new Date());
  const rangeStart = days[0];
  const rangeEnd = useMemo(() => {
    const end = new Date(days[days.length - 1] ?? days[0]);
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
    if (googleStaff.length === 0 || !rangeStart) {
      setRemoteGoogle([]);
      return;
    }
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
    const demo = showDemoGoogle
      ? visiblePeople.flatMap((person) => {
          if (!selected.includes(person.id)) return [];
          const account = accountForStaff(crm.calendarAccounts, person.id);
          if (!account.linked || account.source === "google") return [];
          return demoGoogleEvents(person, rangeStart, rangeEnd);
        })
      : [];
    return [
      ...demo,
      ...remoteGoogle.filter((event) => selected.includes(event.staffId)),
    ];
  }, [
    crm.calendarAccounts,
    rangeEnd,
    rangeStart,
    remoteGoogle,
    selected,
    showDemoGoogle,
    visiblePeople,
  ]);

  const selectedNames = new Set(
    visiblePeople
      .filter((person) => selected.includes(person.id))
      .map((person) => person.name),
  );

  const weekEvents = crm.events.filter((event) => {
    const day = localYmd(new Date(event.startsAt));
    if (day < localYmd(days[0]) || day > localYmd(days[days.length - 1])) {
      return false;
    }
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

  function shift(delta: number) {
    if (view === "day") {
      const next = new Date(dayAnchor);
      next.setDate(dayAnchor.getDate() + delta);
      setDayAnchor(next);
      return;
    }
    const next = new Date(anchor);
    next.setDate(anchor.getDate() + delta * 7);
    setAnchor(next);
  }

  function goToday() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    setDayAnchor(now);
    setAnchor(startOfWeek(now));
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

  async function reschedule(input: {
    eventId: string;
    startsAt: string;
    endsAt: string;
  }) {
    try {
      await crm.updateScheduleEvent(input.eventId, {
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      });
    } catch {
      // Store already toasted.
    }
  }

  const rangeLabel =
    view === "day"
      ? formatDate(localYmd(dayAnchor))
      : `Week of ${formatDate(localYmd(days[0]))}`;

  return (
    <div className="space-y-4">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}

      <PageHeader
        eyebrow="Field"
        title="Calendar"
        description="Click an empty slot to schedule. Drag events to move them, or pull the bottom edge to resize."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={view} onValueChange={(value) => setView(value as ViewMode)}>
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={view === "day" ? "Previous day" : "Previous week"}
                onClick={() => shift(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="sm" onClick={goToday}>
                Today
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={view === "day" ? "Next day" : "Next week"}
                onClick={() => shift(1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="size-4" />
              Calendars
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          <span>
            {rangeLabel} · {weekEvents.length} scheduled
            {overlayEvents.length > 0 ? ` · ${overlayEvents.length} Google` : ""}
          </span>
          {mine?.linked ? (
            <Badge variant="outline">
              {mine.source === "google" ? "Google linked" : "Demo Google linked"}
            </Badge>
          ) : null}
        </div>
        <div className="flex max-w-full flex-wrap gap-1.5">
          {visiblePeople.map((person) => {
            const on = selected.includes(person.id);
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => togglePerson(person.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
                  on
                    ? "border-border bg-background text-foreground"
                    : "border-transparent bg-muted/60 text-muted-foreground line-through opacity-60",
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: calendarColor(person.id) }}
                />
                {person.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </div>

      <CalendarWeekGrid
        days={days}
        crmEvents={weekEvents}
        googleEvents={overlayEvents}
        todayKey={today}
        onQuickCreate={(input) => void quickCreate(input)}
        onQuickDelete={(id) => void quickDelete(id)}
        onReschedule={(input) => void reschedule(input)}
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

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Calendars & sharing</SheetTitle>
            <SheetDescription>
              Connect Google, choose who can see your calendar, and toggle people on the grid.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-4 pb-6">
            <section className="space-y-3">
              <h3 className="text-sm font-medium">Your Google Calendar</h3>
              {mine?.linked ? (
                <>
                  <p className="text-sm">
                    Linked as <span className="font-medium">{mine.googleEmail}</span>
                    {mine.source === "demo" ? (
                      <span className="text-muted-foreground"> · demo</span>
                    ) : null}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void crm.disconnectCalendar()}
                  >
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
                        <a
                          href={`/api/google/calendar/connect?staffId=${encodeURIComponent(crm.user.staffId)}`}
                        />
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

              {mine?.linked && mine.source === "demo" ? (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={showDemoGoogle}
                    onCheckedChange={(checked) => setShowDemoGoogle(Boolean(checked))}
                  />
                  <span>
                    Show demo Google events on the grid
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Off by default so sample personal events do not clutter the schedule.
                    </span>
                  </span>
                </label>
              ) : null}

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
                        share.ownerStaffId === viewer?.id &&
                        share.viewerStaffId === member.id,
                    );
                    return (
                      <label key={member.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          disabled={!mine?.linked}
                          onCheckedChange={(value) =>
                            void crm.setCalendarShare(member.id, Boolean(value))
                          }
                        />
                        <span>{member.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">
                {isAdmin ? "Everyone’s calendars" : "Calendars you can see"}
              </h3>
              {visiblePeople.map((person) => {
                const account = accountForStaff(crm.calendarAccounts, person.id);
                const on = selected.includes(person.id);
                return (
                  <label
                    key={person.id}
                    className="flex items-start gap-2 rounded-sm px-1 py-1.5 hover:bg-muted/60"
                  >
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
                        {account.linked && account.googleEmail
                          ? `${account.googleEmail} · `
                          : ""}
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
            </section>
          </div>
        </SheetContent>
      </Sheet>

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
