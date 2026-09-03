"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Globe, Mail, MessageSquare, Phone, Star, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recordCardEvent, type CardEventKind } from "@/lib/card-analytics";
import {
  cardHeaderLogo,
  cardUrl,
  downloadVcard,
  smsHref,
  telHref,
  vcardText,
  type SharedCardPayload,
} from "@/lib/card";
import { embedVcardPhoto } from "@/lib/card-vcard-photo";
import { formatPhone } from "@/lib/format";
import { paymentOptions, resolveGoogleReviewUrl, type PaymentOption } from "@/lib/payments";
import { copyText } from "@/lib/share";
import { socialLinks } from "@/lib/social";

function officeLine(company: SharedCardPayload["company"]) {
  const parts = [company.street, [company.city, company.state].filter(Boolean).join(", "), company.postalCode]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.join(" · ");
}

export function BusinessCardView({ card }: { card: SharedCardPayload }) {
  const company = card.company;
  const person = card.person;
  const headerLogo = cardHeaderLogo(company);
  const personSlug = person?.cardSlug ?? "";
  const viewSent = useRef(false);

  const track = useCallback(
    (kind: CardEventKind, detail?: string) => {
      recordCardEvent({ company: company.slug, person: personSlug, kind, detail });
    },
    [company.slug, personSlug],
  );

  useEffect(() => {
    // One open per mount: StrictMode runs effects twice in development.
    if (viewSent.current || !personSlug) return;
    viewSent.current = true;
    track("view");
  }, [personSlug, track]);

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
  const reviewUrl = resolveGoogleReviewUrl(company, live);
  const payments = paymentOptions(company);
  const paymentNote = company.paymentNote.trim();
  const follow = socialLinks(company);
  const [savingContact, setSavingContact] = useState(false);

  async function saveContact() {
    if (savingContact) return;
    setSavingContact(true);
    track("save_contact");
    try {
      const photo = await embedVcardPhoto(live.photoUrl);
      downloadVcard(
        live.cardSlug || live.name,
        vcardText({
          person: live,
          company,
          url: typeof window !== "undefined" ? window.location.href : url,
          photo,
        }),
      );
    } finally {
      setSavingContact(false);
    }
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
            <Button
              nativeButton={false}
              size="lg"
              className="h-11 w-full"
              render={<a href={call} onClick={() => track("call")} />}
            >
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
              render={<a href={text} onClick={() => track("text")} />}
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
              render={<a href={`mailto:${person.email}`} onClick={() => track("email")} />}
            >
              <Mail />
              Email
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 w-full"
            disabled={savingContact}
            onClick={() => void saveContact()}
          >
            <UserPlus />
            {savingContact ? "Saving…" : "Save contact"}
          </Button>
        </div>

        {reviewUrl ? (
          <Button
            nativeButton={false}
            size="lg"
            variant="outline"
            className="mt-2 h-11 w-full"
            render={
              <a
                href={reviewUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => track("review")}
              />
            }
          >
            <Star />
            Leave a Google review
          </Button>
        ) : null}

        {follow.length > 0 ? (
          <section className="mt-8 border-t pt-5">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Follow {company.name || "us"}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {follow.map((link) => (
                <li key={link.key}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() =>
                      track(link.key === "website" ? "website" : "social", link.key)
                    }
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
                  >
                    {link.key === "website" ? <Globe className="size-4" /> : null}
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {payments.length > 0 || paymentNote ? (
          <section className="mt-8 border-t pt-5">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Pay {company.name || "us"}
            </h2>
            {payments.length > 0 ? (
              <ul className="mt-3 grid gap-2">
                {payments.map((option) => (
                  <li key={option.rail}>
                    <PaymentRow option={option} onUse={() => track("payment", option.rail)} />
                  </li>
                ))}
              </ul>
            ) : null}
            {paymentNote ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{paymentNote}</p>
            ) : null}
          </section>
        ) : null}

        {address ? (
          <footer className="mt-8 border-t pt-4 text-center text-xs leading-relaxed text-muted-foreground">
            {address}
          </footer>
        ) : null}
      </article>
    </div>
  );
}

function PaymentRow({ option, onUse }: { option: PaymentOption; onUse: () => void }) {
  const body = (
    <>
      <span className="text-sm font-medium">{option.label}</span>
      <span className="ml-auto truncate text-sm text-muted-foreground">{option.handle}</span>
    </>
  );

  if (option.href) {
    return (
      <a
        href={option.href}
        target="_blank"
        rel="noreferrer"
        onClick={onUse}
        className="flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/50"
      >
        {body}
      </a>
    );
  }

  // Zelle has no deep link, so the handle is copied into their banking app.
  return (
    <button
      type="button"
      onClick={async () => {
        onUse();
        const ok = await copyText(option.handle);
        if (ok) toast.success(`${option.label} copied: ${option.handle}`);
        else toast.error(`Copy this into ${option.label}: ${option.handle}`);
      }}
      className="flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left hover:bg-muted/50"
    >
      {body}
      <Copy className="size-4 shrink-0 text-muted-foreground" />
    </button>
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
