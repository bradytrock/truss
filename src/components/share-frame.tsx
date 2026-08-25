"use client";

import type { ReactNode } from "react";
import { Download, Mail, MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/format";
import { digitsOnly, toE164 } from "@/lib/phone";
import type { ShareSender } from "@/lib/share";

export function ShareFrame({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="min-h-full bg-muted/40">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-10">
        {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
        {children}
      </div>
    </div>
  );
}

const KIND_COPY = {
  estimate: { label: "proposal", title: "This proposal isn’t available" },
  invoice: { label: "invoice", title: "This invoice isn’t available" },
  page: { label: "document", title: "This document isn’t available" },
} as const;

function websiteHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function telHref(phone: string) {
  const e164 = toE164(phone);
  if (e164) return `tel:${e164}`;
  const digits = digitsOnly(phone);
  return digits ? `tel:${digits}` : "";
}

function smsHref(phone: string) {
  const e164 = toE164(phone);
  if (e164) return `sms:${e164}`;
  const digits = digitsOnly(phone);
  return digits ? `sms:${digits}` : "";
}

export function ShareMissing({
  kind,
  sender,
}: {
  kind: "estimate" | "invoice" | "page";
  sender?: ShareSender | null;
}) {
  const copy = KIND_COPY[kind];
  const company = sender?.company;
  const manager = sender?.projectManager;
  const companyName = company?.name?.trim() || "";
  const who = manager?.name?.trim()
    ? companyName
      ? `${manager.name.trim()} at ${companyName}`
      : manager.name.trim()
    : companyName;
  const phone = (manager?.phone || company?.phone || "").trim();
  const email = (manager?.email || company?.email || "").trim();
  const website = websiteHref(company?.website || "");
  const call = telHref(phone);
  const text = smsHref(phone);
  const hasButtons = Boolean(call || text || email);
  const showCard = Boolean(who || hasButtons || website);

  return (
    <ShareFrame>
      <div className="border bg-card px-5 py-10">
        <h1 className="font-heading text-2xl font-medium">{copy.title}</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {who
            ? `${who} sent this link. It may have expired, or they may have sent a newer copy. Reach out and they can send it again.`
            : `This ${copy.label} isn’t available right now. Reach out to the contractor who sent the link and ask them to send a new one.`}
        </p>
        {showCard ? (
          <div className="mt-6 max-w-md rounded-md border bg-muted/40 px-4 py-4">
            {companyName ? (
              <p className="font-heading text-lg font-medium">{companyName}</p>
            ) : null}
            {manager?.name?.trim() ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {manager.name.trim()}
                {manager.title?.trim() ? ` · ${manager.title.trim()}` : ""}
              </p>
            ) : null}
            {phone ? <p className="mt-2 text-sm">{formatPhone(phone)}</p> : null}
            {email ? <p className="text-sm">{email}</p> : null}
            {website ? (
              <a
                href={website}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm text-primary underline-offset-4 hover:underline"
              >
                {company?.website}
              </a>
            ) : null}
            {hasButtons ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {call ? (
                  <Button
                    nativeButton={false}
                    size="lg"
                    className="h-11 w-full sm:w-auto"
                    render={<a href={call} />}
                  >
                    <Phone />
                    Call
                  </Button>
                ) : null}
                {text ? (
                  <Button
                    nativeButton={false}
                    variant="outline"
                    size="lg"
                    className="h-11 w-full sm:w-auto"
                    render={<a href={text} />}
                  >
                    <MessageSquare />
                    Text
                  </Button>
                ) : null}
                {email ? (
                  <Button
                    nativeButton={false}
                    variant="outline"
                    size="lg"
                    className="h-11 w-full sm:w-auto"
                    render={<a href={`mailto:${email}`} />}
                  >
                    <Mail />
                    Email
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </ShareFrame>
  );
}

export function ShareLoading() {
  return (
    <ShareFrame>
      <div className="h-24 animate-pulse border bg-muted" />
      <div className="h-[32rem] animate-pulse border bg-muted" />
    </ShareFrame>
  );
}

export function SharePdfButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" disabled={disabled} onClick={onClick}>
      <Download />
      Download PDF
    </Button>
  );
}
