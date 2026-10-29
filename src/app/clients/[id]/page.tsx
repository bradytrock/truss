"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityComposer, ActivityList } from "@/components/activity";
import { RecordProperty } from "@/components/app-shell";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { StageBadge, TypeBadge, WorkColumnBadge } from "@/components/status-badge";
import { companyFamily, parentCandidates } from "@/lib/company-groups";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency, formatCurrencyFull, formatPhone } from "@/lib/format";
import { CLIENT_TYPE_LABELS, isShelvedStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { opportunityWonAt } from "@/lib/won";
import { workColumnFor } from "@/lib/work-board";

const selectClass = cn(
  "h-8 w-full min-w-0 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none transition-colors",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
);

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const client = crm.getClient(id);
  const [savingParent, setSavingParent] = useState(false);

  // The company plus every office under it, so the numbers read for the whole business.
  const family = useMemo(() => (client ? companyFamily(crm.clients, client.id) : []), [client, crm.clients]);
  const familyIds = useMemo(() => new Set(family.map((item) => item.id)), [family]);
  const offices = useMemo(() => family.filter((item) => item.id !== client?.id), [client?.id, family]);
  const parent = client?.parentClientId ? crm.getClient(client.parentClientId) : undefined;
  const parentChoices = useMemo(
    () => (client ? parentCandidates(crm.clients, client.id) : []),
    [client, crm.clients],
  );

  const contacts = useMemo(
    () => crm.contacts.filter((contact) => contact.clientId && familyIds.has(contact.clientId)),
    [crm.contacts, familyIds],
  );
  const contactIds = useMemo(() => new Set(contacts.map((contact) => contact.id)), [contacts]);
  const opportunities = useMemo(
    () => crm.opportunities.filter((opportunity) => opportunity.clientId && familyIds.has(opportunity.clientId)),
    [crm.opportunities, familyIds],
  );
  // Leads that came in through someone at one of these companies.
  const referred = useMemo(
    () =>
      crm.opportunities.filter(
        (opportunity) =>
          opportunity.referralContactId &&
          contactIds.has(opportunity.referralContactId) &&
          !(opportunity.clientId && familyIds.has(opportunity.clientId)),
      ),
    [contactIds, crm.opportunities, familyIds],
  );
  const jobs = useMemo(
    () => crm.jobs.filter((job) => job.clientId && familyIds.has(job.clientId) && !job.deletedAt),
    [crm.jobs, familyIds],
  );

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

  const activities = crm.activities.filter(
    (activity) => activity.entityType === "client" && activity.entityId === client.id
  );
  const isOpen = (opportunity: (typeof opportunities)[number]) =>
    !isShelvedStage(opportunity.stage) && opportunity.stage !== "awarded";
  const openValue = opportunities.filter(isOpen).reduce((sum, opportunity) => sum + opportunity.value, 0);
  const referredOpen = referred.filter(isOpen).reduce((sum, opportunity) => sum + opportunity.value, 0);
  const referredWon = referred.filter((opportunity) => opportunityWonAt(opportunity, crm.estimates, crm.jobs));
  const referredWonValue = referredWon.reduce((sum, opportunity) => {
    const job = crm.jobs.find((item) => item.opportunityId === opportunity.id && !item.deletedAt);
    return sum + (job?.contractValue || opportunity.value);
  }, 0);
  const groupHint = offices.length ? `across ${family.length} companies` : undefined;
  const officeName = (clientId: string | null) =>
    clientId && clientId !== client.id ? crm.getClient(clientId)?.name : undefined;
  const officeStats = (officeId: string) => {
    const ids = new Set(companyFamily(crm.clients, officeId).map((item) => item.id));
    const people = crm.contacts.filter((contact) => contact.clientId && ids.has(contact.clientId));
    const peopleIds = new Set(people.map((contact) => contact.id));
    const leads = crm.opportunities.filter(
      (opportunity) =>
        (opportunity.clientId && ids.has(opportunity.clientId)) ||
        (opportunity.referralContactId && peopleIds.has(opportunity.referralContactId)),
    );
    return { people: people.length, leads: leads.length };
  };

  async function changeParent(nextId: string) {
    setSavingParent(true);
    try {
      const ok = await crm.updateClient(client!.id, { parentClientId: nextId || null });
      if (ok) {
        const next = nextId ? crm.getClient(nextId) : undefined;
        toast.success(next ? `${client!.name} now rolls up under ${next.name}.` : `${client!.name} stands on its own.`);
      }
    } finally {
      setSavingParent(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {offices.length ? "Parent company" : "Company"}
        </p>
        <h1 className="font-heading text-[1.85rem] leading-[1.1] font-medium">{client.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TypeBadge type={client.type} />
          {client.city || client.state ? (
            <span className="text-sm text-muted-foreground">
              {[client.city, client.state].filter(Boolean).join(", ")}
            </span>
          ) : null}
          {parent ? (
            <span className="text-sm text-muted-foreground">
              · Part of{" "}
              <Link href={`/clients/${parent.id}`} className="font-medium text-foreground hover:underline">
                {parent.name}
              </Link>
            </span>
          ) : null}
          {offices.length ? (
            <span className="text-sm text-muted-foreground">
              · {offices.length} compan{offices.length === 1 ? "y" : "ies"} roll{offices.length === 1 ? "s" : ""} up here
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <p className="text-xs text-muted-foreground">Open pipeline</p>
            <CardTitle className="text-xl tabular-nums">{formatCurrency(openValue + referredOpen)}</CardTitle>
            {groupHint ? <p className="text-[11px] text-muted-foreground">{groupHint}</p> : null}
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <p className="text-xs text-muted-foreground">Pursuits</p>
            <CardTitle className="text-xl tabular-nums">{opportunities.length}</CardTitle>
            {groupHint ? <p className="text-[11px] text-muted-foreground">{groupHint}</p> : null}
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <p className="text-xs text-muted-foreground">Jobs</p>
            <CardTitle className="text-xl tabular-nums">{jobs.length}</CardTitle>
            {groupHint ? <p className="text-[11px] text-muted-foreground">{groupHint}</p> : null}
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <p className="text-xs text-muted-foreground">Referred leads</p>
            <CardTitle className="text-xl tabular-nums">{referred.length}</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              {referred.length
                ? `${referredWon.length} sold · ${formatCurrency(referredWonValue)}`
                : `from ${contacts.length} ${contacts.length === 1 ? "person" : "people"} here`}
            </p>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          {offices.length ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Companies in this group</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Everything above adds these up, so ROI reads for the whole business.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {offices.map((office) => {
                    const stats = officeStats(office.id);
                    const under = office.parentClientId !== client.id ? crm.getClient(office.parentClientId) : undefined;
                    return (
                      <li key={office.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                        <div className="min-w-0">
                          <Link href={`/clients/${office.id}`} className="text-sm font-medium hover:underline">
                            {office.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {CLIENT_TYPE_LABELS[office.type]}
                            {under ? ` · under ${under.name}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {stats.people} {stats.people === 1 ? "person" : "people"} · {stats.leads} lead
                          {stats.leads === 1 ? "" : "s"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ) : null}

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
                          {officeName(opportunity.clientId) ? ` · ${officeName(opportunity.clientId)}` : ""}
                        </p>
                      </div>
                      <StageBadge stage={opportunity.stage} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {referred.length ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Referred leads</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Leads that named someone at {offices.length ? "one of these companies" : "this company"} as the
                  referral source.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {referred.map((opportunity) => {
                    const agent = crm.contacts.find((contact) => contact.id === opportunity.referralContactId);
                    const office = agent?.clientId ? officeName(agent.clientId) : undefined;
                    return (
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
                            {agent ? ` · via ${agent.name}` : ""}
                            {office ? ` (${office})` : ""}
                          </p>
                        </div>
                        <StageBadge stage={opportunity.stage} />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ) : null}

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
                        <Link href={`/jobs?job=${job.id}`} className="text-sm font-medium hover:underline">
                          {job.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {job.code ? `${job.code} · ` : ""}
                          {formatCurrencyFull(job.contractValue)} · {job.projectManager}
                          {officeName(job.clientId) ? ` · ${officeName(job.clientId)}` : ""}
                        </p>
                      </div>
                      <WorkColumnBadge
                        column={workColumnFor(
                          job,
                          crm.opportunities.find((item) => item.id === job.opportunityId),
                        )}
                      />
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
                {[client.city, client.state].filter(Boolean).join(", ") || "—"}
              </RecordProperty>
              <RecordProperty label="Part of">
                <select
                  className={selectClass}
                  aria-label="Parent company"
                  value={client.parentClientId ?? ""}
                  disabled={savingParent}
                  onChange={(event) => void changeParent(event.target.value)}
                >
                  <option value="">No parent company</option>
                  {parentChoices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Offices of one business — Keller Williams Realty under Keller Williams — read together on the parent.
                </p>
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
                      <Link href={`/contacts?contact=${contact.id}`} className="text-sm font-medium hover:underline">
                        {contact.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {contact.title}
                        {officeName(contact.clientId) ? ` · ${officeName(contact.clientId)}` : ""}
                      </p>
                      {contact.email ? (
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {contact.email}
                        </a>
                      ) : null}
                      {contact.phone ? (
                        <p className="text-xs text-muted-foreground">{formatPhone(contact.phone)}</p>
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
