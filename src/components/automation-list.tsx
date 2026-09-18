"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrm } from "@/lib/crm-store";
import { summarizeAutomation } from "@/lib/automations";
import { formatRelative } from "@/lib/format";
import type { AutomationTemplate } from "@/lib/automations";

export function AutomationList() {
  const crm = useCrm();
  const automations = crm.book.automations;
  const templates = crm.book.automationTemplates;
  const runs = crm.book.automationRuns;
  const [testingId, setTestingId] = useState<string | null>(null);
  const jobs = useMemo(
    () =>
      [...crm.jobs].sort((left, right) => (right.startDate ?? "").localeCompare(left.startDate ?? "")),
    [crm.jobs],
  );
  const [testJobId, setTestJobId] = useState(jobs[0]?.id ?? "");
  const testJob = jobs.find((job) => job.id === testJobId) ?? jobs[0];

  const stats = useMemo(() => {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const map = new Map<string, { recent: number; failed: number }>();
    for (const run of runs) {
      if (run.dryRun) continue;
      const bucket = map.get(run.automationId) ?? { recent: 0, failed: 0 };
      if (new Date(run.createdAt).getTime() >= since) bucket.recent += 1;
      if (run.status === "failed") bucket.failed += 1;
      map.set(run.automationId, bucket);
    }
    return map;
  }, [runs]);

  const showGallery = automations.length === 0 && templates.length > 0;

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Automations"
        description="When something happens in the book, do the next thing — a text, an email, a task, or a ping. Full create and edit is on the web. Phones can pause, resume, and confirm."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {jobs.length > 0 ? (
              <Select
                value={testJob?.id ?? ""}
                onValueChange={(value) => setTestJobId(String(value))}
                items={jobs.map((job) => ({
                  value: job.id,
                  label: `${job.code} · ${job.name}`,
                }))}
              >
                <SelectTrigger size="sm" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.code} · {job.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button nativeButton={false} render={<Link href="/settings/automations/new" />}>
              New automation
            </Button>
          </div>
        }
      />

      {showGallery ? (
        <TemplateGallery
          templates={templates}
          onAdd={async (template) => {
            const saved = await crm.saveAutomation({
              name: template.name,
              description: template.description,
              triggerKind: template.triggerKind,
              triggerConfig: template.triggerConfig,
              conditions: template.conditions,
              actions: template.actions.map((action) => ({ ...action, id: crypto.randomUUID() })),
              requiresConfirmation: template.requiresConfirmation,
              oncePerJob: template.oncePerJob,
              enabled: true,
            });
            if (saved) toast.success("Recipe added. Edit it to match your voice.");
          }}
        />
      ) : null}

      {automations.length === 0 && !showGallery ? (
        <EmptyState
          title="No automations yet"
          description="Build a When / If / Then rule, or start from a recipe."
          action={
            <Button nativeButton={false} render={<Link href="/settings/automations/new" />}>
              Create the first one
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {automations.map((automation) => {
            const bucket = stats.get(automation.id) ?? { recent: 0, failed: 0 };
            return (
              <li key={automation.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/settings/automations/${automation.id}`}
                    className="font-medium hover:underline"
                  >
                    {automation.name || "Untitled"}
                  </Link>
                  <p className="text-sm text-muted-foreground">{summarizeAutomation(automation)}</p>
                  <p className="text-xs text-muted-foreground">
                    {automation.lastFiredAt
                      ? `Last fired ${formatRelative(automation.lastFiredAt)}`
                      : "Has not fired yet"}
                    {bucket.recent ? ` · ${bucket.recent} run${bucket.recent === 1 ? "" : "s"} in 30 days` : ""}
                  </p>
                </div>
                {bucket.failed > 0 ? <Badge variant="destructive">{bucket.failed} failed</Badge> : null}
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={automation.enabled}
                    onCheckedChange={(value) => void crm.setAutomationEnabled(automation.id, value === true)}
                  />
                  {automation.enabled ? "On" : "Paused"}
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testingId === automation.id}
                  onClick={async () => {
                    if (!testJob) {
                      toast.error("Add a job first so we can dry-run against it.");
                      return;
                    }
                    setTestingId(automation.id);
                    const result = await crm.testAutomation(automation.id, testJob.id);
                    setTestingId(null);
                    if (result) toast.message(result);
                  }}
                >
                  Test
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href={`/settings/automations/${automation.id}/runs`} />}
                >
                  History
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TemplateGallery({
  templates,
  onAdd,
}: {
  templates: AutomationTemplate[];
  onAdd: (template: AutomationTemplate) => Promise<void>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {templates.map((template) => (
        <Card key={template.id}>
          <CardHeader>
            <CardTitle>{template.name}</CardTitle>
            <CardDescription>{template.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={() => void onAdd(template)}>
              Add this recipe
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
