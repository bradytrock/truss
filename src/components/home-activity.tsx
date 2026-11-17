"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BadgeCheck,
  Eye,
  House,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Receipt,
  Send,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import {
  HOME_ACTIVITY_LIMIT,
  selectHomeActivity,
  type HomeActivityDay,
  type HomeActivityEvent,
  type HomeActivityFeed,
  type HomeActivityFilter,
  type HomeActivityGroup,
  type HomeActivityIcon,
} from "@/lib/home-activity";
import { digitsOnly } from "@/lib/phone";
import { copyText, shareUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ id: HomeActivityFilter; label: string; count: keyof HomeActivityFeed["counts"] }> = [
  { id: "all", label: "All", count: "all" },
  { id: "proposals", label: "Proposals", count: "proposals" },
  { id: "messages", label: "Messages", count: "messages" },
  { id: "expenses", label: "Expenses", count: "expenses" },
];

const ICON: Record<HomeActivityIcon, LucideIcon> = {
  opened: Eye,
  sent: Send,
  signed: BadgeCheck,
  declined: X,
  text: MessageSquare,
  email: Mail,
  call: Phone,
  work: MapPin,
};

const ICON_CLASS: Record<HomeActivityIcon, string> = {
  opened: "bg-[#e7f6ea] text-[#3f8f4a]",
  sent: "bg-[#eef0fd] text-[#474fcf]",
  signed: "bg-[#e7f6ea] text-[#3f8f4a]",
  declined: "bg-[#fde8e6] text-[#c43832]",
  text: "bg-[#eef0fd] text-[#474fcf]",
  email: "bg-[#eef0fd] text-[#474fcf]",
  call: "bg-[#eef0fd] text-[#474fcf]",
  work: "bg-[#f3f4f6] text-[#4e5460]",
};

export function HomeActivity({ feed }: { feed: HomeActivityFeed }) {
  const [filter, setFilter] = useState<HomeActivityFilter>("all");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState<HomeActivityFilter>("all");
  const [mode, setMode] = useState<"date" | "range">("date");
  const [day, setDay] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const preview = selectHomeActivity(feed, { filter, limit: HOME_ACTIVITY_LIMIT });
  const archive = selectHomeActivity(feed, {
    filter: archiveFilter,
    from: mode === "date" ? day : from,
    to: mode === "date" ? day : to,
  });
  const more = preview.total > preview.shown;

  function openArchive(next: HomeActivityFilter) {
    setFilter(next);
    setArchiveFilter(next);
    setArchiveOpen(true);
  }

  return (
    <section id="recent-activity" className="rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
      <div className="px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
            Recent activity
            <span className="inline-flex items-center gap-1 rounded-full bg-[#f2fcf4] px-2 py-0.5 text-[12px] font-medium text-[#3f613a]">
              <span className="size-1.5 rounded-full bg-[#649d56]" />
              Live
            </span>
          </h2>
          <button type="button" onClick={() => openArchive("all")} className="shrink-0 text-[13px] font-medium text-[#474fcf] hover:underline">
            View all
          </button>
        </div>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Calls, texts, inspections and job progress</p>
        <div className="mt-3">
          <FilterChips value={filter} counts={feed.counts} onChange={setFilter} />
        </div>
      </div>

      <div className="px-4 pt-4 pb-2">
        <ActivitySections days={preview.days} empty={feed.counts.all === 0 ? "Nothing logged yet." : "Nothing in this list."} />
      </div>

      {more ? (
        <div className="px-5 py-3 text-center">
          <button
            type="button"
            className="text-[13px] font-medium text-[#474fcf] hover:underline"
            onClick={() => openArchive(filter)}
          >
            See more
          </button>
        </div>
      ) : (
        <div className="h-4" />
      )}

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen} unsavedGuard={false}>
        <DialogContent className="sm:max-w-[34rem] [&_[data-slot=dialog-close]]:z-20">
          <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-4 bg-popover px-5 pt-5 pr-12 pb-3">
            <DialogHeader>
              <DialogTitle>Recent activity</DialogTitle>
              <DialogDescription>Pick a date or a range. Leave it blank to see every item.</DialogDescription>
            </DialogHeader>
            <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Date filter">
              <ModeChip active={mode === "date"} onClick={() => setMode("date")}>
                On a date
              </ModeChip>
              <ModeChip active={mode === "range"} onClick={() => setMode("range")}>
                Date range
              </ModeChip>
              {mode === "date" && day ? (
                <button type="button" className="px-2 text-[12.5px] font-medium text-[#474fcf] hover:underline" onClick={() => setDay("")}>
                  Clear
                </button>
              ) : null}
              {mode === "range" && (from || to) ? (
                <button
                  type="button"
                  className="px-2 text-[12.5px] font-medium text-[#474fcf] hover:underline"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            {mode === "date" ? (
              <label className="mt-3 block text-[12.5px] font-medium text-foreground">
                Date
                <Input type="date" value={day} max={feed.today} onChange={(event) => setDay(event.target.value)} className="mt-1" />
              </label>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block text-[12.5px] font-medium text-foreground">
                  From
                  <Input type="date" value={from} max={to || feed.today} onChange={(event) => setFrom(event.target.value)} className="mt-1" />
                </label>
                <label className="block text-[12.5px] font-medium text-foreground">
                  To
                  <Input type="date" value={to} min={from || undefined} max={feed.today} onChange={(event) => setTo(event.target.value)} className="mt-1" />
                </label>
              </div>
            )}
            <div className="mt-3">
              <FilterChips value={archiveFilter} counts={archive.counts} onChange={setArchiveFilter} />
            </div>
          </div>
          <ActivitySections days={archive.days} empty={archiveEmpty(feed, mode, day, from, to)} />
        </DialogContent>
      </Dialog>
    </section>
  );
}

function FilterChips({
  value,
  counts,
  onChange,
}: {
  value: HomeActivityFilter;
  counts: HomeActivityFeed["counts"];
  onChange: (id: HomeActivityFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Activity filters">
      {FILTERS.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12.5px]",
              active ? "bg-[#151826] text-white" : "bg-[#f3f4f6] text-[#3c414f] hover:bg-[#eceef1]",
            )}
          >
            <span className={active ? "font-medium" : undefined}>{item.label}</span>
            <span className={active ? "text-white/65" : "text-[#8b909a]"}>{counts[item.count]}</span>
          </button>
        );
      })}
    </div>
  );
}

function ModeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[12.5px]",
        active ? "bg-[#151826] font-medium text-white" : "bg-[#f3f4f6] text-[#3c414f] hover:bg-[#eceef1]",
      )}
    >
      {children}
    </button>
  );
}

function ActivitySections({ days, empty }: { days: HomeActivityDay[]; empty: string }) {
  if (days.length === 0) return <p className="px-1 py-6 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-4">
      {days.map((day) => (
        <div key={day.id}>
          <p className="px-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{day.label}</p>
          <div className="mt-2 space-y-3">
            {day.groups.map((group) => (
              <ActivityGroup key={group.id} group={group} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function archiveEmpty(feed: HomeActivityFeed, mode: "date" | "range", day: string, from: string, to: string) {
  if (feed.counts.all === 0) return "Nothing logged yet.";
  if (mode === "date" && day) return "Nothing on this date.";
  if (mode === "range" && (from || to)) return "Nothing in this range.";
  return "Nothing in this list.";
}

function ActivityGroup({ group }: { group: HomeActivityGroup }) {
  if (group.kind === "expenses") return <ExpenseGroup group={group} />;
  return (
    <article className="rounded-[14px] border border-black/[0.06] bg-white">
      {group.kind === "property" ? <PropertyHeader group={group} /> : null}
      <div className={cn("px-3.5 pb-3.5", group.kind === "property" ? "pt-3" : "pt-3.5")}>
        <ol>
          {group.events.map((event, index) => (
            <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < group.events.length - 1 ? (
                <span className="absolute top-8 bottom-0 left-4 w-px bg-[#e6e8ee]" />
              ) : null}
              <EventIcon icon={event.icon} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14px] font-semibold tracking-tight text-foreground">{event.title}</p>
                  {event.when ? <span className="shrink-0 pt-0.5 text-[12.5px] text-muted-foreground">{event.when}</span> : null}
                </div>
                {event.detail ? <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{event.detail}</p> : null}
                {event.deliveries.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {event.deliveries.map((delivery) => (
                      <li key={delivery.id} className="flex items-start gap-2 text-[13px]">
                        {delivery.channel === "email" ? (
                          <Mail className="mt-0.5 size-3.5 shrink-0 text-[#474fcf]" />
                        ) : (
                          <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-[#474fcf]" />
                        )}
                        <span className="shrink-0 text-[#8b909a]">{delivery.channel === "email" ? "Email" : "Text"}</span>
                        <span className="min-w-0 flex-1 text-foreground">{deliveryValue(delivery.channel, delivery.value)}</span>
                        <span className={cn("shrink-0 font-medium", delivery.ok ? "text-[#4f7b46]" : "text-[#c43832]")}>{delivery.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {event.followUp ? <FollowUp event={event} /> : null}
                {event.proposalHref || event.shareToken ? (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-medium">
                    {event.proposalHref ? (
                      <Link href={event.proposalHref} className="text-[#474fcf] hover:underline">
                        View proposal
                      </Link>
                    ) : null}
                    {event.shareToken ? (
                      <button type="button" className="text-[#474fcf] hover:underline" onClick={() => void copyShare(event.shareToken)}>
                        Copy share link
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

function PropertyHeader({ group }: { group: HomeActivityGroup }) {
  const proposalHref = group.events.find((event) => event.proposalHref)?.proposalHref;
  return (
    <div className="flex items-start gap-3 px-3.5 pt-3.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eef0fd] text-[#5c56c9]">
        <House className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {group.href ? (
          <Link href={group.href} className="block text-[14.5px] font-semibold tracking-tight text-foreground hover:underline">
            {group.title}
          </Link>
        ) : (
          <p className="text-[14.5px] font-semibold tracking-tight text-foreground">{group.title}</p>
        )}
        {group.place ? <p className="text-[12.5px] text-muted-foreground">{group.place}</p> : null}
      </div>
      {group.badge ? (
        proposalHref ? (
          <Link href={proposalHref} className="shrink-0 rounded-md bg-[#f0f2fe] px-2 py-0.5 text-[12px] font-semibold text-[#3f349c] hover:underline">
            {group.badge}
          </Link>
        ) : (
          <span className="shrink-0 rounded-md bg-[#f0f2fe] px-2 py-0.5 text-[12px] font-semibold text-[#3f349c]">{group.badge}</span>
        )
      ) : null}
    </div>
  );
}

function ExpenseGroup({ group }: { group: HomeActivityGroup }) {
  return (
    <article className="rounded-[14px] border border-black/[0.06] bg-white">
      <div className="flex items-start gap-3 px-3.5 py-3.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#fbf6e4] text-[#a8843d]">
          <Receipt className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {group.href ? (
            <Link href={group.href} className="block truncate text-[14.5px] font-semibold tracking-tight text-foreground hover:underline">
              {group.title}
            </Link>
          ) : (
            <p className="truncate text-[14.5px] font-semibold tracking-tight text-foreground">{group.title}</p>
          )}
          {group.jobCode ? <p className="text-[12.5px] text-muted-foreground">Job {group.jobCode}</p> : null}
        </div>
        <p className="shrink-0 text-[15px] font-semibold tracking-tight text-foreground tabular-nums">{formatMoney(group.expenseTotal)}</p>
      </div>
      <ul className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
        {group.events.map((event) => (
          <li key={event.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-foreground">{event.title}</p>
              {event.meta ? <p className="truncate text-[12.5px] text-muted-foreground">{event.meta}</p> : null}
            </div>
            <p className="shrink-0 text-[14px] font-semibold text-foreground tabular-nums">{formatMoney(event.amount ?? 0)}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

function EventIcon({ icon }: { icon: HomeActivityIcon }) {
  const Glyph = ICON[icon];
  return (
    <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full", ICON_CLASS[icon])}>
      <Glyph className="size-4" />
    </span>
  );
}

function FollowUp({ event }: { event: HomeActivityEvent }) {
  const phone = digitsOnly(event.phone);
  if (!phone && !event.textHref) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {phone ? (
        <a href={`tel:${phone}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#151826] px-3 text-[13px] font-medium text-white no-underline hover:bg-black">
          <Phone className="size-3.5" />
          Call
        </a>
      ) : null}
      {event.textHref ? (
        <Link href={event.textHref} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e6e7eb] bg-white px-3 text-[13px] font-medium text-[#151826] no-underline hover:bg-[#f7f7f8]">
          <MessageSquare className="size-3.5" />
          Text
        </Link>
      ) : phone ? (
        <a href={`sms:${phone}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e6e7eb] bg-white px-3 text-[13px] font-medium text-[#151826] no-underline hover:bg-[#f7f7f8]">
          <MessageSquare className="size-3.5" />
          Text
        </a>
      ) : null}
    </div>
  );
}

function deliveryValue(channel: "email" | "text", value: string) {
  if (channel !== "email") return value;
  const at = value.indexOf("@");
  if (at < 1) return value;
  return (
    <>
      {value.slice(0, at)}
      <wbr />@{value.slice(at + 1)}
    </>
  );
}

async function copyShare(token: string) {
  const ok = await copyText(shareUrl("e", token));
  if (ok) toast.success("Share link copied.");
  else toast.error("Couldn't copy the share link.");
}
