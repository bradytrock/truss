"use client";

import { useRef, useState, type ReactNode } from "react";
import { Copy, MoreHorizontal, Phone, Star, Undo2, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { leadSourceLabel } from "@/lib/leads";
import {
  actionsForViewer,
  alertTimeLabel,
  leadPhoneHref,
  leadPhoneLabel,
  leadPlaceLine,
  leadRecordHref,
  passbackSummary,
  serviceTypeLabel,
  type AlertAction,
  type LeadAlert,
} from "@/lib/lead-alerts";
import { cn } from "@/lib/utils";

const urgentButton =
  "bg-[#E0302E] text-white hover:bg-[#C42826] focus-visible:border-white focus-visible:ring-white/70";

const quietAction =
  "inline-flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg bg-white/10 px-2.5 text-sm font-medium text-white hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none";

const ACTION_LABEL: Record<Exclude<AlertAction, "call">, string> = {
  book: "Book appointment",
  update: "Update lead",
  pass: "Pass it along",
  note: "Respond with note",
  assign: "Assign rep",
  got_it: "Got it",
  reassign: "Reassign",
};

export function LeadAlertCard({
  alert,
  now,
  coarse = false,
  isAdmin = false,
  pastClient = false,
  onDismiss,
  onCalled,
  onPass,
  onNote,
  onAssign,
  onBook,
  onUpdate,
}: {
  alert: LeadAlert;
  now: number;
  coarse?: boolean;
  isAdmin?: boolean;
  pastClient?: boolean;
  onDismiss: () => void;
  onCalled: () => void;
  onPass: () => void;
  onNote: () => void;
  onAssign: () => void;
  onBook: () => void;
  onUpdate: () => void;
}) {
  const actions = actionsForViewer(alert.kind, isAdmin);
  const place = leadPlaceLine(alert.lead);
  const href = leadRecordHref(alert.lead);
  const phone = leadPhoneLabel(alert.lead.phone);
  const tel = leadPhoneHref(alert.lead.phone);
  const passback = alert.kind === "passed_back" ? passbackSummary(alert.lead) : "";
  const titleId = `lead-alert-title-${alert.id}`;
  const service = serviceTypeLabel(alert.lead.service_type);
  const source = leadSourceLabel(alert.lead.source);
  const featured = actions.includes("call") ? "call" : actions.includes("got_it") ? "got_it" : null;
  const rowActions = actions.filter((action): action is Exclude<AlertAction, "call"> => action !== "call" && action !== featured);
  const visible = rowActions.slice(0, 2);
  const overflow = rowActions.slice(2);
  const run: Record<Exclude<AlertAction, "call">, () => void> = {
    book: onBook,
    update: onUpdate,
    pass: onPass,
    note: onNote,
    assign: onAssign,
    got_it: onDismiss,
    reassign: onAssign,
  };

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
      className="pointer-events-auto relative rounded-xl bg-[#171717] p-4 text-white shadow-2xl ring-1 ring-white/10 outline-none motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200 focus-visible:ring-2 focus-visible:ring-white/80 sm:w-[400px]"
    >
      <div className="flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-[#E0302E]" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-[0.08em] text-[#FF6B66] uppercase">
          {alert.title}
        </p>
        <time dateTime={new Date(alert.arrivedAt).toISOString()} className="shrink-0 text-xs text-white/50">
          {alertTimeLabel(alert.arrivedAt, now)}
        </time>
        <button
          type="button"
          className="rounded-sm p-1 text-white/55 hover:text-white focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
          aria-label="Dismiss alert"
          onClick={onDismiss}
        >
          <X className="size-4" />
        </button>
      </div>
      {href ? (
        <a
          id={titleId}
          href={href}
          className="mt-3 block truncate text-[15px] font-semibold underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
        >
          {alert.lead.homeowner_name || "Homeowner"}
        </a>
      ) : (
        <h2 id={titleId} className="mt-3 truncate text-[15px] font-semibold">
          {alert.lead.homeowner_name || "Homeowner"}
        </h2>
      )}
      {place ? <p className="mt-0.5 truncate text-sm text-white/60">{place}</p> : null}
      {service || source || pastClient ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {service ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{service}</span> : null}
          {source ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{source}</span> : null}
          {pastClient ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs">
              <Star className="size-3 fill-current" aria-hidden />
              Past client
            </span>
          ) : null}
        </div>
      ) : null}
      {passback ? (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-[#FF8A86]">
          <Undo2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{passback}</span>
        </p>
      ) : null}
      {alert.kind === "rep_note" ? (
        <blockquote className="mt-3 border-l-2 border-white/25 pl-3 text-sm text-white/90">
          {alert.noteBody}
        </blockquote>
      ) : null}
      {featured === "call" ? (
        <div className="mt-3">
          <CallNow coarse={coarse} phone={phone} tel={tel} onCalled={onCalled} />
        </div>
      ) : null}
      {featured === "got_it" ? (
        <button type="button" className={cn(buttonVariants(), urgentButton, "mt-3 h-10 w-full rounded-lg")} onClick={onDismiss}>
          Got it
        </button>
      ) : null}
      {visible.length || overflow.length ? (
        <div className="mt-2 flex items-center gap-2">
          {visible.map((action) => (
            <button key={action} type="button" className={quietAction} onClick={run[action]}>
              {ACTION_LABEL[action]}
            </button>
          ))}
          {overflow.length ? (
            <MoreActions>
              {overflow.map((action) => (
                <button
                  key={action}
                  type="button"
                  className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                  onClick={run[action]}
                >
                  {ACTION_LABEL[action]}
                </button>
              ))}
            </MoreActions>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MoreActions({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="relative">
      <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg bg-white/10 text-white marker:content-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <MoreHorizontal className="size-4" aria-hidden />
        <span className="sr-only">More actions</span>
      </summary>
      <div
        className="absolute right-0 z-20 mt-1 min-w-44 rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-border"
        onClick={() => {
          if (ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
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
      <button type="button" className={cn("flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold", urgentButton)} disabled>
        Call
      </button>
    );
  }
  if (coarse) {
    return (
      <a href={tel} className={cn("flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold", urgentButton)} onClick={onCalled}>
        Call now
      </a>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <a
        href={tel}
        className={cn("flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold", urgentButton)}
        onClick={onCalled}
      >
        <Phone className="size-4" aria-hidden />
        <span>Call</span>
        <span>{phone}</span>
      </a>
      <button
        type="button"
        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
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
        <Copy className="size-4" aria-hidden />
        <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
