"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { JobsBoard } from "@/components/jobs-board";
import { JobRecordWindow } from "@/components/job-window";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { CreateOpportunityDialog } from "@/components/create-records";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency } from "@/lib/format";
import { isBusinessDevelopment } from "@/lib/bd";
import { acceptedAmountForJob } from "@/lib/estimate-totals";
import { workMarket } from "@/lib/market";
import { boardValue, workColumnFor } from "@/lib/work-board";
import { dedupeJobsByOpportunity, isDeletedJob } from "@/lib/job-record";

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
  const jobId = searchParams.get("job");
  const openJob = jobId ? crm.getJob(jobId) : undefined;

  const selectJob = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("job", id);
      router.replace(`/jobs?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const closeJob = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("job");
    params.delete("tab");
    const qs = params.toString();
    router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    if (!crm.hydrated || !jobId || openJob) return;
    closeJob();
  }, [closeJob, crm.hydrated, jobId, openJob]);

  const active = dedupeJobsByOpportunity(crm.jobs).filter((job) => {
    if (isDeletedJob(job)) return false;
    const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
    const column = workColumnFor(job, opportunity);
    return column !== "complete" && column !== "lost";
  });
  const bookValue = active.reduce((sum, job) => {
    const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
    const signed = acceptedAmountForJob(
      job,
      crm.estimates,
      crm.estimateLines,
      workMarket(job, opportunity),
    );
    return sum + boardValue(job, opportunity, signed);
  }, 0);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Operations"
        title="Jobs"
        description={
          crm.viewer && isBusinessDevelopment(crm.viewer.role)
            ? "Leads you sourced and work from the agents you brought in — one board from the first call through punch."
            : "One board from new lead through punch. Drag a card when the work moves. Codes stay with the record from day one."
        }
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by code, homeowner, or city"
              className="w-full sm:w-72"
            />
            <Button onClick={() => setCreate(true)}>New lead</Button>
          </div>
        }
      />
      <p className="text-sm text-muted-foreground">
        {active.length} open · {formatCurrency(bookValue)} on the board
      </p>
      <JobsBoard query={query} onSelectJob={selectJob} />
      {openJob ? <JobRecordWindow key={openJob.id} job={openJob} onClose={closeJob} /> : null}
      <CreateOpportunityDialog open={create} onOpenChange={setCreate} />
    </div>
  );
}
