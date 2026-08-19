"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
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
import { AddPhotoDialog, CreateEstimateDialog, CreateInvoiceDialog } from "@/components/create-ops-dialogs";
import { EmptyState, LoadingScreen, RecordCode } from "@/components/page-chrome";
import {
  EstimateStatusBadge,
  InvoiceStatusBadge,
  JobStatusBadge,
  PhotoCategoryBadge,
} from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate } from "@/lib/format";
import { derivedInvoiceStatus, invoiceBalance, sumLines } from "@/lib/money";
import { JOB_STATUS_LABELS, JOB_STATUSES, PROJECT_TYPE_LABELS, type JobStatus } from "@/lib/types";
import { recommendedChapterIds } from "@/lib/training/recommend";
import { COURSE } from "@/lib/training/engine";
import { toast } from "sonner";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const job = crm.getJob(id);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!job) {
    return (
      <EmptyState
        title="Job not in this book"
        description="This job belongs to another seat. Team leads can Login As the project manager; company admin sees every job."
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
  const estimates = crm.estimates.filter((estimate) => estimate.jobId === job.id);
  const invoices = crm.invoices.filter((invoice) => invoice.jobId === job.id);
  const photos = crm.photos.filter((photo) => photo.jobId === job.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          {job.code ? (
            <p className="mb-1">
              <RecordCode code={job.code} className="text-xs" />
            </p>
          ) : (
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Job
            </p>
          )}
          <h1 className="font-heading text-[1.85rem] leading-[1.1] font-medium text-balance">
            {job.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} />
            <span className="text-sm text-muted-foreground">
              {job.primaryContactId ? (
                <Link href={`/contacts/${job.primaryContactId}`} className="hover:underline">
                  {crm.customerName(job)}
                </Link>
              ) : client ? (
                <Link href={`/clients/${client.id}`} className="hover:underline">
                  {client.name}
                </Link>
              ) : (
                crm.customerName(job)
              )}
              {" · "}
              {job.location}
            </span>
          </div>
        </div>
        <p className="font-heading text-[1.85rem] leading-none font-medium tabular-nums">
          {formatCurrencyFull(job.contractValue)}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Field snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Job code</p>
                <p className="font-mono text-sm font-medium">{job.code || "—"}</p>
              </div>
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
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <CardTitle>Job photos</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setPhotoOpen(true)}>
                Add photo
              </Button>
            </CardHeader>
            <CardContent>
              {photos.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No photos yet. Upload from the field or paste a URL so the office sees the same job.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {photos.map((photo) => (
                    <figure key={photo.id} className="overflow-hidden border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.imageUrl}
                        alt={photo.caption || "Job photo"}
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <figcaption className="space-y-1 p-2.5">
                        <PhotoCategoryBadge category={photo.category} />
                        <p className="text-sm leading-snug">{photo.caption || "Untitled"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(photo.takenAt)}</p>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
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
                  items={crm.teamMembers.map((person) => ({ value: person, label: person }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {crm.teamMembers.map((person) => (
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
              <CardTitle>Training for this job</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                Chapters that match{" "}
                {opportunity
                  ? `${PROJECT_TYPE_LABELS[opportunity.projectType].toLowerCase()} work on the related lead`
                  : "the kind of work this crew typically walks"}
                . Read them before the first homeowner meeting.
              </p>
              <ul className="space-y-2">
                {recommendedChapterIds(opportunity?.projectType).map((chapterId) => {
                  const chapter = COURSE.chapters.find((item) => item.id === chapterId);
                  if (!chapter) return null;
                  return (
                    <li key={chapterId}>
                      <Link href={`/training/${chapter.id}`} className="text-sm font-medium hover:underline">
                        {chapter.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{chapter.tagline}</p>
                    </li>
                  );
                })}
              </ul>
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <CardTitle>Estimates</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setEstimateOpen(true)}>
                New
              </Button>
            </CardHeader>
            <CardContent>
              {estimates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No estimates tied to this job.</p>
              ) : (
                <ul className="space-y-2">
                  {estimates.map((estimate) => (
                    <li key={estimate.id}>
                      <Link href={`/estimates/${estimate.id}`} className="text-sm font-medium hover:underline">
                        {estimate.number}
                      </Link>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <EstimateStatusBadge status={estimate.status} />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatCurrencyFull(
                            sumLines(crm.estimateLines.filter((line) => line.estimateId === estimate.id))
                          )}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <CardTitle>Invoices</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setInvoiceOpen(true)}>
                New
              </Button>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices on this job.</p>
              ) : (
                <ul className="space-y-2">
                  {invoices.map((invoice) => (
                    <li key={invoice.id}>
                      <Link href={`/invoices/${invoice.id}`} className="text-sm font-medium hover:underline">
                        {invoice.number}
                      </Link>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <InvoiceStatusBadge
                          status={derivedInvoiceStatus(invoice, crm.invoiceLines, crm.payments)}
                        />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatCurrencyFull(
                            invoiceBalance(invoice.id, crm.invoiceLines, crm.payments)
                          )}{" "}
                          due
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AddPhotoDialog open={photoOpen} onOpenChange={setPhotoOpen} jobId={job.id} />
      <CreateEstimateDialog
        open={estimateOpen}
        onOpenChange={setEstimateOpen}
        defaultClientId={job.clientId}
        defaultJobId={job.id}
        defaultOpportunityId={job.opportunityId ?? undefined}
        defaultContactId={job.primaryContactId}
      />
      <CreateInvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        defaultClientId={job.clientId}
        defaultJobId={job.id}
      />
    </div>
  );
}
