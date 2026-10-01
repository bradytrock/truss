"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Phone, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { JobStatusBadge } from "@/components/status-badge";
import { formatCurrency, formatCurrencyFull, initials } from "@/lib/format";
import { digitsOnly } from "@/lib/phone";
import {
  avatarTone,
  loadBriefOpen,
  saveBriefOpen,
  sparklinePath,
  type HomeBrief,
  type HomeFocus,
} from "@/lib/home-today";
import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type HomeCallbackRow = {
  id: string;
  title: string;
  who: string;
  sub: string;
  daysLate: number;
  phone: string;
  href: string;
};

export type HomeJobRow = {
  id: string;
  name: string;
  who: string;
  code: string;
  location: string;
  status: JobStatus;
  contractValue: number;
};

export type HomeActivityRow = {
  id: string;
  title: string;
  sub: string;
  when: string;
};

export type HomeStageRow = {
  label: string;
  count: number;
  note: string;
};

export type HomeSourceShare = {
  label: string;
  pct: number;
};

export function HomeToday({
  staffId,
  brief,
  focus,
  signed,
  proposals,
  jobs,
  callbacks,
  activeJobs,
  stages,
  sources,
  closeRate,
  quota,
  activities,
  onCompleteTask,
  customize,
}: {
  staffId: string;
  brief: HomeBrief;
  focus: HomeFocus;
  signed: { amount: number; count: number; avg: number; spark: number[] };
  proposals: { count: number; hint: string };
  jobs: { count: number; precon: number; inProgress: number; missingContract: number };
  callbacks: HomeCallbackRow[];
  activeJobs: HomeJobRow[];
  stages: HomeStageRow[];
  sources: HomeSourceShare[];
  closeRate: number;
  quota: number;
  activities: HomeActivityRow[];
  onCompleteTask: (id: string) => void;
  customize: ReactNode;
}) {
  const [briefOpen, setBriefOpen] = useState(() => loadBriefOpen(staffId));

  function setOpen(open: boolean) {
    setBriefOpen(open);
    saveBriefOpen(staffId, open);
  }

  const maxStage = Math.max(...stages.map((stage) => stage.count), 1);
  const spark = sparklinePath(signed.spark);

  return (
    <div className="space-y-4">
      {briefOpen ? (
        <section className="relative overflow-hidden rounded-[20px] bg-[#fbfaf7] px-6 py-8 shadow-[0_0_0_1px_rgba(28,25,22,0.08)] sm:px-10">
          <button
            type="button"
            className="absolute top-4 right-4 grid size-8 place-items-center rounded-full text-[#6e6e73] hover:bg-[#f0efec]"
            aria-label="Dismiss brief"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </button>
          <p className="text-[13px] text-[#6e6e73]">{brief.dateLabel}</p>
          <h1 className="mt-1.5 font-serif text-[2.35rem] leading-[1.05] font-normal tracking-tight text-[#1d1d1f] sm:text-[2.75rem]">
            {brief.greet}
          </h1>
          <p className="mt-4 max-w-3xl font-serif text-lg leading-relaxed text-[#34322f] sm:text-xl">
            {brief.text}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {brief.actions.map((action) =>
              action.primary ? (
                <Button
                  key={action.label}
                  nativeButton={false}
                  className="rounded-lg bg-[#1d1d1f] text-white hover:bg-black"
                  render={<Link href={action.href} />}
                  onClick={() => {
                    if (action.href.startsWith("#")) setOpen(false);
                  }}
                >
                  {action.label}
                </Button>
              ) : (
                <Button
                  key={action.label}
                  nativeButton={false}
                  variant="outline"
                  className="rounded-lg border-[rgba(28,25,22,0.08)] bg-white"
                  render={<Link href={action.href} />}
                >
                  {action.label}
                  {action.count != null ? (
                    <span className="ml-1.5 rounded-full bg-[#f0efec] px-1.5 text-[12px] text-[#6e6e73]">
                      {action.count}
                    </span>
                  ) : null}
                </Button>
              ),
            )}
            <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-[#a1a1a6]">
              <Sparkles className="size-3.5 text-[#8a2f22]" />
              Cassio · this morning
            </span>
          </div>
        </section>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-[13px] text-[#6e6e73]">{brief.dateLabel}</p>
            <h1 className="text-[2.1rem] leading-none font-semibold tracking-tight text-[#1d1d1f]">
              {brief.greet.replace(/\.$/, "")}
            </h1>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#8a2f22]"
              onClick={() => setOpen(true)}
            >
              <Sparkles className="size-3.5" />
              Show today&apos;s brief
            </button>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">{customize}</div>
        </div>
      )}

      {briefOpen ? <div className="flex flex-wrap justify-end gap-2">{customize}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_1fr]">
        <div className="flex flex-col rounded-2xl bg-[#0e0b09] p-5 text-white">
          <p className="text-[13px] text-[#a8a19b]">{focus.label}</p>
          <p className="mt-1.5 text-[2.6rem] leading-none font-semibold tracking-tight tabular-nums">
            {focus.value}
          </p>
          <p className="mt-2 text-[13.5px] text-[#cfc9c3]">{focus.detail}</p>
          <div className="mt-4 flex">
            {focus.names.slice(0, 6).map((name) => (
              <HomeAvatar key={name} name={name} className="-ml-1.5 first:ml-0 border-2 border-[#0e0b09]" />
            ))}
          </div>
          <Button
            nativeButton={false}
            className="mt-auto w-fit rounded-lg bg-white text-[#1d1d1f] hover:bg-[#f5f5f3]"
            render={<Link href={focus.href} />}
          >
            {focus.action === "Start calling" ? <Phone data-icon="inline-start" /> : null}
            {focus.action}
          </Button>
        </div>
        <TodayStat label="Signed this month" value={formatCurrency(signed.amount)} hint={`${signed.count} contract${signed.count === 1 ? "" : "s"}${signed.count ? ` · avg ${formatCurrency(signed.avg)}` : ""}`}>
          {spark ? (
            <svg viewBox="0 0 140 36" className="h-9 w-full" preserveAspectRatio="none" aria-hidden="true">
              <path d={spark} fill="none" stroke="#13295b" strokeWidth="1.6" />
            </svg>
          ) : null}
        </TodayStat>
        <TodayStat
          label="Proposals out"
          value={String(proposals.count)}
          hint={proposals.hint}
          footer={
            proposals.count > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fbf1e1] px-2.5 py-0.5 text-xs font-medium text-[#9a5b0c]">
                <span className="size-1.5 rounded-full bg-current" />
                Follow up today
              </span>
            ) : (
              <span className="text-sm text-[#6e6e73]">None waiting</span>
            )
          }
        />
        <TodayStat
          label="Active jobs"
          value={String(jobs.count)}
          hint={`${jobs.precon} precon · ${jobs.inProgress} in progress`}
          footer={
            jobs.missingContract > 0 ? (
              <span className="inline-flex items-center gap-1 text-[12.5px] text-[#9a5b0c]">
                No contract values on {jobs.missingContract}
              </span>
            ) : (
              <span className="text-sm text-[#6e6e73]">Contract values are linked</span>
            )
          }
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <TodayCard
            id="home-callbacks"
            title="Callbacks"
            note="Oldest first"
            action={<Link href="/calendar" className="text-[13px] font-medium text-[#0a66d8]">All tasks</Link>}
          >
            {callbacks.length === 0 ? (
              <p className="px-5 py-8 text-sm text-[#6e6e73]">All caught up. No open callbacks.</p>
            ) : (
              callbacks.map((row) => (
                <div key={row.id} className="group flex items-center gap-3.5 px-5 py-3">
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => onCompleteTask(row.id)}
                    className="size-5 rounded-full"
                    aria-label={`Complete ${row.title}`}
                  />
                  <HomeAvatar name={row.who} />
                  <div className="min-w-0 flex-1">
                    <Link href={row.href} className="block truncate font-medium text-[#1d1d1f] hover:underline">
                      {row.title}
                    </Link>
                    <p className="truncate text-[12.5px] text-[#6e6e73]">{row.sub}</p>
                  </div>
                  {row.phone ? (
                    <a
                      href={`tel:${digitsOnly(row.phone)}`}
                      className="grid size-8 place-items-center rounded-lg text-[#1d1d1f] opacity-0 hover:bg-[#f0efec] group-hover:opacity-100"
                      aria-label={`Call ${row.who}`}
                    >
                      <Phone className="size-4" />
                    </a>
                  ) : null}
                  {row.daysLate > 0 ? (
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        row.daysLate >= 7 ? "bg-[#f7ebe8] text-[#8a2f22]" : "bg-[#fbf1e1] text-[#9a5b0c]",
                      )}
                    >
                      {row.daysLate}d late
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-[#a1a1a6]">Today</span>
                  )}
                </div>
              ))
            )}
          </TodayCard>

          <TodayCard
            title="Active jobs"
            note="Precon, production, punch"
            action={<Link href="/jobs" className="text-[13px] font-medium text-[#0a66d8]">View all</Link>}
          >
            {activeJobs.length === 0 ? (
              <p className="px-5 py-8 text-sm text-[#6e6e73]">No active jobs in your book.</p>
            ) : (
              activeJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs?job=${job.id}`}
                  className="flex items-center gap-3.5 px-5 py-3 hover:bg-[#faf9f7]"
                >
                  <HomeAvatar name={job.who} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[#1d1d1f]">{job.location || job.name}</p>
                    <p className="truncate text-[12.5px] text-[#6e6e73]">
                      {job.who} · {job.code}
                    </p>
                  </div>
                  <JobStatusBadge status={job.status} />
                  {job.contractValue > 0 ? (
                    <span className="w-[5.5rem] text-right text-[12.5px] tabular-nums text-[#6e6e73]">
                      {formatCurrency(job.contractValue)}
                    </span>
                  ) : (
                    <span className="w-[5.5rem] text-right text-[12.5px] text-[#9a5b0c]">No contract</span>
                  )}
                </Link>
              ))
            )}
          </TodayCard>
        </div>

        <div className="space-y-4">
          <TodayCard
            title="Pipeline"
            note={new Date().toLocaleDateString("en-US", { month: "long" })}
            action={<Link href="/pipeline" className="text-[13px] font-medium text-[#0a66d8]">Open</Link>}
          >
            <div className="space-y-3.5 px-5 pb-5">
              {stages.map((stage) => (
                <div key={stage.label}>
                  <div className="mb-1.5 flex justify-between text-[13.5px]">
                    <span>
                      <span className="font-semibold">{stage.label}</span>
                      <span className="text-[#a1a1a6]"> · {stage.note}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{stage.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#f0efec]">
                    <div
                      className="h-full rounded-full bg-[#13295b]"
                      style={{ width: `${Math.max(4, Math.round((stage.count / maxStage) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </TodayCard>

          <TodayCard title="Where work came from">
            <div className="px-5 pb-2">
              {sources.length === 0 ? (
                <p className="py-4 text-sm text-[#6e6e73]">No sourced closed-won this month.</p>
              ) : (
                <>
                  <div className="mt-1 flex h-2 gap-0.5 overflow-hidden rounded-full">
                    {sources.map((source, index) => (
                      <span
                        key={source.label}
                        className="h-full"
                        style={{
                          flex: Math.max(source.pct, 2),
                          background: index === 0 ? "#13295b" : index === 1 ? "#7fa3d9" : "#c5d4ea",
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-4 text-[13px] text-[#6e6e73]">
                    {sources.map((source, index) => (
                      <span key={source.label}>
                        <i
                          className="mr-1.5 inline-block size-2 rounded-[2px]"
                          style={{ background: index === 0 ? "#13295b" : index === 1 ? "#7fa3d9" : "#c5d4ea" }}
                        />
                        {source.label} {source.pct}%
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-px bg-[rgba(28,25,22,0.05)]">
              <div className="bg-white px-5 py-4">
                <p className="text-sm text-[#6e6e73]">Close rate</p>
                <p className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums">{closeRate}%</p>
              </div>
              <div className="bg-white px-5 py-4">
                <p className="text-sm text-[#6e6e73]">Monthly quota</p>
                {quota > 0 ? (
                  <p className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums">
                    {formatCurrencyFull(quota)}
                  </p>
                ) : (
                  <Link href="/settings" className="mt-2 inline-block text-[15px] font-medium text-[#0a66d8]">
                    Set a quota
                  </Link>
                )}
              </div>
            </div>
          </TodayCard>

          <TodayCard
            title="Recent activity"
            action={<Link href="/jobs" className="text-[13px] font-medium text-[#0a66d8]">All</Link>}
          >
            {activities.length === 0 ? (
              <p className="px-5 py-8 text-sm text-[#6e6e73]">Nothing logged since yesterday.</p>
            ) : (
              activities.map((item) => (
                <div key={item.id} className="flex items-center gap-3.5 px-5 py-3">
                  <HomeAvatar name={item.sub || item.title} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[#1d1d1f]">{item.title}</p>
                    <p className="truncate text-[12.5px] text-[#6e6e73]">{item.sub}</p>
                  </div>
                  <span className="text-[12.5px] text-[#a1a1a6]">{item.when}</span>
                </div>
              ))
            )}
          </TodayCard>
        </div>
      </div>
    </div>
  );
}

function TodayCard({
  id,
  title,
  note,
  action,
  children,
}: {
  id?: string;
  title: string;
  note?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(28,25,22,0.08),0_1px_2px_rgba(0,0,0,0.03)]"
    >
      <div className="flex items-baseline gap-2.5 px-5 pt-5 pb-1.5">
        <h3 className="text-base font-semibold tracking-tight text-[#1d1d1f]">{title}</h3>
        {note ? <span className="text-[13px] text-[#6e6e73]">{note}</span> : null}
        <span className="flex-1" />
        {action}
      </div>
      <div className="divide-y divide-[rgba(28,25,22,0.05)]">{children}</div>
    </section>
  );
}

function TodayStat({
  label,
  value,
  hint,
  footer,
  children,
}: {
  label: string;
  value: string;
  hint: string;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgba(28,25,22,0.08),0_1px_2px_rgba(0,0,0,0.03)]">
      <p className="text-[13px] text-[#6e6e73]">{label}</p>
      <p className="mt-2 text-[2.1rem] leading-none font-semibold tracking-tight tabular-nums text-[#1d1d1f]">
        {value}
      </p>
      <p className="mt-1 text-[13px] text-[#6e6e73]">{hint}</p>
      <div className="mt-auto pt-4">{footer ?? children}</div>
    </div>
  );
}

function HomeAvatar({ name, className }: { name: string; className?: string }) {
  const tone = avatarTone(name || "?");
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
        className,
      )}
      style={{ background: tone.bg, color: tone.fg }}
    >
      {initials(name) || "?"}
    </span>
  );
}
