"use client";

import { useState } from "react";
import { Undo2, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  actionsForViewer,
  alertTimeLabel,
  leadDetailLine,
  leadPhoneHref,
  leadPhoneLabel,
  leadPlaceLine,
  leadRecordHref,
  passbackSummary,
  type LeadAlert,
} from "@/lib/lead-alerts";
import { cn } from "@/lib/utils";

const urgentButton =
  "bg-[#E0302E] text-white hover:bg-[#C42826] focus-visible:border-white focus-visible:ring-white/70";

export function LeadAlertCard({
  alert,
  now,
  coarse = false,
  isAdmin = false,
  onDismiss,
  onCalled,
  onPass,
  onNote,
  onAssign,
}: {
  alert: LeadAlert;
  now: number;
  coarse?: boolean;
  isAdmin?: boolean;
  onDismiss: () => void;
  onCalled: () => void;
  onPass: () => void;
  onNote: () => void;
  onAssign: () => void;
}) {
  const actions = actionsForViewer(alert.kind, isAdmin);
  const place = leadPlaceLine(alert.lead);
  const detail = leadDetailLine(alert.lead);
  const href = leadRecordHref(alert.lead);
  const phone = leadPhoneLabel(alert.lead.phone);
  const tel = leadPhoneHref(alert.lead.phone);
  const passback = alert.kind === "passed_back" ? passbackSummary(alert.lead) : "";
  const titleId = `lead-alert-title-${alert.id}`;

  return (
    <article
      data-alert-id={alert.id}
      data-alert-kind={alert.kind}
      tabIndex={-1}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      }}
      className="pointer-events-auto relative rounded-md border border-[#E0302E] bg-[oklch(0.18_0.014_38)] p-3 text-[oklch(0.96_0.01_85)] shadow-lg outline-none motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200 focus-visible:ring-2 focus-visible:ring-white/80 sm:w-[380px]"
    >
      <div className="flex items-start gap-2 pr-6">
        <span className="relative mt-1.5 flex size-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex size-full rounded-full bg-[#E0302E] opacity-70 motion-safe:animate-ping motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-full bg-[#E0302E]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={titleId} className="text-sm font-medium">
              {alert.title}
            </h2>
            <time dateTime={new Date(alert.arrivedAt).toISOString()} className="shrink-0 text-xs text-white/60">
              {alertTimeLabel(alert.arrivedAt, now)}
            </time>
          </div>
          {href ? (
            <a
              href={href}
              className="mt-1 block truncate text-sm font-medium underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
            >
              {alert.lead.homeowner_name || "Homeowner"}
            </a>
          ) : (
            <p className="mt-1 truncate text-sm font-medium">{alert.lead.homeowner_name || "Homeowner"}</p>
          )}
          {place ? <p className="truncate text-sm text-white/75">{place}</p> : null}
          {detail ? <p className="truncate text-sm text-white/75">{detail}</p> : null}
          {passback ? (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-[#FF8A86]">
              <Undo2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{passback}</span>
            </p>
          ) : null}
          {alert.kind === "rep_note" ? (
            <blockquote className="mt-2 border-l-2 border-white/25 pl-3 text-sm text-white/90">
              {alert.noteBody}
            </blockquote>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="absolute top-2 right-2 rounded-sm p-1 text-white/70 hover:text-white focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
        aria-label="Dismiss alert"
        onClick={onDismiss}
      >
        <X className="size-4" />
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actions.includes("call") ? (
          <CallNow coarse={coarse} phone={phone} tel={tel} onCalled={onCalled} />
        ) : null}
        {actions.includes("pass") ? (
          <button type="button" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-foreground")} onClick={onPass}>
            Pass it along
          </button>
        ) : null}
        {actions.includes("note") ? (
          <button type="button" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-white/90 hover:text-foreground")} onClick={onNote}>
            Respond with note
          </button>
        ) : null}
        {actions.includes("assign") ? (
          <button type="button" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-foreground")} onClick={onAssign}>
            Assign rep
          </button>
        ) : null}
        {actions.includes("got_it") ? (
          <button type="button" className={cn(buttonVariants({ size: "sm" }), urgentButton)} onClick={onDismiss}>
            Got it
          </button>
        ) : null}
        {actions.includes("reassign") ? (
          <button type="button" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-foreground")} onClick={onAssign}>
            Reassign
          </button>
        ) : null}
      </div>
    </article>
  );
}

function CallNow({
  coarse,
  phone,
  tel,
  onCalled,
}: {
  coarse: boolean;
  phone: string;
  tel: string;
  onCalled: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!tel) {
    return (
      <button type="button" className={cn(buttonVariants({ size: "sm" }), urgentButton)} disabled>
        Call now
      </button>
    );
  }
  if (coarse) {
    return (
      <a href={tel} className={cn(buttonVariants({ size: "sm" }), urgentButton)} onClick={onCalled}>
        Call now
      </a>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <a href={tel} className={cn(buttonVariants({ size: "sm" }), urgentButton)} onClick={onCalled}>
        {phone}
      </a>
      <button
        type="button"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-foreground")}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(phone);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
