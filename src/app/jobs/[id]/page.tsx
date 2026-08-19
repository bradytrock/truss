"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActivityComposer, ActivityList } from "@/components/activity";
import { RecordProperty } from "@/components/app-shell";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { JobStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate } from "@/lib/format";
import { JOB_STATUS_LABELS, JOB_STATUSES, TEAM, type JobStatus } from "@/lib/types";
import { toast } from "sonner";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const job = crm.getJob(id);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!job) {
    return (
      <EmptyState
        icon={<span className="text-sm font-medium">?</span>}
        title="Job not found"
        description="It may have been removed when demo data was reset."
        action={
          <Button nativeButton={false} render={<Link href="/jobs" />}>
            Back to jobs
          </Button>
        }
      />
    );
  }

  const client = crm.getClient(job.clientId);
  const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
  const activities = crm.activities.filter(
    (activity) =>
      (activity.entityType === "job" && activity.entityId === job.id) ||
      (job.opportunityId &&
        activity.entityType === "opportunity" &&
        activity.entityId === job.opportunityId)
  );
  const tasks = crm.tasks.filter(
    (task) => task.relatedType === "job" && task.relatedId === job.id
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Job
          </p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
            {job.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} />
            <span className="text-sm text-muted-foreground">
              {client ? (
                <Link href={`/clients/${client.id}`} className="hover:underline">
                  {client.name}
                </Link>
              ) : (
                "Unknown client"
              )}
              {" · "}
              {job.location}
            </span>
          </div>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {formatCurrencyFull(job.contractValue)}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Field snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Project manager</p>
                <p className="text-sm font-medium">{job.projectManager}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Superintendent</p>
                <p className="text-sm font-medium">{job.superintendent}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Substantial completion</p>
                <p className="text-sm font-medium">{formatDate(job.substantialCompletion)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ActivityComposer entityType="job" entityId={job.id} />
              <ActivityList
                items={activities}
                empty="No field notes yet. Log OAC outcomes or owner issues that preconstruction should see."
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Job details</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordProperty label="Status">
                <Select
                  value={job.status}
                  onValueChange={(value) => {
                    if (!value) return;
                    crm.updateJob(job.id, { status: value as JobStatus });
                    toast.success("Job status updated.");
                  }}
                  items={JOB_STATUSES.map((status) => ({
                    value: status,
                    label: JOB_STATUS_LABELS[status],
                  }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {JOB_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </RecordProperty>
              <RecordProperty label="Project manager">
                <Select
                  value={job.projectManager}
                  onValueChange={(value) => {
                    if (value) crm.updateJob(job.id, { projectManager: String(value) });
                  }}
                  items={TEAM.map((person) => ({ value: person, label: person }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM.map((person) => (
                      <SelectItem key={person} value={person}>
                        {person}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </RecordProperty>
              <RecordProperty label="Start">{formatDate(job.startDate)}</RecordProperty>
              <RecordProperty label="Came from">
                {opportunity ? (
                  <Link
                    href={`/opportunities/${opportunity.id}`}
                    className="text-primary hover:underline"
                  >
                    {opportunity.name}
                  </Link>
                ) : (
                  "Logged directly — not from this pipeline"
                )}
              </RecordProperty>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks tied to this job.</p>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <li key={task.id} className="text-sm">
                      <p className={task.completed ? "text-muted-foreground line-through" : ""}>
                        {task.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {task.assignee} · {formatDate(task.dueAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
