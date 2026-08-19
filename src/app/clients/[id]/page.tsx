"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityComposer, ActivityList } from "@/components/activity";
import { RecordProperty } from "@/components/app-shell";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { JobStatusBadge, StageBadge, TypeBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency, formatCurrencyFull } from "@/lib/format";
import { CLIENT_TYPE_LABELS } from "@/lib/types";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const client = crm.getClient(id);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!client) {
    return (
      <EmptyState
        title="Client not found"
        description="It may have been removed when demo data was reset."
        action={
          <Button nativeButton={false} render={<Link href="/contacts" />}>
            Back to contacts
          </Button>
        }
      />
    );
  }

  const contacts = crm.contacts.filter((contact) => contact.clientId === client.id);
  const opportunities = crm.opportunities.filter(
    (opportunity) => opportunity.clientId === client.id
  );
  const jobs = crm.jobs.filter((job) => job.clientId === client.id);
  const activities = crm.activities.filter(
    (activity) => activity.entityType === "client" && activity.entityId === client.id
  );
  const openValue = opportunities
    .filter((opportunity) => opportunity.stage !== "lost" && opportunity.stage !== "awarded")
    .reduce((sum, opportunity) => sum + opportunity.value, 0);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Company
        </p>
        <h1 className="font-heading text-[1.85rem] leading-[1.1] font-medium">{client.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TypeBadge type={client.type} />
          <span className="text-sm text-muted-foreground">
            {client.city}, {client.state}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <p className="text-xs text-muted-foreground">Open pipeline</p>
            <CardTitle className="text-xl tabular-nums">{formatCurrency(openValue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <p className="text-xs text-muted-foreground">Pursuits</p>
            <CardTitle className="text-xl tabular-nums">{opportunities.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <p className="text-xs text-muted-foreground">Jobs</p>
            <CardTitle className="text-xl tabular-nums">{jobs.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Pursuits</CardTitle>
            </CardHeader>
            <CardContent>
              {opportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pursuits with this client.</p>
              ) : (
                <ul className="divide-y">
                  {opportunities.map((opportunity) => (
                    <li key={opportunity.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                      <div className="min-w-0">
                        <Link
                          href={`/opportunities/${opportunity.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {opportunity.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(opportunity.value)}
                        </p>
                      </div>
                      <StageBadge stage={opportunity.stage} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs on the books for this client.</p>
              ) : (
                <ul className="divide-y">
                  {jobs.map((job) => (
                    <li key={job.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                      <div className="min-w-0">
                        <Link href={`/jobs/${job.id}`} className="text-sm font-medium hover:underline">
                          {job.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {job.code ? `${job.code} · ` : ""}
                          {formatCurrencyFull(job.contractValue)} · {job.projectManager}
                        </p>
                      </div>
                      <JobStatusBadge status={job.status} />
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
              <ActivityComposer entityType="client" entityId={client.id} />
              <ActivityList
                items={activities}
                empty="No relationship notes yet. Capture how they buy work and who actually awards."
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordProperty label="Type">{CLIENT_TYPE_LABELS[client.type]}</RecordProperty>
              <RecordProperty label="Market">
                {client.city}, {client.state}
              </RecordProperty>
              <RecordProperty label="How they buy">{client.notes || "—"}</RecordProperty>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>People</CardTitle>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contacts on this account.</p>
              ) : (
                <ul className="space-y-3">
                  {contacts.map((contact) => (
                    <li key={contact.id}>
                      <Link href={`/contacts/${contact.id}`} className="text-sm font-medium hover:underline">
                        {contact.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{contact.title}</p>
                      {contact.email ? (
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {contact.email}
                        </a>
                      ) : null}
                      {contact.phone ? (
                        <p className="text-xs text-muted-foreground">{contact.phone}</p>
                      ) : null}
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
