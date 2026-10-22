"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useCrm } from "@/lib/crm-store";
import { formatDate } from "@/lib/format";
import type { AutomationRunStatus } from "@/lib/automations";

const STATUS_LABEL: Record<AutomationRunStatus, string> = {
  scheduled: "Scheduled",
  pending_confirmation: "Needs confirm",
  confirmed: "Confirmed",
  skipped: "Skipped",
  running: "Running",
  waiting_reply: "Waiting on a reply",
  sent: "Sent",
  failed: "Failed",
};

export function AutomationRuns({
  automationId,
  jobId,
  variant = "default",
}: {
  automationId?: string;
  jobId?: string;
  variant?: "default" | "activity";
}) {
  const crm = useCrm();
  const [query, setQuery] = useState("");
  const automation = automationId
    ? (crm.book.automations ?? []).find((item) => item.id === automationId)
    : undefined;
  const rows = useMemo(() => {
    return (crm.book.automationRuns ?? []).filter((run) => {
      if (automationId && run.automationId !== automationId) return false;
      if (jobId && run.jobId !== jobId) return false;
      if (!query.trim()) return true;
      const hay = `${run.renderedPreview} ${run.errorText} ${run.status} ${run.confirmedByName}`.toLowerCase();
      return hay.includes(query.trim().toLowerCase());
    });
  }, [automationId, crm.book.automationRuns, jobId, query]);

  if (variant === "activity") {
    if (rows.length === 0 && !query.trim()) return null;
    return (
      <div className="mt-4 space-y-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by message, person or status"
          className="h-9 rounded-lg bg-card"
        />
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs match that.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((run) => {
              const rule = (crm.book.automations ?? []).find((item) => item.id === run.automationId);
              const steps = rule?.actions.length ?? 0;
              return (
                <li key={run.id} className="rounded-[12px] border bg-muted/30 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Sparkles className="size-3.5 text-sky-600" />
                    <span className="text-sm font-medium">{rule?.name || "Automation"}</span>
                    <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>
                      {STATUS_LABEL[run.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(run.createdAt)}
                      {run.confirmedByName
                        ? ` · ${run.status === "skipped" ? "skipped" : "confirmed"} by ${run.confirmedByName}`
                        : ""}
                    </span>
                  </div>
                  {steps > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Step {Math.min(steps, (run.workflowCursor?.index ?? 0) + 1)} · {steps === 1 ? "1 step" : `${steps} steps`}
                    </p>
                  ) : null}
                  {run.renderedPreview ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">“{run.renderedPreview}”</p>
                  ) : null}
                  {run.errorText ? <p className="mt-1 text-xs text-muted-foreground">{run.errorText}</p> : null}
                  {run.status === "pending_confirmation" ? (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={() => void crm.confirmAutomationRun(run.id)}>
                        Send
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void crm.skipAutomationRun(run.id)}>
                        Skip
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className={jobId ? "space-y-3" : "max-w-4xl space-y-5"}>
      {jobId ? (
        <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Automations</p>
      ) : (
        <PageHeader
          eyebrow="Settings"
          title={automation?.name || "Run history"}
          description="Who confirmed or skipped, the rendered message, and what the provider said."
          actions={
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={automationId ? `/settings/automations/${automationId}` : "/settings/automations"} />}
            >
              Back
            </Button>
          }
        />
      )}
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter by message, person, or status"
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs match that.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((run) => {
            const job = run.jobId ? crm.getJob(run.jobId) : undefined;
            const rule = (crm.book.automations ?? []).find((item) => item.id === run.automationId);
            return (
              <li key={run.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>
                    {STATUS_LABEL[run.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</span>
                  {job && !jobId ? (
                    <Link href={`/jobs?job=${job.id}`} className="text-xs hover:underline">
                      {job.code}
                    </Link>
                  ) : null}
                  {rule && jobId ? (
                    <span className="text-xs text-muted-foreground">{rule.name}</span>
                  ) : null}
                </div>
                {run.renderedPreview ? (
                  <p className="whitespace-pre-wrap text-sm">{run.renderedPreview}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {run.confirmedByName
                    ? `${run.status === "skipped" ? "Skipped" : "Confirmed"} by ${run.confirmedByName}. `
                    : ""}
                  {run.deliveryStatus ? `${run.deliveryStatus}. ` : ""}
                  {run.errorText}
                </p>
                {run.status === "pending_confirmation" ? (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => void crm.confirmAutomationRun(run.id)}>
                      Send
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void crm.skipAutomationRun(run.id)}>
                      Skip
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
