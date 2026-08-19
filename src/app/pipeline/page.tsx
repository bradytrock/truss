"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { PipelineBoard } from "@/components/pipeline-board";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { CreateOpportunityDialog } from "@/components/create-records";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency } from "@/lib/format";

export default function PipelinePage() {
  const crm = useCrm();
  const [query, setQuery] = useState("");
  const [create, setCreate] = useState(false);

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
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by code, project, homeowner, or city"
              className="w-full sm:w-72"
            />
            <Button onClick={() => setCreate(true)}>New lead</Button>
          </div>
        }
      />
      <p className="text-sm text-muted-foreground">
        {open.length} open leads · {formatCurrency(pipelineValue)} unweighted
      </p>
      <PipelineBoard query={query} />
      <CreateOpportunityDialog open={create} onOpenChange={setCreate} />
    </div>
  );
}
