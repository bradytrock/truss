"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { PipelineBoard } from "@/components/pipeline-board";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency } from "@/lib/format";

export default function PipelinePage() {
  const crm = useCrm();
  const [query, setQuery] = useState("");

  const open = crm.opportunities.filter(
    (opportunity) => opportunity.stage !== "awarded" && opportunity.stage !== "lost"
  );
  const pipelineValue = open.reduce((sum, opportunity) => sum + opportunity.value, 0);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        eyebrow="Preconstruction"
        title="Pipeline"
        description="Leads to sold jobs. Drag a card when a homeowner moves — sold work becomes a job automatically."
        actions={
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by project, homeowner, or city"
            className="w-full sm:w-72"
          />
        }
      />
      <p className="text-sm text-muted-foreground">
        {open.length} open leads · {formatCurrency(pipelineValue)} unweighted
      </p>
      <PipelineBoard query={query} />
    </div>
  );
}
