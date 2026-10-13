"use client";

import { useState } from "react";
import { Calendar, ChevronDown, CloudRain, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateShort, initials } from "@/lib/format";
import { jobAddress } from "@/lib/job-record";
import { PROJECT_PIN_COLORS, workPinColor, workPinLabel } from "@/lib/project-map";
import { WORK_COLUMN_LABELS, WORK_COLUMNS, workColumnFor, type WorkColumn } from "@/lib/work-board";
import type { Job, Opportunity } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAGE_FILTERS: WorkColumn[] = WORK_COLUMNS.filter(
  (column) => column !== "on_hold" && column !== "unqualified" && column !== "lost" && column !== "deleted",
);

const AVATAR_TONES = [
  "bg-[#efe6f6] text-[#5b3d73]",
  "bg-[#eceae6] text-[#3f3d3a]",
  "bg-[#f6ebe3] text-[#7a4b32]",
  "bg-[#e7eef8] text-[#2f4d7a]",
  "bg-[#e7f3ec] text-[#1f5c3a]",
];

export type MapListSort = "recent" | "name";

export function sortMapJobs(jobs: Job[], sort: MapListSort) {
  const next = [...jobs];
  if (sort === "name") {
    next.sort((left, right) => mapJobTitle(left).localeCompare(mapJobTitle(right), undefined, { sensitivity: "base" }));
    return next;
  }
  next.sort((left, right) => mapJobUpdatedAt(right) - mapJobUpdatedAt(left));
  return next;
}

