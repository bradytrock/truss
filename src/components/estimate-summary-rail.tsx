"use client";

import type { ReactNode } from "react";
import { Check, CircleAlert, CircleDashed } from "lucide-react";
import type { EstimateStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function EstimateSummaryCard({
  eyebrow,
  countLabel,
  total,
  dueLine,
  rows,
  action,
  footnote,
  className,
}: {
  eyebrow: string;
  countLabel: string;
  total: string;
  dueLine?: string | null;
  rows: Array<{ label: string; value: string; muted?: boolean }>;
  action?: ReactNode;
  footnote?: string | null;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[12px] bg-[#1b1b1b] p-4 text-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:bg-[#111]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-white/70 uppercase">{eyebrow}</p>
        <p className="shrink-0 text-right text-[11px] leading-tight text-white/60">{countLabel}</p>
      </div>
      <p className="mt-2 text-[2rem] leading-none font-semibold tracking-tight tabular-nums">{total}</p>
      {dueLine ? <p className="mt-1.5 text-xs text-white/70">{dueLine}</p> : null}
      <dl className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-white/70">{row.label}</dt>
            <dd className={cn("tabular-nums", row.muted ? "text-white/60" : "text-white")}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {action ? <div className="mt-4 [&>button]:w-full">{action}</div> : null}
      {footnote ? <p className="mt-2.5 text-center text-[11px] leading-snug text-white/60">{footnote}</p> : null}
    </section>
  );
}

export type ReadinessItem = {
  label: string;
  state: "ok" | "warn" | "todo";
  /** Shown after the label, e.g. "— blank". Rendered as a link when `href` is set. */
  note?: string;
  href?: string;
};

export function ReadyToSendCard({ title, items }: { title: string; items: ReadinessItem[] }) {
  return (
    <section className="rounded-[12px] border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-2.5 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-sm">
            {item.state === "ok" ? (
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" strokeWidth={2.4} aria-hidden />
            ) : item.state === "warn" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            ) : (
              <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="min-w-0">
              <span>{item.label}</span>
              {item.note ? (
                item.href ? (
                  <a
                    href={item.href}
                    className={cn(
                      "ml-1 underline underline-offset-2",
                      item.state === "warn" ? "text-amber-700" : "text-muted-foreground",
                    )}
                  >
                    {item.note}
                  </a>
                ) : (
                  <span className="ml-1 text-muted-foreground">{item.note}</span>
                )
              ) : null}
            </span>
            <span className="sr-only">
              {item.state === "ok" ? "Done." : item.state === "warn" ? "Needs attention." : "Not yet."}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TRACK: Array<{ key: EstimateStatus; label: string }> = [
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "viewed", label: "Viewed" },
  { key: "accepted", label: "Signed" },
];

export function EstimateStatusCard({ status, detail }: { status: EstimateStatus; detail?: string | null }) {
  const reached = status === "declined" ? -1 : TRACK.findIndex((step) => step.key === status);
  return (
    <section className="rounded-[12px] border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Status</h2>
        {status === "declined" ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Declined
          </span>
        ) : null}
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Proposal progress">
        {TRACK.map((step, index) => {
          const done = index <= reached;
          const current = index === reached;
          return (
            <li key={step.key} aria-current={current ? "step" : undefined}>
              <span
                className={cn(
                  "block h-1 rounded-full",
                  done ? "bg-primary" : "bg-muted",
                  status === "declined" && "bg-muted",
                )}
              />
              <span
                className={cn(
                  "mt-1.5 block text-[11px]",
                  current ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      {detail ? <p className="mt-3 text-xs text-muted-foreground">{detail}</p> : null}
    </section>
  );
}
