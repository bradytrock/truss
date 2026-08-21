"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { JobsBoard } from "@/components/jobs-board";
import { JobRecordWindow } from "@/components/job-window";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency } from "@/lib/format";
import { isBusinessDevelopment } from "@/lib/bd";

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

  const active = crm.jobs.filter((job) => job.status !== "complete");
  const bookValue = active.reduce((sum, job) => sum + job.contractValue, 0);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        eyebrow="Operations"
        title="Jobs"
        description={
          crm.viewer && isBusinessDevelopment(crm.viewer.role)
            ? "Jobs from your sourced leads and from the agents in your book — even after you assign the lead to a PM."
            : "Every open pipeline lead is already a job. Drag a card when production moves — codes stay with the record from the first lead."
        }
        actions={
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by code, homeowner, or city"
            className="w-full sm:w-72"
          />
        }
      />
      <p className="text-sm text-muted-foreground">
        {active.length} active jobs · {formatCurrency(bookValue)} under contract
      </p>
      <JobsBoard query={query} onSelectJob={selectJob} />
      {openJob ? <JobRecordWindow key={openJob.id} job={openJob} onClose={closeJob} /> : null}
    </div>
  );
}
