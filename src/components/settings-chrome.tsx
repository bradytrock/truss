"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? (
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 font-heading text-[1.85rem] leading-tight font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SettingsCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[#ebe7e2] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SettingsCardHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#f0ece8] px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function SettingsToggle({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-[#d9d4ce]",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[1.3rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function SentenceChip({
  tone,
  children,
}: {
  tone: "when" | "if" | "then";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-lg px-2.5 py-1 text-sm leading-snug",
        tone === "when" && "bg-sky-100 text-sky-900",
        tone === "if" && "bg-amber-100 text-amber-950",
        tone === "then" && "bg-emerald-100 text-emerald-950",
      )}
    >
      {children}
    </span>
  );
}
