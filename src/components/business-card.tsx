"use client";

import { Mail, MessageSquare, Phone, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cardHeaderLogo,
  cardUrl,
  downloadVcard,
  smsHref,
  telHref,
  vcardText,
  websiteHref,
  type SharedCardPayload,
} from "@/lib/card";
import { formatPhone } from "@/lib/format";

function officeLine(company: SharedCardPayload["company"]) {
  const parts = [company.street, [company.city, company.state].filter(Boolean).join(", "), company.postalCode]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.join(" · ");
}

export function BusinessCardView({ card }: { card: SharedCardPayload }) {
  const company = card.company;
  const person = card.person;
  const website = websiteHref(company.website);

  const headerLogo = cardHeaderLogo(company);

  if (!card.available || !person) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-muted/40 px-4 py-10">
        <div className="w-full max-w-md border bg-card px-6 py-10 text-center">
          {headerLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headerLogo}
              alt=""
              className="mx-auto mb-6 max-h-16 w-full max-w-[16rem] object-contain"
            />
          ) : null}
          <h1 className="font-heading text-2xl font-medium">This card isn’t available</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {company.name
              ? `This person is no longer with ${company.name}, or the link is out of date.`
              : "This person is no longer with the company, or the link is out of date."}
          </p>
        </div>
      </div>
    );
  }

  const live = person;
  const call = telHref(live.phone);
  const text = smsHref(live.phone);
  const url = cardUrl(company.slug, live.cardSlug);
  const address = officeLine(company);

  function saveContact() {
    downloadVcard(
      live.cardSlug || live.name,
      vcardText({
        person: live,
        company,
        url: typeof window !== "undefined" ? window.location.href : url,
      }),
    );
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <article className="w-full max-w-md border bg-card px-6 py-8 sm:px-8">
        <header className="flex flex-col items-center text-center">
          {headerLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headerLogo}
              alt={company.name}
              className="mb-6 max-h-24 w-full max-w-[20rem] object-contain sm:max-h-28"
            />
          ) : (
            <p className="mb-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {company.name}
            </p>
          )}
          {person.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.photoUrl}
              alt={person.name}
              className="size-32 rounded-full border object-cover sm:size-36"
            />
          ) : (
            <div className="font-heading flex size-32 items-center justify-center rounded-full border bg-muted/50 text-3xl sm:size-36">
              {person.initials}
            </div>
          )}
          <h1 className="mt-4 font-heading text-3xl font-medium tracking-tight">{person.name}</h1>
          {person.title ? <p className="mt-1 text-sm text-muted-foreground">{person.title}</p> : null}
          {headerLogo && company.name ? (
            <p className="mt-1 text-sm text-muted-foreground">{company.name}</p>
          ) : null}
        </header>

        <div className="mt-8 grid gap-2">
          {call ? (
            <Button nativeButton={false} size="lg" className="h-11 w-full" render={<a href={call} />}>
              <Phone />
              Call {formatPhone(person.phone)}
            </Button>
          ) : null}
          {text ? (
            <Button
              nativeButton={false}
              variant="outline"
              size="lg"
              className="h-11 w-full"
              render={<a href={text} />}
            >
              <MessageSquare />
              Text
            </Button>
          ) : null}
          {person.email ? (
            <Button
              nativeButton={false}
              variant="outline"
              size="lg"
              className="h-11 w-full"
              render={<a href={`mailto:${person.email}`} />}
            >
              <Mail />
              Email
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="lg" className="h-11 w-full" onClick={saveContact}>
            <UserPlus />
            Save contact
          </Button>
        </div>

        {website || address ? (
          <footer className="mt-8 border-t pt-4 text-center text-xs leading-relaxed text-muted-foreground">
            {website ? (
              <a
                href={website}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {company.website.replace(/^https?:\/\//i, "")}
              </a>
            ) : null}
            {website && address ? <span className="mx-1.5">·</span> : null}
            {address ? <span>{address}</span> : null}
          </footer>
        ) : null}
      </article>
    </div>
  );
}

export function BusinessCardMissing() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md border bg-card px-6 py-10 text-center">
        <h1 className="font-heading text-2xl font-medium">This card isn’t available</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This person is no longer with the company, or the link is out of date.
        </p>
      </div>
    </div>
  );
}
