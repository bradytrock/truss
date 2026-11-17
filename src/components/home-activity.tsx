"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
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
import { formatMoney } from "@/lib/format";
import type { HomeActivityEvent, HomeActivityFeed, HomeActivityGroup, HomeActivityIcon } from "@/lib/home-activity";
import { digitsOnly } from "@/lib/phone";
import { copyText, shareUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

type ActivityFilter = "all" | "proposals" | "messages" | "expenses";

const FILTERS: Array<{ id: ActivityFilter; label: string; count: keyof HomeActivityFeed["counts"] }> = [
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
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [earlier, setEarlier] = useState(false);
  const sections = feed.days
    .map((day) => ({
      ...day,
      groups: day.groups.filter((group) => filter === "all" || group.bucket === filter),
    }))
    .filter((day) => day.groups.length > 0);
  const visible = earlier ? sections : sections.slice(0, 1);
  const hidden = sections.slice(1);

  function viewAll() {
    setFilter("all");
    setEarlier(true);
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
          <button type="button" onClick={viewAll} className="shrink-0 text-[13px] font-medium text-[#474fcf] hover:underline">
            View all
          </button>
        </div>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Calls, texts, inspections and job progress</p>
        <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Activity filters">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px]",
                  active ? "bg-[#151826] text-white" : "bg-[#f3f4f6] text-[#3c414f] hover:bg-[#eceef1]",
                )}
              >
                <span className={active ? "font-medium" : undefined}>{item.label}</span>
                <span className={active ? "text-white/65" : "text-[#8b909a]"}>{feed.counts[item.count]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted-foreground">
          {feed.counts.all === 0 ? "Nothing logged yet." : "Nothing in this list."}
        </p>
      ) : (
        <div className="space-y-4 px-4 pt-4 pb-2">
          {visible.map((day) => (
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
      )}

      {hidden.length > 0 ? (
        <div className="px-5 py-3 text-center">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#474fcf] hover:underline"
            aria-expanded={earlier}
            onClick={() => setEarlier((open) => !open)}
          >
            {earlier ? "Hide earlier activity" : "Show earlier activity"}
            <ChevronDown className={cn("size-4", earlier && "rotate-180")} />
          </button>
        </div>
      ) : (
        <div className="h-4" />
      )}
    </section>
  );
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
