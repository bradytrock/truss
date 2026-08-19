"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { JobsBoard } from "@/components/jobs-board";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency } from "@/lib/format";

export default function JobsPage() {
  const crm = useCrm();
  const [query, setQuery] = useState("");

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
        description="Sold work in the field. Drag a card when the job moves — codes stay with the record from the first lead."
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
      <JobsBoard query={query} />
    </div>
  );
}
