"use client";

import { Calendar, ChevronDown, Search, Tags, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import { jobAddress } from "@/lib/job-record";
import { PROJECT_PIN_COLORS, workPinColor, workPinLabel } from "@/lib/project-map";
import { primaryJobPhoto } from "@/lib/photo-trash";
import { WORK_COLUMN_LABELS, type WorkColumn } from "@/lib/work-board";
import type { Job, JobPhoto, Opportunity } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAGE_FILTERS: WorkColumn[] = [
  "lead",
  "estimating",
  "proposal_sent",
  "supplementing",
  "in_progress",
  "punch",
  "complete",
];

export function MapSearchBar({
  query,
  onQuery,
  years,
  year,
  onYear,
  stages,
  onToggleStage,
  showCrew,
  onToggleCrew,
  className,
}: {
  query: string;
  onQuery: (value: string) => void;
  years: number[];
  year: number | "all";
  onYear: (value: number | "all") => void;
  stages: WorkColumn[];
  onToggleStage: (column: WorkColumn) => void;
  showCrew: boolean;
  onToggleCrew: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search for an address"
          className="h-10 rounded-full bg-background pl-8 shadow-sm"
        />
      </label>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        <Popover>
          <PopoverTrigger
            type="button"
            className="border-input bg-background inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm"
          >
            <Calendar className="size-3.5" />
            {year === "all" ? "Date" : year}
            <ChevronDown className="size-3.5 opacity-60" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-1">
            {years.map((item) => (
              <button
                key={item}
                type="button"
                className={cn(
                  "flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  year === item && "bg-muted font-medium",
                )}
                onClick={() => onYear(item)}
              >
                {item}
              </button>
            ))}
            <button
              type="button"
              className={cn(
                "flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                year === "all" && "bg-muted font-medium",
              )}
              onClick={() => onYear("all")}
            >
              All years
            </button>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          size="sm"
          variant={showCrew ? "default" : "outline"}
          className="shrink-0 rounded-full"
          onClick={onToggleCrew}
        >
          <Users data-icon="inline-start" />
          Crew
        </Button>
        <Popover>
          <PopoverTrigger
            type="button"
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm",
              stages.length
                ? "bg-primary text-primary-foreground border-transparent"
                : "border-input bg-background",
            )}
          >
            <Tags className="size-3.5" />
            {stages.length ? `${stages.length} stages` : "Stage"}
            <ChevronDown className="size-3.5 opacity-60" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52 p-1">
            {STAGE_FILTERS.map((column) => {
              const on = stages.includes(column);
              return (
                <button
                  key={column}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => onToggleStage(column)}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: PROJECT_PIN_COLORS[column] }}
                  />
                  <span className="flex-1">{WORK_COLUMN_LABELS[column]}</span>
                  {on ? <span className="text-xs text-muted-foreground">On</span> : null}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function MapJobResultList({
  jobs,
  photos,
  opportunities,
  selectedJobId,
  onSelect,
}: {
  jobs: Job[];
  photos: JobPhoto[];
  opportunities: Opportunity[];
  selectedJobId?: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="px-1 pb-2 text-xs text-muted-foreground">{jobs.length} results</p>
      {jobs.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No jobs match that search.</p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => {
            const opportunity = job.opportunityId
              ? opportunities.find((item) => item.id === job.opportunityId)
              : undefined;
            return (
              <li key={job.id}>
                <MapJobResultCard
                  job={job}
                  photoUrl={primaryJobPhoto(photos, job)?.imageUrl ?? ""}
                  stage={workPinLabel(job, opportunity)}
                  stageColor={workPinColor(job, opportunity)}
                  selected={job.id === selectedJobId}
                  onSelect={() => onSelect(job.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MapJobResultCard({
  job,
  photoUrl,
  stage,
  stageColor,
  selected,
  onSelect,
}: {
  job: Job;
  photoUrl: string;
  stage: string;
  stageColor: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const address = jobAddress(job);
  const updated = job.startDate || job.geocodedAt || "";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border bg-background px-3 py-2.5 text-left shadow-sm",
        selected ? "border-foreground/40" : "border-border",
      )}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="size-12 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
          {job.code.slice(-2) || "•"}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{job.name || address || "Untitled"}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {address || "No site yet"}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {updated ? `Last updated ${formatDate(updated)}` : "No date yet"}
        </span>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
          <span className="size-1.5 rounded-full" style={{ background: stageColor }} />
          {stage}
          {job.code ? ` · ${job.code}` : ""}
        </span>
      </span>
    </button>
  );
}
