import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";

/** Split marketing panel used by signup and other longer auth flows. */
export function AuthFrame({
  title,
  description,
  credit,
  children,
}: {
  title: string;
  description: string;
  /** Optional footer on the marketing panel. Never use demo “Northline” here. */
  credit?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1">
      <div className="relative hidden w-[40%] shrink-0 flex-col justify-between overflow-hidden bg-sidebar px-10 py-10 text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="auth-orb pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="auth-orb-delay pointer-events-none absolute right-[-3rem] bottom-10 size-56 rounded-full bg-white/8 blur-3xl"
        />
        <BrandMark
          className="auth-fade relative inline-flex items-center gap-2 text-sidebar-foreground"
          markClassName="size-[18px] text-primary"
        />
        <div className="relative">
          <p
            className="auth-rise font-heading text-[2.15rem] leading-[1.15] font-medium text-balance"
            style={{ animationDelay: "80ms" }}
          >
            Work that starts at someone’s front door.
          </p>
          <ol className="mt-10 space-y-5 text-sm">
            <AuthPoint index="01" label="Leads" copy="Homeowner walks to sold jobs." delay={180} />
            <AuthPoint index="02" label="Paper" copy="Estimates, invoices, insurance draws." delay={280} />
            <AuthPoint index="03" label="Field" copy="Calendar, photos, punch." delay={380} />
          </ol>
        </div>
        {credit ? (
          <p className="auth-fade relative text-[11px] tracking-[0.14em] text-sidebar-foreground/40 uppercase">
            {credit}
          </p>
        ) : (
          <span />
        )}
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="auth-rise w-full max-w-[22rem]" style={{ animationDelay: "60ms" }}>
          <div className="mb-8 lg:hidden">
            <BrandMark />
          </div>
          <h1 className="font-heading text-2xl font-medium">{title}</h1>
          <p className="mt-1.5 mb-8 text-sm leading-relaxed text-muted-foreground">{description}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function AuthPoint({
  index,
  label,
  copy,
  delay,
}: {
  index: string;
  label: string;
  copy: string;
  delay: number;
}) {
  return (
    <li
      className={cn("auth-rise grid grid-cols-[2.25rem_1fr] gap-3")}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="font-mono text-[11px] tracking-wide text-sidebar-foreground/40">{index}</span>
      <span>
        <span className="font-medium text-sidebar-foreground">{label}</span>
        <span className="mt-0.5 block text-sidebar-foreground/55">{copy}</span>
      </span>
    </li>
  );
}
