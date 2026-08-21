"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordProperty } from "@/components/app-shell";
import { EditContactDialog } from "@/components/create-records";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { JobStatusBadge, StageBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency } from "@/lib/format";
import { jobsForContact, opportunitiesForContact } from "@/lib/parties";
import { SEAT_ROLE_LABELS } from "@/lib/types";

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const contact = crm.getContact(id);
  const [editOpen, setEditOpen] = useState(false);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!contact) {
    return (
      <EmptyState
        title="Contact not in this book"
        description="This person is outside your seat’s access. A team lead can Login As the owner, or a company admin can open the full book."
        action={
          <Button nativeButton={false} render={<Link href="/contacts" />}>
            Back to contacts
          </Button>
        }
      />
    );
  }

  const company = crm.getClient(contact.clientId);
  const owner = crm.staff.find((member) => member.id === contact.ownerStaffId);
  const opportunities = opportunitiesForContact(contact, crm.opportunities);
  const jobs = jobsForContact(contact, crm.jobs);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Contact
          </p>
          <h1 className="font-heading text-[1.85rem] leading-[1.1] font-medium">{contact.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{contact.title}</span>
            {contact.isReferralPartner ? <Badge variant="secondary">Referral partner</Badge> : null}
          </div>
        </div>
        <Button variant="outline" className="shrink-0 self-start" onClick={() => setEditOpen(true)}>
          Edit contact
        </Button>
      </div>
      <EditContactDialog contact={contact} open={editOpen} onOpenChange={setEditOpen} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Pursuits</CardTitle>
            </CardHeader>
            <CardContent>
              {opportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pursuits tied to this person.</p>
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
                        <p className="text-xs text-muted-foreground">{formatCurrency(opportunity.value)}</p>
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
                <p className="text-sm text-muted-foreground">No jobs in view for this person.</p>
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
                          {job.projectManager}
                        </p>
                      </div>
                      <JobStatusBadge status={job.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordProperty label="Company">
                {company ? (
                  <Link href={`/clients/${company.id}`} className="hover:underline">
                    {company.name}
                  </Link>
                ) : (
                  "Homeowner"
                )}
              </RecordProperty>
              <RecordProperty label="Email">
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="hover:underline">
                    {contact.email}
                  </a>
                ) : (
                  "—"
                )}
              </RecordProperty>
              <RecordProperty label="Phone">{contact.phone || "—"}</RecordProperty>
              <RecordProperty label="Book owner">
                {owner ? (
                  <span>
                    {owner.name}
                    <span className="block text-muted-foreground">{SEAT_ROLE_LABELS[owner.role]}</span>
                  </span>
                ) : (
                  "Unassigned"
                )}
              </RecordProperty>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
