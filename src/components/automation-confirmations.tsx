"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCrm } from "@/lib/crm-store";
import { canManageAutomations } from "@/lib/visibility";

export function AutomationConfirmations() {
  const crm = useCrm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = crm.book.automationRuns.filter((run) => {
    if (run.status !== "pending_confirmation" || run.dryRun) return false;
    if (!crm.effectiveStaff) return false;
    if (canManageAutomations(crm.effectiveStaff.role, crm.effectiveStaff)) return true;
    const job = run.jobId ? crm.getJob(run.jobId) : undefined;
    return job?.ownerStaffId === crm.effectiveStaff.id;
  });
  if (pending.length === 0) return null;

  async function decide(id: string, action: "confirm" | "skip") {
    setBusyId(id);
    if (action === "confirm") await crm.confirmAutomationRun(id);
    else await crm.skipAutomationRun(id);
    setBusyId(null);
  }

  return (
    <Card className="rounded-sm border-[#c9c9c9] shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
      <CardHeader className="border-b border-[#c9c9c9] bg-[#f3f3f3]">
        <CardTitle className="font-sans text-sm font-semibold text-[#181818]">
          Automations waiting
        </CardTitle>
        <CardDescription>These texts or emails need a yes before they go out.</CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <ul className="divide-y">
          {pending.map((run) => {
            const job = run.jobId ? crm.getJob(run.jobId) : undefined;
            const rule = crm.book.automations.find((item) => item.id === run.automationId);
            const busy = busyId === run.id;
            return (
              <li key={run.id} className="py-3 first:pt-1">
                {job ? (
                  <Link href={`/jobs?job=${job.id}`} className="text-sm font-semibold text-[#0176d3] hover:underline">
                    {job.code} · {job.name}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold">{rule?.name || "Automation"}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">{rule?.name}</p>
                {run.renderedPreview ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm">{run.renderedPreview}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy} onClick={() => void decide(run.id, "confirm")}>
                    {busy ? "Sending…" : "Send"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide(run.id, "skip")}>
                    Skip
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
