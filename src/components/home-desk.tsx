"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatCurrencyFull } from "@/lib/format";
import type { DeskAction, DeskBadge, HomeDeskModel, HomeDeskRow } from "@/lib/home-desk";
import { digitsOnly } from "@/lib/phone";
import { cn } from "@/lib/utils";

const PREVIEW = 6;

const BADGE_CLASS: Record<DeskBadge, string> = {
  CALLBACK: "bg-[#f4ecdf] text-[#8a5a24]",
  OVERDUE: "bg-[#f8e4de] text-[#9a3412]",
  CLOSEOUT: "bg-[#e5eef8] text-[#1d4f8a]",
  APPROVE: "bg-[#e4f3e8] text-[#1c6b3c]",
  PROPOSALS: "bg-[#f3e6f6] text-[#6d3486]",
  REVIEW: "bg-[#f1eee8] text-[#6a5e52]",
};

const BAR_CLASS: Record<HomeDeskModel["stages"][number]["tone"], string> = {
  ink: "bg-[#3a2e28]",
  rust: "bg-[#8d3d32]",
  gold: "bg-[#c4a15a]",
  quiet: "bg-[#e4ddd4]",
};

type FilterId = "all" | "calls" | "reviews" | "money";

export function HomeDesk({
  desk,
  busyId,
  onCompleteTask,
  onClearRow,
  onReturning,
  onJobCode,
}: {
  desk: HomeDeskModel;
  busyId?: string | null;
  onCompleteTask: (taskId: string) => void;
  onClearRow: (row: { id: string; title: string; relatedId: string }) => void;
  onReturning: (noticeId: string, decision: "take" | "decline" | "dismiss" | "reassigned" | "kept") => void;
  onJobCode: (jobId: string, decision: "redo" | "keep" | "change", code?: string) => void;
}) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [expanded, setExpanded] = useState(false);
  const [changingJobId, setChangingJobId] = useState<string | null>(null);
  const [changeCode, setChangeCode] = useState("");
  const filtered = desk.rows.filter((row) => filter === "all" || row.buckets.includes(filter));
  const visible = expanded ? filtered : filtered.slice(0, PREVIEW);
  const hidden = filtered.slice(PREVIEW);
  const maxStage = Math.max(...desk.stages.map((stage) => stage.value), 1);

  function choose(next: FilterId) {
    setFilter(next);
    setExpanded(false);
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="flex items-center gap-1.5 text-[13px] text-[#8a8178]">
          <Sparkles className="size-3.5 text-[#8a3d32]" />
          {desk.briefLabel}
        </p>
        <h1 className="mt-1 font-heading text-[2.35rem] leading-none font-normal tracking-tight text-[#1c1917] sm:text-[2.7rem]">
          {desk.greeting}
        </h1>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.82fr)]">
        <section className="rounded-2xl bg-white shadow-[0_0_0_1px_rgba(28,25,22,0.06)]">
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-[15px] font-semibold tracking-tight text-[#1c1917]">Needs you today</h2>
            <p className="mt-0.5 text-[13px] text-[#8a8178]">
              Callbacks, overdue tasks, reviews and approvals — most urgent first.
            </p>
            <div className="mt-3 inline-flex flex-wrap rounded-full bg-[#f3f0ea] p-0.5 text-[12.5px]">
              <FilterChip active={filter === "all"} onClick={() => choose("all")}>
                All {desk.counts.all}
              </FilterChip>
              <FilterChip active={filter === "calls"} onClick={() => choose("calls")}>
                Calls {desk.counts.calls}
              </FilterChip>
              <FilterChip active={filter === "reviews"} onClick={() => choose("reviews")}>
                Reviews {desk.counts.reviews}
              </FilterChip>
              <FilterChip active={filter === "money"} onClick={() => choose("money")}>
                Money {desk.counts.money}
              </FilterChip>
            </div>
          </div>
          {visible.length === 0 ? (
            <p className="border-t border-black/5 px-5 py-8 text-sm text-[#8a8178]">Nothing in this list.</p>
          ) : (
            <ul>
              {visible.map((row) => (
                <li key={row.id} className="border-t border-black/5 px-4 py-3 sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <span
                      className={cn(
                        "w-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em]",
                        BADGE_CLASS[row.badge],
                      )}
                    >
                      {row.badge}
                    </span>
                    <div className="min-w-0 flex-1">
                      {row.titleHref ? (
                        <Link href={row.titleHref} className="block truncate text-[14px] font-semibold text-[#1c1917] hover:underline">
                          {row.title}
                        </Link>
                      ) : (
                        <p className="truncate text-[14px] font-semibold text-[#1c1917]">{row.title}</p>
                      )}
                      {row.detail ? <p className="truncate text-[12.5px] text-[#8a8178]">{row.detail}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span
                        className={cn(
                          "text-[12.5px]",
                          row.statusTone === "late" ? "font-medium text-[#9a3412]" : "text-[#8a8178]",
                        )}
                      >
                        {row.status}
                      </span>
                      <RowActions
                        row={row}
                        busyId={busyId}
                        onCompleteTask={onCompleteTask}
                        onClearRow={onClearRow}
                        onReturning={onReturning}
                        onJobCode={onJobCode}
                        changingJobId={changingJobId}
                        onStartChange={(jobId, suggested) => {
                          setChangingJobId(jobId);
                          setChangeCode(suggested);
                        }}
                      />
                    </div>
                  </div>
                  {changingJobId && row.actions.some((action) => action.type === "change-code" && action.jobId === changingJobId) ? (
                    <form
                      className="mt-2 flex flex-wrap items-center gap-2 sm:pl-[6.2rem]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!changeCode.trim()) return;
                        onJobCode(changingJobId, "change", changeCode.trim());
                        setChangingJobId(null);
                      }}
                    >
                      <Input
                        value={changeCode}
                        onChange={(event) => setChangeCode(event.target.value)}
                        aria-label="New job code"
                        className="h-8 w-40"
                      />
                      <button type="submit" className={solidButton} disabled={!changeCode.trim() || busyId === changingJobId}>
                        Save code
                      </button>
                      <button type="button" className={ghostButton} onClick={() => setChangingJobId(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-3 border-t border-black/5 px-5 py-3 text-[13px]">
            {hidden.length > 0 ? (
              <button type="button" className="font-medium text-[#8a3d32] hover:underline" onClick={() => setExpanded(true)}>
                Show {hidden.length} more{hidden.every((row) => row.badge === "CALLBACK") ? " callbacks" : ""}
              </button>
            ) : expanded && filtered.length > PREVIEW ? (
              <button type="button" className="font-medium text-[#8a8178] hover:underline" onClick={() => setExpanded(false)}>
                Show less
              </button>
            ) : (
              <span />
            )}
            <Link href="/tasks" className="text-[#8a8178] hover:text-[#1c1917] hover:underline">
              All tasks
            </Link>
          </div>
        </section>

        <TodayCard desk={desk} />
      </div>

      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#1c1917]">{desk.monthLabel}</h2>
          <Link href="/reports" className="text-[13px] font-medium text-[#8a3d32] hover:underline">
            Open reports
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Signed this month"
            value={formatCurrency(desk.signed.amount)}
            hint={`${desk.signed.count} contract${desk.signed.count === 1 ? "" : "s"}${desk.signed.count ? ` · avg ${formatCurrency(desk.signed.avg)}` : ""}`}
          >
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#efeae3]">
              <div className="h-full rounded-full bg-[#3a2e28]" style={{ width: `${desk.signed.percent}%` }} />
            </div>
            <p className="mt-2 text-[12.5px] text-[#8a8178]">
              {desk.signed.quota > 0 ? (
                <>
                  {desk.signed.percent}% of {formatCurrency(desk.signed.quota)} quota · {desk.signed.daysLeft} days left
                </>
              ) : (
                <Link href="/settings" className="font-medium text-[#8a3d32] hover:underline">
                  Set a monthly quota
                </Link>
              )}
            </p>
          </StatCard>
          <StatCard
            label="Proposals out"
            value={String(desk.proposals.count)}
            hint={desk.proposals.count ? `${formatCurrencyFull(desk.proposals.amount)} unsigned` : "Nothing waiting on a signature"}
          >
            {desk.proposals.count > 0 ? (
              <Link href="/estimates" className="mt-3 inline-block text-[13px] font-medium text-[#8a3d32] hover:underline">
                Nudge all {desk.proposals.count} →
              </Link>
            ) : null}
          </StatCard>
          <StatCard
            label="Open leads"
            value={String(desk.leads.count)}
            hint={desk.leads.value > 0 ? `${formatCurrencyFull(desk.leads.value)} estimated` : "No estimated value yet"}
          >
            {desk.leads.sources ? <p className="mt-3 text-[12.5px] text-[#8a8178]">{desk.leads.sources}</p> : null}
          </StatCard>
          <StatCard
            label="Active jobs"
            value={String(desk.jobs.count)}
            hint={`${desk.jobs.precon} precon · ${desk.jobs.inProgress} in progress · ${desk.jobs.punch} punch list`}
          >
            {desk.jobs.missingContract > 0 ? (
              <p className="mt-3 text-[12.5px] font-medium text-[#9a6230]">
                {desk.jobs.missingContract} missing a contract value
              </p>
            ) : (
              <p className="mt-3 text-[12.5px] text-[#8a8178]">Contract values are linked</p>
            )}
          </StatCard>
        </div>
      </section>

      <section className="rounded-2xl bg-white px-5 py-5 shadow-[0_0_0_1px_rgba(28,25,22,0.06)]">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-[#1c1917]">Pipeline by stage</h2>
            <p className="mt-0.5 text-[13px] text-[#8a8178]">
              Unweighted contract value. Jobs without a contract use their live proposal.
            </p>
          </div>
          <Link href="/jobs" className="shrink-0 text-[13px] font-medium text-[#8a3d32] hover:underline">
            Open board
          </Link>
        </div>
        <ul className="mt-4 space-y-2.5">
          {desk.stages.map((stage) => (
            <li key={stage.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-[13px] sm:grid-cols-[8.5rem_minmax(0,1fr)_6.5rem]">
              <span className="text-[#3f3a36]">{stage.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[#f3efe9]">
                <span
                  className={cn("block h-full rounded-full", stage.value > 0 ? BAR_CLASS[stage.tone] : "bg-transparent")}
                  style={{ width: stage.value > 0 ? `${Math.max(2, Math.round((stage.value / maxStage) * 100))}%` : "0%" }}
                />
              </span>
              <span className="text-right font-medium tabular-nums text-[#1c1917]">
                {formatCurrencyFull(stage.value)}
              </span>
            </li>
          ))}
        </ul>
        {desk.pipelineWarning ? (
          <div className="mt-4 flex flex-col gap-2 rounded-xl bg-[#fbf4e8] px-3 py-2.5 text-[13px] text-[#6d5330] sm:flex-row sm:items-center">
            <TriangleAlert className="size-4 shrink-0 text-[#b5812f]" />
            <p className="min-w-0 flex-1">{desk.pipelineWarning.text}</p>
            <Link href={desk.pipelineWarning.href} className="shrink-0 font-semibold text-[#8a3d32] hover:underline">
              {desk.pipelineWarning.action} →
            </Link>
          </div>
        ) : null}
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.8fr)]">
        <section className="rounded-2xl bg-white shadow-[0_0_0_1px_rgba(28,25,22,0.06)]">
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-[#1c1917]">Jobs needing attention</h2>
              <p className="mt-0.5 text-[13px] text-[#8a8178]">
                Missing data, possible duplicates and mismatches. Every job lives in Jobs.
              </p>
            </div>
            <Link href="/jobs" className="shrink-0 text-[13px] font-medium text-[#8a3d32] hover:underline">
              All jobs
            </Link>
          </div>
          {desk.attention.length === 0 ? (
            <p className="border-t border-black/5 px-5 py-8 text-sm text-[#8a8178]">No duplicates, missing addresses, or customer mismatches.</p>
          ) : (
            <div className="overflow-x-auto border-t border-black/5">
              <table className="w-full min-w-[40rem] text-left text-[13px]">
                <thead className="text-[10px] font-semibold tracking-[0.12em] text-[#8a8178] uppercase">
                  <tr>
                    <th className="px-5 py-2 font-semibold">Job</th>
                    <th className="px-2 py-2 font-semibold">Stage</th>
                    <th className="px-2 py-2 font-semibold">Issue</th>
                    <th className="px-2 py-2 font-semibold">PM</th>
                    <th className="px-5 py-2 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {desk.attention.map((row) => (
                    <tr key={row.id} className="border-t border-black/5 align-middle">
                      <td className="px-5 py-3">
                        <Link href={row.href} className="font-semibold text-[#1c1917] hover:underline">
                          {row.title}
                          {row.missingAddress ? <span className="font-medium text-[#9a3412]"> (no address)</span> : null}
                        </Link>
                        {row.code ? <div className="text-[12px] text-[#8a8178]">{row.code}</div> : null}
                      </td>
                      <td className="px-2 py-3">
                        <span className="inline-flex whitespace-nowrap rounded-full border border-black/10 px-2 py-0.5 text-[12px] text-[#3f3a36]">
                          {row.stage}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-[#9a3412]">{row.issue}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[#3f3a36]">{row.pm}</td>
                      <td className="px-5 py-3 text-right">
                        {row.action.type === "link" ? (
                          <Link href={row.action.href} className={ghostButton}>
                            {row.action.label}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white shadow-[0_0_0_1px_rgba(28,25,22,0.06)]">
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-[15px] font-semibold tracking-tight text-[#1c1917]">Recent activity</h2>
            <p className="mt-0.5 text-[13px] text-[#8a8178]">Calls, texts, inspections and job progress.</p>
          </div>
          {desk.activity.length === 0 ? (
            <p className="border-t border-black/5 px-5 py-8 text-sm text-[#8a8178]">Nothing logged yet.</p>
          ) : (
            <ul>
              {desk.activity.map((item) => (
                <li key={item.id} className="flex items-start gap-3 border-t border-black/5 px-5 py-3">
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      item.tone === "green" && "bg-[#3d8c5a]",
                      item.tone === "red" && "bg-[#9a3412]",
                      item.tone === "blue" && "bg-[#2f5f9e]",
                      item.tone === "gray" && "bg-[#b7b1a8]",
                    )}
                  />
                  <div className="min-w-0">
                    {item.href ? (
                      <Link href={item.href} className="block text-[13.5px] font-medium text-[#1c1917] hover:underline">
                        {item.title}
                      </Link>
                    ) : (
                      <p className="text-[13.5px] font-medium text-[#1c1917]">{item.title}</p>
                    )}
                    <p className="truncate text-[12.5px] text-[#8a8178]">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function TodayCard({ desk }: { desk: HomeDeskModel }) {
  return (
    <section className="rounded-2xl bg-white shadow-[0_0_0_1px_rgba(28,25,22,0.06)]">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-2">
        <h2 className="text-[15px] font-semibold tracking-tight text-[#1c1917]">Today</h2>
        <Link href="/calendar" className="text-[13px] font-medium text-[#8a3d32] hover:underline">
          Calendar
        </Link>
      </div>
      {desk.earlier.length > 0 ? (
        <div className="px-5 pt-2">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[#8a8178] uppercase">Earlier</p>
          <ul className="mt-2 space-y-3">
            {desk.earlier.map((event) => (
              <EventLine key={event.id} event={event} />
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mx-5 mt-4 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-[#9a3412]">
        <span className="size-1.5 rounded-full bg-[#c2412d]" />
        {desk.nowLabel}
      </p>
      {desk.upcoming.length > 0 ? (
        <ul className="mt-3 space-y-3 px-5">
          {desk.upcoming.map((event) => (
            <EventLine key={event.id} event={event} />
          ))}
        </ul>
      ) : null}
      {desk.laterNote ? (
        <p className="mx-5 mt-3 rounded-xl bg-[#f7f4ef] px-3 py-3 text-[13px] leading-relaxed text-[#6f675f]">
          {desk.laterNote}
        </p>
      ) : null}
      {desk.tomorrow.length > 0 ? (
        <div className="px-5 pt-4 pb-5">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[#8a8178] uppercase">{desk.tomorrowLabel}</p>
          <ul className="mt-2 space-y-3">
            {desk.tomorrow.map((item) => (
              <li key={item.id} className="grid grid-cols-[3.2rem_minmax(0,1fr)] gap-2">
                <span className="pt-0.5 text-[12px] text-[#8a8178]">{item.kind}</span>
                <div className="min-w-0">
                  <Link href={item.href} className="block text-[13.5px] font-medium text-[#1c1917] hover:underline">
                    {item.title}
                  </Link>
                  {item.detail ? <p className="text-[12.5px] text-[#8a8178]">{item.detail}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="h-4" />
      )}
    </section>
  );
}

function EventLine({
  event,
}: {
  event: HomeDeskModel["earlier"][number];
}) {
  return (
    <li className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-2">
      <span className="pt-0.5 text-[12.5px] font-medium whitespace-nowrap tabular-nums text-[#3f3a36]">{event.time}</span>
      <div className="min-w-0">
        <Link href={event.href} className="block truncate text-[13.5px] font-medium text-[#1c1917] hover:underline">
          {event.title}
        </Link>
        <p className="truncate text-[12.5px] text-[#8a8178]">
          {[event.place, event.duration].filter(Boolean).join(" · ")}
        </p>
      </div>
    </li>
  );
}

function StatCard({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-36 flex-col rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(28,25,22,0.06)]">
      <p className="text-[13px] text-[#8a8178]">{label}</p>
      <p className="mt-2 text-[2rem] leading-none font-semibold tracking-tight text-[#1c1917] tabular-nums">{value}</p>
      <p className="mt-1 text-[12.5px] text-[#8a8178]">{hint}</p>
      <div className="mt-auto">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1",
        active ? "bg-white font-medium text-[#1c1917] shadow-sm" : "text-[#6f675f] hover:text-[#1c1917]",
      )}
    >
      {children}
    </button>
  );
}

function RowActions({
  row,
  busyId,
  onCompleteTask,
  onClearRow,
  onReturning,
  onJobCode,
  changingJobId,
  onStartChange,
}: {
  row: HomeDeskRow;
  busyId?: string | null;
  onCompleteTask: (taskId: string) => void;
  onClearRow: (row: { id: string; title: string; relatedId: string }) => void;
  onReturning: (noticeId: string, decision: "take" | "decline" | "dismiss" | "reassigned" | "kept") => void;
  onJobCode: (jobId: string, decision: "redo" | "keep" | "change", code?: string) => void;
  changingJobId: string | null;
  onStartChange: (jobId: string, suggested: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {row.actions.map((action) => (
        <DeskButton
          key={actionKey(action)}
          action={action}
          busy={busyId != null && actionBusy(action, busyId)}
          hidden={action.type === "change-code" && changingJobId === action.jobId}
          onCompleteTask={onCompleteTask}
          onClearRow={onClearRow}
          onReturning={onReturning}
          onJobCode={onJobCode}
          onStartChange={onStartChange}
        />
      ))}
    </div>
  );
}

function DeskButton({
  action,
  busy,
  hidden,
  onCompleteTask,
  onClearRow,
  onReturning,
  onJobCode,
  onStartChange,
}: {
  action: DeskAction;
  busy: boolean;
  hidden: boolean;
  onCompleteTask: (taskId: string) => void;
  onClearRow: (row: { id: string; title: string; relatedId: string }) => void;
  onReturning: (noticeId: string, decision: "take" | "decline" | "dismiss" | "reassigned" | "kept") => void;
  onJobCode: (jobId: string, decision: "redo" | "keep" | "change", code?: string) => void;
  onStartChange: (jobId: string, suggested: string) => void;
}) {
  if (hidden) return null;
  const className = actionSolid(action) ? solidButton : ghostButton;
  if (action.type === "link") {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }
  if (action.type === "call") {
    return (
      <a href={`tel:${digitsOnly(action.phone)}`} className={solidButton}>
        {action.label}
      </a>
    );
  }
  if (action.type === "done") {
    return (
      <button type="button" className={ghostButton} disabled={busy} onClick={() => onCompleteTask(action.taskId)}>
        {busy ? "Saving…" : action.label}
      </button>
    );
  }
  if (action.type === "clear") {
    return (
      <button
        type="button"
        className={ghostButton}
        disabled={busy}
        onClick={() => onClearRow({ id: action.id, title: action.title, relatedId: action.relatedId })}
      >
        {busy ? "Saving…" : action.label}
      </button>
    );
  }
  if (action.type === "returning") {
    return (
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => onReturning(action.noticeId, action.decision)}
      >
        {busy ? "Saving…" : action.label}
      </button>
    );
  }
  if (action.type === "redo-code") {
    return (
      <button type="button" className={solidButton} disabled={busy} onClick={() => onJobCode(action.jobId, "redo", action.code)}>
        {busy ? "Saving…" : action.label}
      </button>
    );
  }
  if (action.type === "keep-code") {
    return (
      <button type="button" className={ghostButton} disabled={busy} onClick={() => onJobCode(action.jobId, "keep")}>
        {busy ? "Saving…" : action.label}
      </button>
    );
  }
  return (
    <button type="button" className={ghostButton} disabled={busy} onClick={() => onStartChange(action.jobId, action.suggested)}>
      {action.label}
    </button>
  );
}

function actionKey(action: DeskAction) {
  if (action.type === "link" || action.type === "call") return `${action.type}-${action.label}`;
  if (action.type === "done") return `done-${action.taskId}`;
  if (action.type === "clear") return `clear-${action.id}`;
  if (action.type === "returning") return `ret-${action.noticeId}-${action.decision}`;
  return `${action.type}-${action.jobId}`;
}

function actionBusy(action: DeskAction, busyId: string) {
  if (action.type === "done") return action.taskId === busyId;
  if (action.type === "clear") return action.id === busyId;
  if (action.type === "returning") return action.noticeId === busyId;
  if (action.type === "redo-code" || action.type === "keep-code" || action.type === "change-code") return action.jobId === busyId;
  return false;
}

function actionSolid(action: DeskAction) {
  return "solid" in action && Boolean(action.solid);
}

const solidButton =
  "inline-flex h-7 items-center rounded-lg bg-[#1c1917] px-2.5 text-[12.5px] font-medium whitespace-nowrap text-white no-underline hover:bg-black disabled:opacity-50";
const ghostButton =
  "inline-flex h-7 items-center rounded-lg border border-black/10 bg-white px-2.5 text-[12.5px] font-medium whitespace-nowrap text-[#1c1917] no-underline hover:bg-[#f6f4f0] disabled:opacity-50";
