"use client";

import { CalendarDays, Home, Link2, Phone, Users } from "lucide-react";
import { ShareFrame } from "@/components/share-frame";
import { formatCurrency, formatDate, formatDateShort, formatPhone, formatTime } from "@/lib/format";
import type {
  RealtorPortalJob,
  RealtorPortalListing,
  RealtorPortalPayload,
  RealtorPortalReferral,
} from "@/lib/realtor-portal";

function formatWhen(iso: string) {
  if (!iso) return "";
  return `${formatDateShort(iso)}, ${formatTime(iso)}`;
}

function statusLabel(value: string) {
  if (!value) return "";
  return value.replace(/_/g, " ");
}

function ReferralList({ items }: { items: RealtorPortalReferral[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No referrals on file yet. When you send a homeowner our way, it will show here.
      </p>
    );
  }
  return (
    <ul className="divide-y border bg-card">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium">
              {item.code ? `${item.code} · ` : ""}
              {item.name}
            </p>
            {item.location ? (
              <p className="text-sm text-muted-foreground">{item.location}</p>
            ) : null}
            <p className="mt-1 text-xs capitalize text-muted-foreground">
              {statusLabel(item.stage)}
              {item.createdAt ? ` · ${formatDate(item.createdAt)}` : ""}
            </p>
          </div>
          <p className="text-sm font-medium">{formatCurrency(item.value)}</p>
        </li>
      ))}
    </ul>
  );
}

function JobBlock({ job }: { job: RealtorPortalJob }) {
  return (
    <div className="space-y-4 border bg-card px-4 py-5 sm:px-5">
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
    </div>
  );
}

function ListingList({ items }: { items: RealtorPortalListing[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No listings tracked yet. Once your partner page is watched, new inventory shows up here.
      </p>
    );
  }
  return (
    <ul className="divide-y border bg-card">
      {items.map((listing) => (
        <li key={listing.id} className="space-y-1 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{listing.title}</p>
              <p className="text-sm text-muted-foreground">
                {[listing.address, listing.city, listing.state].filter(Boolean).join(", ")}
              </p>
            </div>
            <div className="text-right text-sm">
              {listing.price != null ? (
                <p className="font-medium">{formatCurrency(listing.price)}</p>
              ) : null}
              <p className="capitalize text-muted-foreground">{statusLabel(listing.status)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {[
              listing.beds != null ? `${listing.beds} bd` : null,
              listing.baths != null ? `${listing.baths} ba` : null,
              listing.sqft != null ? `${listing.sqft.toLocaleString("en-US")} sf` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {listing.lastSeenAt ? ` · Seen ${formatDateShort(listing.lastSeenAt)}` : ""}
          </p>
          {listing.summary ? <p className="text-sm text-muted-foreground">{listing.summary}</p> : null}
          {listing.sourceUrl ? (
            <a
              href={listing.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              <Link2 className="size-3" />
              Open listing
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function RealtorPortalClient({
  token,
  initial,
}: {
  token: string;
  initial: RealtorPortalPayload | null;
}) {
  void token;
  if (!initial) {
    return (
      <ShareFrame>
        <div className="border bg-card px-5 py-10">
          <h1 className="font-heading text-2xl font-medium">This realtor portal isn’t available</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            The link may have expired, or your contractor may have sent a newer one. Ask them to send the
            realtor portal again.
          </p>
        </div>
      </ShareFrame>
    );
  }

  const { company, contact, referrals, jobs, listings, pipeline } = initial;

  return (
    <ShareFrame>
      <header className="border bg-card px-5 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoUrl} alt="" className="mb-3 h-10 w-auto object-contain" />
            ) : null}
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Realtor portal</p>
            <h1 className="font-heading text-3xl font-medium">{company.name || "Your contractor"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Welcome, {contact.name}. Track referrals you sent, job schedules you are on, and listings we watch
              for your pipeline.
            </p>
            {contact.ownerName ? (
              <p className="mt-2 text-sm">
                Your project manager: <span className="font-medium">{contact.ownerName}</span>
              </p>
            ) : null}
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
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="border bg-background/60 px-3 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Open referrals</p>
            <p className="mt-1 font-heading text-2xl font-medium">{pipeline.openReferrals}</p>
          </div>
          <div className="border bg-background/60 px-3 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Active listings watched</p>
            <p className="mt-1 font-heading text-2xl font-medium">{pipeline.activeListings}</p>
          </div>
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="size-4" />
          <h2 className="font-heading text-lg font-medium">Referrals you sent</h2>
        </div>
        <ReferralList items={referrals} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4" />
          <h2 className="font-heading text-lg font-medium">Jobs & schedules</h2>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No jobs tied to your referrals yet. When work is scheduled, it will land here.
          </p>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <JobBlock key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Home className="size-4" />
          <h2 className="font-heading text-lg font-medium">Listing pipeline</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {pipeline.watchEnabled
            ? "We browse your public listings daily so your project manager stays current."
            : "Ask your project manager to turn on listing watch for your agent page."}
          {pipeline.watchUrl ? (
            <>
              {" "}
              <a
                href={pipeline.watchUrl}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:underline"
              >
                View watched page
              </a>
            </>
          ) : null}
        </p>
        <ListingList items={listings} />
      </section>
    </ShareFrame>
  );
}
