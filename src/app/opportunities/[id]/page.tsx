"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ActivityComposer, ActivityList } from "@/components/activity";
import { RecordProperty } from "@/components/app-shell";
import { EmptyState, LoadingScreen, RecordCode } from "@/components/page-chrome";
import { EstimateStatusBadge, StageBadge, TypeBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { daysUntil, formatCurrencyFull, formatDate } from "@/lib/format";
import { amountForEstimate } from "@/lib/estimate-totals";
import { CreateEstimateDialog } from "@/components/create-ops-dialogs";
import {
  DELIVERY_LABELS,
  PIPELINE_STAGES,
  STAGE_LABELS,
  type PipelineStage,
} from "@/lib/types";
import { formatJobSite, leadSourceLabel } from "@/lib/leads";

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const opportunity = crm.getOpportunity(id);
  const [nextStep, setNextStep] = useState<string | null>(null);
  const [estimateOpen, setEstimateOpen] = useState(false);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!opportunity) {
    return (
      <EmptyState
        title="Pursuit not found"
        description="It may have been removed when demo data was reset."
        action={
          <Button nativeButton={false} render={<Link href="/pipeline" />}>
            Back to pipeline
          </Button>
        }
      />
    );
  }

  const client = crm.getClient(opportunity.clientId);
  const contact = crm.getContact(opportunity.primaryContactId);
  const job = crm.jobForOpportunity(opportunity.id);
  const activities = crm.activities.filter(
    (activity) => activity.entityType === "opportunity" && activity.entityId === opportunity.id
  );
  const tasks = crm.tasks.filter(
    (task) => task.relatedType === "opportunity" && task.relatedId === opportunity.id
  );
  const estimates = crm.estimates.filter((estimate) => estimate.opportunityId === opportunity.id);
  const due = daysUntil(opportunity.bidDueAt);
  const step = nextStep ?? opportunity.nextStep;

  function handleStage(stage: PipelineStage) {
    void (async () => {
      const created = await crm.moveOpportunity(id, stage);
      if (stage === "awarded") {
        toast.success(created ? "Job Sold. A precon job is now on the jobs list." : "Already on a job.");
      } else if (stage === "lost") {
        toast.message("Marked lost.");
      }
    })();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {opportunity.code ? (
            <p className="mb-1">
              <RecordCode code={opportunity.code} className="text-xs" />
            </p>
          ) : (
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Pursuit
            </p>
          )}
          <h1 className="font-heading text-[1.85rem] leading-[1.1] font-medium text-balance">
            {opportunity.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StageBadge stage={opportunity.stage} />
            <TypeBadge type={opportunity.projectType} />
            <span className="text-sm text-muted-foreground">
              {contact ? (
                <Link href={`/contacts/${contact.id}`} className="hover:underline">
                  {contact.name}
                </Link>
              ) : (
                crm.customerName(opportunity)
              )}
              {" · "}
              {opportunity.location}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <p className="font-heading text-[1.85rem] leading-none font-medium tabular-nums">
            {formatCurrencyFull(opportunity.value)}
          </p>
          <Select
            value={opportunity.stage}
            onValueChange={(value) => {
              if (value) handleStage(value as PipelineStage);
            }}
            items={PIPELINE_STAGES.map((stage) => ({
              value: stage,
              label: STAGE_LABELS[stage],
            }))}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {opportunity.bidDueAt && opportunity.stage !== "awarded" && opportunity.stage !== "lost" ? (
        <p
          className={
            due !== null && due <= 3
              ? "border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              : "border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
          }
        >
          Bid due {formatDate(opportunity.bidDueAt)}
          {due === 0 ? " — today" : due === 1 ? " — tomorrow" : due !== null && due < 0 ? " — past due" : ""}
          . {opportunity.estimator} owns the number.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Next step</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={step}
                onChange={(event) => setNextStep(event.target.value)}
                rows={3}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    crm.updateOpportunity(opportunity.id, { nextStep: step });
                    toast.success("Next step saved.");
                  }}
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          {job ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Job</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  Awarded work lives on{" "}
                  <Link href={`/jobs/${job.id}`} className="font-medium text-primary hover:underline">
                    {job.code ? `${job.code} · ${job.name}` : job.name}
                  </Link>
                  . {job.projectManager} is PM.
                </p>
            </CardContent>
          </Card>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <CardTitle>Estimates</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setEstimateOpen(true)}>
                New estimate
              </Button>
            </CardHeader>
            <CardContent>
              {estimates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No proposals on this pursuit yet. Draft one from the price book before bid day.
                </p>
              ) : (
                <ul className="space-y-3">
                  {estimates.map((estimate) => (
                    <li key={estimate.id} className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/estimates/${estimate.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {estimate.number} · {estimate.name}
                        </Link>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {formatCurrencyFull(
                            amountForEstimate(estimate, crm.estimateLines)
                          )}
                        </p>
                      </div>
                      <EstimateStatusBadge status={estimate.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ActivityComposer entityType="opportunity" entityId={opportunity.id} />
              <ActivityList
                items={activities}
                empty="No activity yet. Log the last call with the owner or architect."
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>About this pursuit</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordProperty label="Customer">
                {contact ? (
                  <Link href={`/contacts/${contact.id}`} className="hover:underline">
                    {contact.name}
                  </Link>
                ) : client ? (
                  <Link href={`/clients/${client.id}`} className="hover:underline">
                    {client.name}
                  </Link>
                ) : (
                  "Homeowner"
                )}
              </RecordProperty>
              {client ? (
              <RecordProperty label="Company">
                <Link href={`/clients/${client.id}`} className="hover:underline">
                  {client.name}
                </Link>
              </RecordProperty>
              ) : null}
              <RecordProperty label="Primary contact">
                {contact ? (
                  <div>
                    <p>{contact.name}</p>
                    <p className="text-muted-foreground">{contact.title}</p>
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                        {contact.email}
                      </a>
                    ) : null}
                  </div>
                ) : (
                  "—"
                )}
              </RecordProperty>
              {opportunity.leadSource ? (
                <RecordProperty label="Source">
                  {leadSourceLabel(opportunity.leadSource)}
                </RecordProperty>
              ) : null}
              {opportunity.referralContactId ? (
                <RecordProperty label="Referred by">
                  {crm.getContact(opportunity.referralContactId) ? (
                    <Link
                      href={`/contacts/${opportunity.referralContactId}`}
                      className="hover:underline"
                    >
                      {crm.getContact(opportunity.referralContactId)?.name}
                    </Link>
                  ) : (
                    "Contact not in this seat’s book"
                  )}
                </RecordProperty>
              ) : null}
              {(opportunity.street || opportunity.city) ? (
                <RecordProperty label="Job site">
                  {formatJobSite({
                    street: opportunity.street,
                    city: opportunity.city,
                    state: opportunity.state,
                    postalCode: opportunity.postalCode,
                  }) || opportunity.location}
                </RecordProperty>
              ) : (
                <RecordProperty label="Location">{opportunity.location}</RecordProperty>
              )}
              {opportunity.notes ? (
                <RecordProperty label="Notes">{opportunity.notes}</RecordProperty>
              ) : null}
              <RecordProperty label="Delivery">{DELIVERY_LABELS[opportunity.deliveryMethod]}</RecordProperty>
              <RecordProperty label="Estimator">
                <Select
                  value={opportunity.estimator}
                  onValueChange={(value) => {
                    if (value) crm.updateOpportunity(opportunity.id, { estimator: String(value) });
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
              <RecordProperty label="Win probability">
                {opportunity.winProbability}%
              </RecordProperty>
              <RecordProperty label="Pre-bid walk">
                {formatDate(opportunity.preBidWalkAt)}
              </RecordProperty>
              <RecordProperty label="Opened">{formatDate(opportunity.createdAt)}</RecordProperty>
              {opportunity.lostReason ? (
                <RecordProperty label="Lost reason">{opportunity.lostReason}</RecordProperty>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open tasks on this pursuit.</p>
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

      <CreateEstimateDialog
        open={estimateOpen}
        onOpenChange={setEstimateOpen}
        defaultClientId={opportunity.clientId}
        defaultOpportunityId={opportunity.id}
        defaultJobId={job?.id}
        defaultContactId={opportunity.primaryContactId}
      />
    </div>
  );
}
