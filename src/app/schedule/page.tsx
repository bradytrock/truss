"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreateEventDialog } from "@/components/create-ops-dialogs";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { EventKindBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatTime, localYmd, startOfWeek } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function SchedulePage() {
  const crm = useCrm();
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [createDay, setCreateDay] = useState<string | null>(null);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() + index);
      return date;
    });
  }, [anchor]);

  const today = localYmd(new Date());

  if (!crm.hydrated) return <LoadingScreen />;

  const weekEvents = crm.events.filter((event) => {
    const day = localYmd(new Date(event.startsAt));
    return day >= localYmd(days[0]) && day <= localYmd(days[6]);
  });

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        eyebrow="Field"
        title="Schedule"
        description="The week for walks, inspections, production, and owner meetings — not a full CPM, just what the desk and the trailer need to see together."
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnchor(startOfWeek(new Date()))}
            >
              This week
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
            <Button onClick={() => setCreateDay(today)}>New event</Button>
          </div>
        }
      />

      <p className="text-sm text-muted-foreground">
        Week of {formatDate(localYmd(days[0]))} · {weekEvents.length} events
      </p>

      {crm.events.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-5" />}
          title="Nothing on the calendar"
          description="Add a site walk, inspection, or OAC so the office and the field share one week."
          action={<Button onClick={() => setCreateDay(today)}>New event</Button>}
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-7">
          {days.map((date) => {
            const key = localYmd(date);
            const items = crm.events
              .filter((event) => localYmd(new Date(event.startsAt)) === key)
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            const isToday = key === today;
            return (
              <div key={key} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setCreateDay(key)}
                  className={cn(
                    "mb-2 flex w-full items-baseline justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                    isToday && "bg-primary/10 hover:bg-primary/15"
                  )}
                >
                  <span className="font-medium">
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className="text-xs text-muted-foreground">{date.getDate()}</span>
                </button>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setCreateDay(key)}
                      className="w-full rounded-lg border border-dashed px-2 py-6 text-xs text-muted-foreground hover:bg-muted/50"
                    >
                      Add
                    </button>
                  ) : (
                    items.map((event) => {
                      const job = event.jobId ? crm.getJob(event.jobId) : undefined;
                      const opportunity = event.opportunityId
                        ? crm.getOpportunity(event.opportunityId)
                        : undefined;
                      return (
                        <Card key={event.id} size="sm" className="shadow-none">
                          <CardContent className="space-y-1.5 p-2.5">
                            <EventKindBadge kind={event.kind} />
                            <p className="text-sm leading-snug font-medium">{event.title}</p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {formatTime(event.startsAt)}–{formatTime(event.endsAt)}
                            </p>
                            <p className="text-xs text-muted-foreground">{event.assignee}</p>
                            {job ? (
                              <Link
                                href={`/jobs/${job.id}`}
                                className="block truncate text-xs text-primary hover:underline"
                              >
                                {job.name}
                              </Link>
                            ) : opportunity ? (
                              <Link
                                href={`/opportunities/${opportunity.id}`}
                                className="block truncate text-xs text-primary hover:underline"
                              >
                                {opportunity.name}
                              </Link>
                            ) : null}
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateEventDialog
        open={createDay !== null}
        onOpenChange={(open) => setCreateDay(open ? createDay ?? today : null)}
        defaultDay={createDay ?? undefined}
      />
    </div>
  );
}
