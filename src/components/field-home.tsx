"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChartColumn,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  Clock,
  Pencil,
  Phone,
  Ruler,
  Search,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { UserMenu } from "@/components/app-shell";
import { NotificationsMenu } from "@/components/notifications-menu";
import { FIELD, openFieldCreate, openFieldNote, openFieldSearch } from "@/lib/field-chrome";
import {
  buildFieldHome,
  fieldMoney,
  loadFieldForecast,
  tearOffNote,
  type FieldAttentionTask,
  type FieldForecastDay,
  type FieldPresence,
  type FieldSite,
} from "@/lib/field-home";
import { homeGoalScope, wonDeals } from "@/lib/home-dashboard";
import { mapsUrl } from "@/lib/job-record";
import { useCrm } from "@/lib/crm-store";
import { canViewReports } from "@/lib/visibility";
import { cn } from "@/lib/utils";

export function FieldHome() {
  const crm = useCrm();
  const model = useMemo(() => {
    const viewer = crm.effectiveStaff;
    const { ownerIds } = homeGoalScope(viewer, crm.staff);
    return buildFieldHome({
      staffName: viewer?.name || crm.user.name || "",
      staffId: viewer?.id || crm.user.staffId || "",
      events: crm.events,
      jobs: crm.jobs,
      opportunities: crm.opportunities,
      contacts: crm.contacts,
      tasks: crm.tasks,
      payments: crm.payments,
      messages: crm.messages,
      wonDeals: wonDeals({
        jobs: crm.jobs,
        estimates: crm.estimates,
        estimateLines: crm.estimateLines,
        opportunities: crm.opportunities,
        staff: crm.staff,
        ownerIds,
      }),
    });
  }, [
    crm.contacts,
    crm.effectiveStaff,
    crm.estimateLines,
    crm.estimates,
    crm.events,
    crm.jobs,
    crm.messages,
    crm.opportunities,
    crm.payments,
    crm.staff,
    crm.tasks,
    crm.user.name,
    crm.user.staffId,
  ]);

  const showReports = Boolean(crm.effectiveStaff && canViewReports(crm.effectiveStaff.role));
  const site = model.site;

  return (
    <div className="min-h-dvh bg-[#0c0c0e] text-white md:hidden">
      <div className="mx-auto flex w-full max-w-md flex-col px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-40">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.16em] text-white/45">{model.dateLabel}</p>
            <h1 className="mt-1 truncate text-[1.7rem] leading-none font-semibold tracking-tight">
              {model.greeting}, {model.firstName}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
            <UserMenu appearance="gear" />
            <NotificationsMenu tone="dark" />
          </div>
        </header>

        <button
          type="button"
          onClick={openFieldSearch}
          className="mt-4 flex h-11 w-full items-center gap-2.5 rounded-full bg-[#1c1c1f] px-4 text-left text-sm text-white/40"
        >
          <Search className="size-4 shrink-0" />
          Search contacts, jobs, addresses
        </button>

        {site && model.presence ? (
          <SiteBlock site={site} presence={model.presence} />
        ) : (
          <section className="mt-4 rounded-2xl bg-[#1c1c1f] px-4 py-6">
            <p className="text-lg font-semibold">No stop yet</p>
            <p className="mt-1 text-sm leading-relaxed text-white/55">
              The next lead or job shows up here with inspection, photos, and a call.
            </p>
            <button
              type="button"
              onClick={() => openFieldCreate({ kind: "opportunity" })}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold text-white"
              style={{ background: FIELD.red }}
            >
              New lead
            </button>
          </section>
        )}

        <FieldWeather site={site} />

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Needs attention</h2>
            <Link href="/tasks" className="text-[13px] font-medium" style={{ color: FIELD.red }}>
              All tasks
            </Link>
          </div>
          {model.attention.count === 0 ? (
            <p className="mt-3 rounded-2xl bg-[#1c1c1f] px-4 py-4 text-sm text-white/55">
              You&apos;re clear. Nothing is overdue.
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-3 rounded-2xl border-l-2 bg-[#1c1c1f] px-3.5 py-3" style={{ borderColor: FIELD.red }}>
                <Clock className="size-4 shrink-0 text-white/70" />
                <p className="min-w-0 flex-1 text-sm font-medium">
                  {model.attention.count} task{model.attention.count === 1 ? "" : "s"} overdue
                </p>
                <p className="shrink-0 text-xs text-white/45">
                  oldest {model.attention.oldestDays} day{model.attention.oldestDays === 1 ? "" : "s"}
                </p>
              </div>
              <ul className="mt-2 space-y-2">
                {model.attention.tasks.map((task) => (
                  <AttentionRow key={task.id} task={task} onToggle={() => void crm.toggleTask(task.id)} />
                ))}
              </ul>
              {model.attention.hidden > 0 ? (
                <Link href="/tasks" className="mt-3 flex items-center gap-1 text-sm text-white/70">
                  View {model.attention.hidden} more overdue
                  <ChevronRight className="size-4" />
                </Link>
              ) : null}
            </>
          )}
        </section>

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">{model.monthLabel} so far</h2>
            {showReports ? (
              <Link href="/reports" className="text-[13px] font-medium" style={{ color: FIELD.red }}>
                Reports
              </Link>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <StatCard
              label="Won"
              value={fieldMoney(model.wonAmount)}
              hint={`${model.wonCount} job${model.wonCount === 1 ? "" : "s"} signed`}
            />
            <StatCard
              label="Collected"
              value={fieldMoney(model.collectedAmount)}
              hint={`${model.collectedCount} invoice${model.collectedCount === 1 ? "" : "s"} paid`}
            />
          </div>
          <Link
            href="/jobs"
            className="mt-2 flex items-center gap-3 rounded-2xl bg-[#1c1c1f] px-3.5 py-3"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-[#2a2a2e] text-white/80">
              <ChartColumn className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-white/45">Open pipeline</span>
              <span className="mt-0.5 block text-[15px] font-semibold">
                {fieldMoney(model.pipelineAmount)}
                <span className="ml-1.5 text-[13px] font-normal text-white/45">
                  across {model.pipelineCount} lead{model.pipelineCount === 1 ? "" : "s"}
                </span>
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-white/35" />
          </Link>
        </section>

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Recent messages</h2>
            <Link href="/messages" className="text-[13px] font-medium" style={{ color: FIELD.red }}>
              Inbox
            </Link>
          </div>
          {model.messages.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-[#1c1c1f] px-4 py-4 text-sm text-white/55">No texts yet.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {model.messages.map((message) => (
                <li key={message.key}>
                  <Link href={message.href} className="flex items-center gap-3 rounded-2xl px-1 py-2 active:bg-white/5">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white"
                      style={{ background: FIELD.blue }}
                    >
                      {message.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{message.title}</span>
                        <span className="shrink-0 text-xs text-white/40">{message.when}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-white/45">{message.preview}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SiteBlock({ site, presence }: { site: FieldSite; presence: FieldPresence }) {
  return (
    <section className="mt-4">
      <a
        href={mapsUrl(site.address)}
        target="_blank"
        rel="noreferrer"
        className="relative block h-36 overflow-hidden rounded-2xl bg-[#1a332c]"
        aria-label={`Map for ${site.address}`}
      >
        <MapArt />
        <span className="absolute top-3 left-3 inline-flex max-w-[85%] items-center gap-2 rounded-full bg-black/50 px-2.5 py-1 text-[12px] text-white backdrop-blur-sm">
          <span
            className={cn("size-2 shrink-0 rounded-full", presence.tone === "live" && "shadow-[0_0_0_4px_rgba(61,220,132,0.28)]")}
            style={{ background: FIELD.green }}
          />
          <span className="truncate">
            <span className="font-medium">{presence.label}</span>
            {presence.detail ? <span className="text-white/75"> · {presence.detail}</span> : null}
          </span>
        </span>
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[70%]">
          <MapPin />
        </span>
      </a>

      <p className="mt-3 flex items-baseline gap-2">
        <span className="text-[11px] font-semibold tracking-[0.14em]" style={{ color: FIELD.green }}>
          {site.badge}
        </span>
        <span className="truncate text-[15px] font-semibold">{site.name}</span>
      </p>
      <h2 className="mt-1 text-[1.65rem] leading-tight font-semibold tracking-tight">{site.street}</h2>
      {site.locality ? <p className="mt-1 text-sm text-white/50">{site.locality}</p> : null}

      <Link
        href={site.jobId ? site.photosHref : site.href}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white"
        style={{ background: FIELD.red }}
      >
        <ClipboardCheck className="size-4" />
        Start inspection
      </Link>
      <div className="mt-2 grid grid-cols-4 gap-2">
        <QuickLink href={site.jobId ? site.photosHref : "/photos"} icon={Camera} label="Photos" />
        <QuickLink href={site.measureHref} icon={Ruler} label="Measure" />
        <QuickCall phone={site.phone} />
        <QuickNote site={site} />
      </div>
    </section>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Camera;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-2xl bg-[#1c1c1f] px-1 py-3 text-[11px] text-white/80"
    >
      <Icon className="size-[18px]" />
      {label}
    </Link>
  );
}

function QuickCall({ phone }: { phone: string }) {
  if (!phone) {
    return (
      <button
        type="button"
        onClick={() => toast.message("No phone number on this site.")}
        className="flex flex-col items-center gap-1.5 rounded-2xl bg-[#1c1c1f] px-1 py-3 text-[11px] text-white/80"
      >
        <Phone className="size-[18px]" />
        Call
      </button>
    );
  }
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
      className="flex flex-col items-center gap-1.5 rounded-2xl bg-[#1c1c1f] px-1 py-3 text-[11px] text-white/80"
    >
      <Phone className="size-[18px]" />
      Call
    </a>
  );
}

function QuickNote({ site }: { site: FieldSite }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!site.entityType || !site.entityId) {
          toast.message("This stop is not on a lead or job yet.");
          return;
        }
        openFieldNote({
          entityType: site.entityType,
          entityId: site.entityId,
          label: site.name,
        });
      }}
      className="flex flex-col items-center gap-1.5 rounded-2xl bg-[#1c1c1f] px-1 py-3 text-[11px] text-white/80"
    >
      <Pencil className="size-[18px]" />
      Note
    </button>
  );
}

function AttentionRow({ task, onToggle }: { task: FieldAttentionTask; onToggle: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-[#1c1c1f] px-3 py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Complete ${task.title}`}
        className="grid size-5 shrink-0 place-items-center rounded-full border border-white/25"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="mt-0.5 truncate text-xs text-white/45">
          {task.who}
          {task.daysLate > 0 ? (
            <span style={{ color: FIELD.red }}>
              {" "}
              · {task.daysLate} day{task.daysLate === 1 ? "" : "s"} overdue
            </span>
          ) : null}
        </p>
      </div>
      {task.action === "call" ? (
        <a
          href={`tel:${task.phone.replace(/[^\d+]/g, "")}`}
          className="shrink-0 rounded-full bg-[#2a2a2e] px-3 py-1.5 text-xs font-medium"
        >
          Call
        </a>
      ) : (
        <Link href={task.href} className="shrink-0 rounded-full bg-[#2a2a2e] px-3 py-1.5 text-xs font-medium">
          Open
        </Link>
      )}
    </li>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-[#1c1c1f] px-3.5 py-3">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-1 text-[1.65rem] leading-none font-semibold tracking-tight" style={{ color: FIELD.green }}>
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-white/40">{hint}</p>
    </div>
  );
}

function FieldWeather({ site }: { site: FieldSite | null }) {
  const place = [site?.city, site?.state].filter(Boolean).join(", ");
  const lat = site?.lat ?? null;
  const lng = site?.lng ?? null;
  if (!place && lat == null) return null;
  return <FieldWeatherBody key={`${lat ?? ""}|${lng ?? ""}|${place}`} lat={lat} lng={lng} place={place} />;
}

function FieldWeatherBody({
  lat,
  lng,
  place,
}: {
  lat: number | null;
  lng: number | null;
  place: string;
}) {
  const [days, setDays] = useState<FieldForecastDay[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadFieldForecast({ lat, lng, place })
      .then((next) => {
        if (cancelled) return;
        if (!next?.length) setFailed(true);
        else setDays(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng, place]);

  const note = days ? tearOffNote(days) : null;
  if (!days && !failed) return null;

  return (
    <section className="mt-4">
      {days ? (
        <div className="grid grid-cols-4 gap-2">
          {days.map((day) => (
            <div
              key={day.label + day.short}
              className={cn(
                "rounded-2xl px-1 py-3 text-center",
                day.emphasize ? "bg-[#2a2a2e]" : "bg-[#161618]",
              )}
            >
              <p className="text-[11px] text-white/55">{day.label}</p>
              <div className="mt-1.5 flex justify-center text-white/80">
                {day.icon === "cloud" ? <Cloud className="size-4" /> : <Sun className="size-4" />}
              </div>
              <p className="mt-1.5 text-[13px] font-semibold tabular-nums">
                {day.high}° <span className="font-normal text-white/40">{day.low}°</span>
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-[#161618] px-3 py-3 text-sm text-white/45">
          {failed ? "Weather is unavailable right now." : "Loading the forecast…"}
        </p>
      )}
      {note ? (
        <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-white/70">
          <Cloud className="mt-0.5 size-4 shrink-0 text-white/55" />
          {note}
        </p>
      ) : null}
    </section>
  );
}

function MapArt() {
  return (
    <svg viewBox="0 0 360 144" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect width="360" height="144" fill="#1a332c" />
      <path d="M0 36 H360" stroke="#2d6a50" strokeWidth="12" />
      <path d="M0 98 H360" stroke="#245743" strokeWidth="8" />
      <path d="M78 0 V144" stroke="#2a604c" strokeWidth="9" />
      <path d="M198 0 V144" stroke="#3c8a64" strokeWidth="16" />
      <path d="M286 0 V144" stroke="#245743" strokeWidth="7" />
      <path d="M20 18 C90 70 150 10 230 48" stroke="#4ea378" strokeWidth="2.5" fill="none" opacity="0.7" />
      <path d="M250 120 C290 80 320 130 360 90" stroke="#2f6b52" strokeWidth="3" fill="none" />
    </svg>
  );
}

function MapPin() {
  return (
    <svg viewBox="0 0 32 42" className="h-10 w-8 drop-shadow-[0_6px_8px_rgba(0,0,0,0.35)]" aria-hidden>
      <path
        d="M16 0C7.2 0 0 7.2 0 16c0 12 16 26 16 26s16-14 16-26C32 7.2 24.8 0 16 0z"
        fill={FIELD.red}
      />
      <circle cx="16" cy="15" r="5.5" fill="white" />
    </svg>
  );
}