export function MapSearchBar({
  query,
  onQuery,
  years,
  year,
  onYear,
  stages,
  onToggleStage,
  onClearStages,
  stageCounts,
  totalCount,
  showCrew,
  onToggleCrew,
  showWeather,
  onToggleWeather,
  variant = "dock",
  className,
}: {
  query: string;
  onQuery: (value: string) => void;
  years: number[];
  year: number | "all";
  onYear: (value: number | "all") => void;
  stages: WorkColumn[];
  onToggleStage: (column: WorkColumn) => void;
  onClearStages: () => void;
  stageCounts: Partial<Record<WorkColumn, number>>;
  totalCount: number;
  showCrew: boolean;
  onToggleCrew: () => void;
  showWeather: boolean;
  onToggleWeather: () => void;
  variant?: "dock" | "overlay";
  className?: string;
}) {
  const [yearOpen, setYearOpen] = useState(false);
  const visibleStages = STAGE_FILTERS.filter(
    (column) => (stageCounts[column] ?? 0) > 0 || stages.includes(column),
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search name, address or job code"
          className="h-10 rounded-lg bg-background pl-8"
        />
      </label>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        <Popover open={yearOpen} onOpenChange={setYearOpen}>
          <PopoverTrigger
            type="button"
            className="border-input bg-background inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm shadow-sm"
          >
            <Calendar className="size-3.5" />
            {year === "all" ? "All years" : year}
            <ChevronDown className="size-3.5 opacity-60" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-1">
            {years.map((item) => (
              <PopoverClose
                key={item}
                type="button"
                className={cn(
                  "flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  year === item && "bg-muted font-medium",
                )}
                onClick={() => onYear(item)}
              >
                {item}
              </PopoverClose>
            ))}
            <PopoverClose
              type="button"
              className={cn(
                "flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                year === "all" && "bg-muted font-medium",
              )}
              onClick={() => onYear("all")}
            >
              All years
            </PopoverClose>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          aria-pressed={stages.length === 0}
          onClick={onClearStages}
          className={cn(
            "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-sm shadow-sm",
            stages.length === 0
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-input bg-background",
          )}
        >
          All {totalCount}
        </button>
        {visibleStages.map((column) => {
          const on = stages.includes(column);
          return (
            <button
              key={column}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleStage(column)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm shadow-sm",
                on ? "border-transparent bg-primary text-primary-foreground" : "border-input bg-background",
              )}
            >
              <span className="size-2 rounded-full" style={{ background: PROJECT_PIN_COLORS[column] }} />
              {WORK_COLUMN_LABELS[column]} {stageCounts[column] ?? 0}
            </button>
          );
        })}
        {variant === "overlay" ? (
          <>
            <Button
              type="button"
              size="sm"
              variant={showCrew ? "default" : "outline"}
              className="shrink-0 rounded-full shadow-sm"
              onClick={onToggleCrew}
            >
              <Users data-icon="inline-start" />
              Crew
            </Button>
            <Button
              type="button"
              size="sm"
              variant={showWeather ? "default" : "outline"}
              className="shrink-0 rounded-full shadow-sm"
              aria-pressed={showWeather}
              onClick={onToggleWeather}
            >
              <CloudRain data-icon="inline-start" />
              Weather
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function MapListToolbar({
  count,
  sort,
  onSort,
}: {
  count: number;
  sort: MapListSort;
  onSort: (sort: MapListSort) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <p className="text-xs text-muted-foreground">{count} {count === 1 ? "result" : "results"}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {sort === "recent" ? "Recently updated" : "Name"}
          <ChevronDown className="size-3.5 opacity-60" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          <SortOption
            label="Recently updated"
            selected={sort === "recent"}
            onSelect={() => {
              onSort("recent");
              setOpen(false);
            }}
          />
          <SortOption
            label="Name"
            selected={sort === "name"}
            onSelect={() => {
              onSort("name");
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SortOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <PopoverClose
      type="button"
      className={cn(
        "flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
        selected && "bg-muted font-medium",
      )}
      onClick={onSelect}
    >
      {label}
    </PopoverClose>
  );
}

export function MapJobResultList({
  jobs,
  opportunities,
  selectedJobId,
  onSelect,
}: {
  jobs: Job[];
  opportunities: Opportunity[];
  selectedJobId?: string | null;
  onSelect: (id: string) => void;
}) {
  if (jobs.length === 0) {
    return <p className="px-1 text-sm text-muted-foreground">No jobs match that search.</p>;
  }

  return (
    <ul className="space-y-2">
      {jobs.map((job) => {
        const opportunity = job.opportunityId
          ? opportunities.find((item) => item.id === job.opportunityId)
          : undefined;
        return (
          <li key={job.id}>
            <MapJobResultCard
              job={job}
              stage={workPinLabel(job, opportunity)}
              stageColor={workPinColor(job, opportunity)}
              selected={job.id === selectedJobId}
              onSelect={() => onSelect(job.id)}
            />
          </li>
        );
      })}
    </ul>
  );
}

function MapJobResultCard({
  job,
  stage,
  stageColor,
  selected,
  onSelect,
}: {
  job: Job;
  stage: string;
  stageColor: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const address = jobAddress(job);
  const title = mapJobTitle(job);
  const dateLabel = mapJobDateLabel(job);
  const mark = initials(title);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl bg-background px-3 py-3 text-left shadow-sm",
        selected ? "border-2 border-primary" : "border border-border",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          avatarTone(title),
        )}
      >
        {mark || "•"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-[#181818]">{title}</span>
          {dateLabel ? <span className="shrink-0 text-xs text-muted-foreground">{dateLabel}</span> : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{address || "No site yet"}</span>
        <span className="mt-2 flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
            <span className="size-1.5 rounded-full" style={{ background: stageColor }} />
            {stage}
          </span>
          {job.code ? <span className="truncate font-mono text-[11px] text-muted-foreground">{job.code}</span> : null}
        </span>
      </span>
    </button>
  );
}

function mapJobTitle(job: Job) {
  return job.name.trim() || jobAddress(job) || "Untitled";
}

function mapJobUpdatedAt(job: Job) {
  const raw = job.startDate || job.geocodedAt || job.substantialCompletion || "";
  const at = Date.parse(raw);
  return Number.isFinite(at) ? at : 0;
}

function mapJobDateLabel(job: Job) {
  const raw = job.startDate || job.geocodedAt || job.substantialCompletion || "";
  if (!raw) return "";
  const label = formatDateShort(raw);
  return label === "—" ? "" : label;
}

function avatarTone(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash] ?? AVATAR_TONES[0];
}

export function mapJobStage(
  job: Job,
  opportunities: Opportunity[],
) {
  const opportunity = job.opportunityId
    ? opportunities.find((item) => item.id === job.opportunityId)
    : undefined;
  return workColumnFor(job, opportunity);
}
