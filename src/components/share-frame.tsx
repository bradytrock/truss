"use client";

import type { ReactNode } from "react";
import { Download, Mail, MessageSquare, Phone } from "lucide-react";
import { RoofTileMark, SIGN_IN_ACCENT } from "@/components/sign-in-screen";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/format";
import { digitsOnly, toE164 } from "@/lib/phone";
import { PRODUCT_NAME } from "@/lib/product";
import type { ShareSender } from "@/lib/share";
import { cn } from "@/lib/utils";

export type ShareDocumentChrome = {
  kind: "estimate" | "invoice";
  number: string;
  statusLabel: string;
  tone: "ready" | "done" | "alert";
};

const TONE_CLASS = {
  ready: "bg-amber-100 text-amber-900",
  done: "bg-green-100 text-green-800",
  alert: "bg-red-100 text-red-800",
} as const;

const KIND_TITLE = {
  estimate: "Estimate",
  invoice: "Invoice",
} as const;

export function ShareFrame({
  children,
  actions,
  wide,
  document,
}: {
  children: ReactNode;
  actions?: ReactNode;
  /** Use the browser width. Good / Better / Best cards need the screen, not a centered letter column. */
  wide?: boolean;
  /** Public estimate and invoice pages. Other share links keep the plain column. */
  document?: ShareDocumentChrome;
}) {
  if (!document) {
    return (
      <div className="min-h-full bg-muted/40">
        <div
          className={cn(
            "mx-auto flex w-full flex-col gap-4 px-4 py-6 sm:px-6 sm:py-10",
            wide ? "max-w-[100rem] lg:px-10 xl:px-14" : "max-w-3xl",
          )}
        >
          {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
          {children}
        </div>
      </div>
    );
  }

  const width = wide ? "max-w-[100rem]" : "max-w-[860px]";
  const pad = wide ? "px-4 lg:px-10 xl:px-14" : "px-4";

  return (
    <div className="min-h-full bg-[#F4F4F5] text-[#18181B]">
      <header className="border-b border-[#E4E4E7] bg-white">
        <div className={cn("mx-auto flex flex-wrap items-center justify-between gap-3 py-3", width, pad)}>
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <span>
              {KIND_TITLE[document.kind]} {document.number}
            </span>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE_CLASS[document.tone])}>
              {document.statusLabel}
            </span>
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </header>
      <div className={cn("mx-auto flex w-full flex-col gap-4 py-6 sm:py-8", width, pad)}>
        {children}
        <p className="pt-2 text-center text-xs text-zinc-500">Powered by {PRODUCT_NAME}</p>
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

const LOADING_COPY = {
  estimate: {
    title: "Loading estimate",
    subtitle: "Opening this estimate. This only takes a moment.",
  },
  invoice: {
    title: "Loading invoice",
    subtitle: "Opening this invoice. This only takes a moment.",
  },
} as const;

function SkeletonBar({ className }: { className: string }) {
  return <div className={cn("animate-pulse rounded bg-zinc-200", className)} />;
}

export function ShareLoading({ kind }: { kind?: "estimate" | "invoice" } = {}) {
  if (kind !== "estimate" && kind !== "invoice") {
    return (
      <ShareFrame>
        <div className="h-24 animate-pulse border bg-muted" />
        <div className="h-[32rem] animate-pulse border bg-muted" />
      </ShareFrame>
    );
  }

  const copy = LOADING_COPY[kind];
  return (
    <div className="flex min-h-full flex-col items-center gap-10 overflow-hidden bg-[#F4F4F5] px-4 pt-16 text-[#18181B]">
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-5 text-center">
        <div className="relative flex size-[76px] items-center justify-center">
          <svg className="absolute inset-0 size-full animate-spin" viewBox="0 0 76 76" aria-hidden>
            <circle cx="38" cy="38" r="34" fill="none" stroke="#E4E4E7" strokeWidth="3" />
            <path
              d="M38 4 A34 34 0 0 1 72 38"
              fill="none"
              stroke={SIGN_IN_ACCENT}
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <RoofTileMark className="size-[42px]" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-bold tracking-tight">{copy.title}</h1>
          <p className="text-sm text-zinc-600">{copy.subtitle}</p>
        </div>
      </div>
      <div
        aria-hidden
        className="w-full max-w-[860px] rounded-[14px] border border-[#E4E4E7] bg-white p-8 shadow-[0_12px_40px_rgba(24,24,27,0.06)] sm:p-11"
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex flex-col gap-3">
            <SkeletonBar className="size-14 rounded-xl" />
            <SkeletonBar className="h-4 w-40" />
            <SkeletonBar className="h-3 w-56" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <SkeletonBar className="h-6 w-28" />
            <SkeletonBar className="h-3 w-36" />
            <SkeletonBar className="h-3 w-32" />
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-4">
              <SkeletonBar className="h-2.5 w-20" />
              <SkeletonBar className="h-4 w-32" />
              <SkeletonBar className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between border-b border-zinc-100 py-3">
              <SkeletonBar className="h-3 w-52" />
              <SkeletonBar className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
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
