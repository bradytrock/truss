"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordProperty } from "@/components/app-shell";
import { JobStatusBadge, StageBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency, formatInboxTime, initials } from "@/lib/format";
import { mailForContact, mailHref } from "@/lib/job-emails";
import { jobsForContact, opportunitiesForContact } from "@/lib/parties";
import { SEAT_ROLE_LABELS, type Contact } from "@/lib/types";

export function ContactRecord({ contact }: { contact: Contact }) {
  const crm = useCrm();
  const company = crm.getClient(contact.clientId);
  const owner = crm.staff.find((member) => member.id === contact.ownerStaffId);
  const opportunities = opportunitiesForContact(contact, crm.opportunities);
  const jobs = jobsForContact(contact, crm.jobs);
  const mail = useMemo(
    () => mailForContact(crm.gmailMessages ?? [], contact),
    [contact, crm.gmailMessages],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center rounded-md bg-primary text-lg font-medium text-primary-foreground"
        >
          {initials(contact.name) || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-2xl leading-tight font-medium">{contact.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{contact.title || "Contact"}</span>
            {contact.isReferralPartner ? <Badge variant="secondary">Referral partner</Badge> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {contact.email ? (
              <>
                <Button
                  nativeButton={false}
                  size="sm"
                  variant="outline"
                  render={<Link href={mailHref({ compose: true, email: contact.email, contact: contact.id })} />}
                >
                  <Mail />
                  Email
                </Button>
                <Button
                  nativeButton={false}
                  size="sm"
                  variant="outline"
                  render={<Link href={mailHref({ contact: contact.id, email: contact.email })} />}
                >
                  <Mail />
                  Open in Mail
                </Button>
              </>
            ) : null}
            {contact.phone ? (
              <Button nativeButton={false} size="sm" variant="outline" render={<a href={`tel:${contact.phone}`} />}>
                <Phone />
                Call
              </Button>
            ) : null}
            {contact.phone ? (
              <Button
                nativeButton={false}
                size="sm"
                variant="outline"
                render={<Link href={`/messages?contact=${contact.id}`} />}
              >
                <MessageSquare />
                Text
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
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
                        <Link href={`/jobs?job=${job.id}`} className="text-sm font-medium hover:underline">
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

          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Mail</CardTitle>
                {contact.email ? (
                  <Button
                    nativeButton={false}
                    size="sm"
                    variant="ghost"
                    render={<Link href={mailHref({ compose: true, email: contact.email, contact: contact.id })} />}
                  >
                    Compose
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {mail.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No emails with this person yet. Compose from Mail to start a thread, or load the sample inbox to try it.
                </p>
              ) : (
                <ul className="divide-y">
                  {mail.map((message) => (
                    <li key={message.id} className="py-2.5 first:pt-0">
                      <Link
                        href={mailHref({ thread: message.threadId || message.id, contact: contact.id })}
                        className="block hover:underline"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {message.subject.trim() || "(no subject)"}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatInboxTime(message.receivedAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {message.direction === "outbound" ? "You" : message.fromName || message.fromEmail}
                          {" · "}
                          {message.snippet || message.bodyText}
                        </span>
                      </Link>
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
