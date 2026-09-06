"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, FileText, Gift, HardHat, Phone, Receipt, Users } from "lucide-react";
import { ShareFrame } from "@/components/share-frame";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateShort, formatPhone, formatTime } from "@/lib/format";
import type { PortalDocument, PortalJob, PortalPayload } from "@/lib/portal";
import { cn } from "@/lib/utils";

function formatWhen(iso: string) {
  if (!iso) return "";
  return `${formatDateShort(iso)}, ${formatTime(iso)}`;
}

function statusLabel(value: string) {
  if (!value) return "";
  return value.replace(/_/g, " ");
}

function DocumentList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: PortalDocument[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y border bg-card">
          {items.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {doc.number}
                  {doc.name ? <span className="text-muted-foreground"> · {doc.name}</span> : null}
                </p>
                <p className="text-xs capitalize text-muted-foreground">{statusLabel(doc.status)}</p>
              </div>
              {doc.sharePath ? (
                <Link
                  href={doc.sharePath}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Open
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">Ask your project manager</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function JobBlock({ job }: { job: PortalJob }) {
  return (
    <div className="space-y-5 border bg-card px-4 py-5 sm:px-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {job.code || "Job"}
          {job.status ? ` · ${statusLabel(job.status)}` : ""}
        </p>
        <h3 className="font-heading text-xl font-medium">{job.name}</h3>
        {job.location ? <p className="mt-1 text-sm text-muted-foreground">{job.location}</p> : null}
        {job.projectManager ? (
          <p className="mt-2 text-sm">
            Project manager: <span className="font-medium">{job.projectManager}</span>
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="size-4" />
          Schedule
        </div>
        {job.schedule.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming visits on the calendar yet.</p>
        ) : (
          <ul className="space-y-2">
            {job.schedule.map((item) => (
              <li key={item.id} className="border-l-2 border-foreground/20 pl-3">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">{formatWhen(item.startsAt)}</p>
                {item.assignee ? (
                  <p className="text-xs text-muted-foreground">With {item.assignee}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HardHat className="size-4" />
          Trades on this job
        </div>
        {job.trades.length === 0 ? (
          <p className="text-sm text-muted-foreground">Trades will show here once they are assigned.</p>
        ) : (
          <ul className="space-y-2">
            {job.trades.map((trade) => (
              <li key={trade.id} className="text-sm">
                <span className="font-medium">{trade.name}</span>
                {trade.title ? <span className="text-muted-foreground"> · {trade.title}</span> : null}
                {trade.phone ? (
                  <a
                    className="ml-2 text-muted-foreground underline-offset-2 hover:underline"
                    href={`tel:${trade.phone}`}
                  >
                    {formatPhone(trade.phone)}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {job.assigned.length > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4" />
            Crew
          </div>
          <p className="text-sm text-muted-foreground">{job.assigned.join(", ")}</p>
        </div>
      ) : null}
    </div>
  );
}

export function PortalClient({
  token,
  initial,
}: {
  token: string;
  initial: PortalPayload | null;
}) {
  const [payload, setPayload] = useState(initial);
  const [referredName, setReferredName] = useState("");
  const [referredPhone, setReferredPhone] = useState("");
  const [referredEmail, setReferredEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOk, setFormOk] = useState<string | null>(null);

  const defaultJobId = useMemo(() => payload?.jobs[0]?.id ?? null, [payload]);

  async function onSubmitReferral(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFormOk(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/portal/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referredName,
          referredPhone,
          referredEmail,
          notes,
          jobId: defaultJobId,
        }),
      });
      const data = (await response.json()) as PortalPayload & { error?: string };
      if (!response.ok) {
        setFormError(data.error || "Could not send that referral.");
        return;
      }
      setPayload(data);
      setReferredName("");
      setReferredPhone("");
      setReferredEmail("");
      setNotes("");
      setFormOk("Thanks — your project manager has that referral.");
    } catch {
      setFormError("Could not send that referral.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!payload) {
    return (
      <ShareFrame>
        <div className="border bg-card px-5 py-10">
          <h1 className="font-heading text-2xl font-medium">This portal isn’t available</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            The link may have expired, or your contractor may have sent a newer one. Reach out and ask them to
            send the portal again.
          </p>
        </div>
      </ShareFrame>
    );
  }

  const { company, contact, jobs, estimates, invoices, referrals, rewards } = payload;

  return (
    <ShareFrame>
      <header className="border bg-card px-5 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoUrl} alt="" className="mb-3 h-10 w-auto object-contain" />
            ) : null}
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Client portal</p>
            <h1 className="font-heading text-3xl font-medium">{company.name || "Your contractor"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Welcome, {contact.name}. Here is your job schedule, trades, paperwork, and a place to send referrals.
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {company.phone ? (
              <a className="flex items-center gap-1.5 hover:text-foreground" href={`tel:${company.phone}`}>
                <Phone className="size-3.5" />
                {formatPhone(company.phone)}
              </a>
            ) : null}
            {company.email ? <p className="mt-1">{company.email}</p> : null}
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-medium">Your jobs</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active jobs are linked to this portal yet.</p>
        ) : (
          jobs.map((job) => <JobBlock key={job.id} job={job} />)
        )}
      </section>

      <DocumentList title="Estimates" empty="No open estimates right now." items={estimates} />
      <DocumentList title="Invoices" empty="No open invoices right now." items={invoices} />

      <section className="space-y-4 border bg-card px-4 py-5 sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <Users className="size-4" />
            <h2 className="font-heading text-lg font-medium">Refer a neighbor</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a name to your project manager. Referral rewards are coming later — for now we keep the ask on
            file.
          </p>
        </div>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmitReferral}>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="referredName">Neighbor’s name</Label>
            <Input
              id="referredName"
              value={referredName}
              onChange={(event) => setReferredName(event.target.value)}
              required
              placeholder="Full name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="referredPhone">Phone</Label>
            <Input
              id="referredPhone"
              value={referredPhone}
              onChange={(event) => setReferredPhone(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="referredEmail">Email</Label>
            <Input
              id="referredEmail"
              type="email"
              value={referredEmail}
              onChange={(event) => setReferredEmail(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Note for your project manager</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional — address, how you know them, or anything helpful"
              rows={3}
            />
          </div>
          {formError ? <p className="text-sm text-destructive sm:col-span-2">{formError}</p> : null}
          {formOk ? <p className="text-sm text-muted-foreground sm:col-span-2">{formOk}</p> : null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send referral"}
            </Button>
          </div>
        </form>
        {referrals.length > 0 ? (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Your referrals</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {referrals.map((referral) => (
                <li key={referral.id}>
                  {referral.referredName}
                  <span className="capitalize"> · {statusLabel(referral.status)}</span>
                  {referral.createdAt ? ` · ${formatDate(referral.createdAt)}` : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="border bg-card px-4 py-5 sm:px-5">
        <div className="flex items-center gap-2">
          <Gift className="size-4" />
          <h2 className="font-heading text-lg font-medium">Rewards</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          A rewards catalog is on the roadmap. Referrals you send today will count when it launches.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {rewards.comingSoon.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {rewards.pointsBalance > 0 ? (
          <p className="mt-3 text-sm">
            Points on file: <span className="font-medium">{rewards.pointsBalance}</span>
          </p>
        ) : null}
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="size-3.5" />
        <Receipt className="size-3.5" />
        Estimates and invoices open in their own secure links.
      </p>
    </ShareFrame>
  );
}
