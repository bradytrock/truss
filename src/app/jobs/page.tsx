"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { JobsBoard } from "@/components/jobs-board";
import { JobsOwnerFilter } from "@/components/jobs-owner-filter";
import { JobRecordWindow } from "@/components/job-window";
import { RecordErrorBoundary } from "@/components/record-error-boundary";
import { ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { CreateOpportunityDialog } from "@/components/create-records";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency } from "@/lib/format";
import { unweightedContractValue } from "@/lib/pipeline-path";
import { isShelvedWorkColumn, workColumnFor } from "@/lib/work-board";
import { dedupeJobsByOpportunity, isDeletedJob } from "@/lib/job-record";
import {
  JOBS_OWNERS_PARAM,
  canDeleteJobs,
  canFilterJobsByOwner,
  jobMatchesOwnerFilter,
  jobsOwnerFilterIds,
  parseJobsOwnerFilter,
  serializeJobsOwnerFilter,
  staffForJobsOwnerFilter,
} from "@/lib/visibility";

export default function JobsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <JobsBoardPage />
    </Suspense>
  );
}

function JobsBoardPage() {
  const crm = useCrm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [create, setCreate] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const jobId = searchParams.get("job");
  const openJob = jobId
    ? crm.getJob(jobId) ?? crm.book.jobs.find((job) => job.id === jobId)
    : undefined;
  const viewer = crm.effectiveStaff;
  const canFilterOwners = canFilterJobsByOwner(viewer);
  const people = useMemo(
    () => (viewer && canFilterOwners ? staffForJobsOwnerFilter(viewer, crm.book.staff) : []),
    [canFilterOwners, crm.book.staff, viewer],
  );
  const allowedOwnerIds = useMemo(() => jobsOwnerFilterIds(people), [people]);
  const ownerIds = useMemo(() => {
    if (!canFilterOwners) return undefined;
    return parseJobsOwnerFilter(searchParams.get(JOBS_OWNERS_PARAM), allowedOwnerIds);
  }, [allowedOwnerIds, canFilterOwners, searchParams]);

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
    },
    [router, searchParams],
  );

  const selectJob = useCallback(
    (id: string) => {
      replaceParams((params) => {
        params.set("job", id);
        params.delete("doc");
      });
    },
    [replaceParams],
  );

  const closeJob = useCallback(() => {
    replaceParams((params) => {
      params.delete("job");
      params.delete("tab");
      params.delete("doc");
    });
  }, [replaceParams]);

  const closeDoc = useCallback(() => {
    replaceParams((params) => {
      params.delete("doc");
      if (!params.get("tab")) params.set("tab", "files");
    });
  }, [replaceParams]);

  const setOwnerFilter = useCallback(
    (next: Set<string> | null) => {
      replaceParams((params) => {
        const serialized = serializeJobsOwnerFilter(next, allowedOwnerIds);
        if (serialized === null) params.delete(JOBS_OWNERS_PARAM);
        else params.set(JOBS_OWNERS_PARAM, serialized);
      });
    },
    [allowedOwnerIds, replaceParams],
  );

  useEffect(() => {
    if (!crm.hydrated || !jobId || openJob) return;
    const timer = window.setTimeout(() => {
      const found = crm.getJob(jobId) ?? crm.book.jobs.find((job) => job.id === jobId);
      if (!found) closeJob();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [closeJob, crm.book.jobs, crm.getJob, crm.hydrated, jobId, openJob]);

  const canTrash = canDeleteJobs(crm.viewer) && !crm.impersonatedStaff;
  const visibleJobs = dedupeJobsByOpportunity(crm.jobs ?? []).filter((job) => {
    if (isDeletedJob(job) && !canTrash) return false;
    const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
    return jobMatchesOwnerFilter(job, opportunity, ownerIds, crm.book.staff);
  });
  const active = visibleJobs.filter((job) => {
    const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
    const column = workColumnFor(job, opportunity);
    return column !== "complete" && !isShelvedWorkColumn(column);
  });
  const closedCount = visibleJobs.filter((job) => {
    const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
    return isShelvedWorkColumn(workColumnFor(job, opportunity));
  }).length;
  const bookValue = active.reduce((sum, job) => {
    const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
    return (
      sum +
      unweightedContractValue({
        job,
        opportunity,
        estimates: crm.estimates ?? [],
        lines: crm.estimateLines ?? [],
      })
    );
  }, 0);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-[1.35rem] leading-none font-semibold text-[#181818]">Jobs</h1>
          <p className="truncate text-sm text-[#706e6b]">
            {active.length} open · {formatCurrency(bookValue)} on the board
            {ownerIds ? " for the people you picked" : ""}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by code, homeowner, phone, or city"
            className="w-full sm:w-64"
          />
          {canFilterOwners ? (
            <JobsOwnerFilter people={people} selectedIds={ownerIds ?? null} onChange={setOwnerFilter} />
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="rounded-full bg-card"
            aria-pressed={showClosed}
            onClick={() => setShowClosed((open) => !open)}
          >
            {showClosed ? "Hide closed" : "Show closed"} ({closedCount})
          </Button>
          <Button onClick={() => setCreate(true)}>New lead</Button>
        </div>
      </div>
      <RecordErrorBoundary
        fallbackTitle="The board could not open"
        fallbackDescription="Reload the page. A single bad card should not keep Jobs hidden."
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <JobsBoard
            query={query}
            ownerIds={ownerIds}
            showClosed={showClosed}
            onSelectJob={selectJob}
          />
        </div>
      </RecordErrorBoundary>
      {openJob ? (
        <JobRecordWindow
          key={openJob.id}
          job={openJob}
          onClose={searchParams.get("doc") ? closeDoc : closeJob}
        />
      ) : null}
      <CreateOpportunityDialog open={create} onOpenChange={setCreate} />
    </div>
  );
}
