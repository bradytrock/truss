"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SuitePage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1180px] space-y-5 px-4 py-6 sm:px-6", className)}>{children}</div>;
}

export function SuiteTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-heading text-[2rem] leading-none font-medium tracking-tight text-[#1c1b1a]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-[#6f6a64]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SuiteCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-[#e7e4df] bg-white", className)}>{children}</section>;
}

export function StatCard({
  label,
  value,
  hint,
  dark = false,
}: {
  label: string;
  value: string;
  hint?: string;
  dark?: boolean;
}) {
  return (
    <SuiteCard className={cn("px-4 py-3.5", dark && "border-[#1c1b1a] bg-[#1c1b1a] text-white")}>
      <p className={cn("text-[10px] tracking-[0.14em] uppercase", dark ? "text-white/55" : "text-[#8a8680]")}>{label}</p>
      <p className="font-heading mt-1 text-[1.85rem] leading-none font-medium tracking-tight">{value}</p>
      {hint ? <p className={cn("mt-2 text-xs", dark ? "text-emerald-300" : "text-[#6f6a64]")}>{hint}</p> : null}
    </SuiteCard>
  );
}

export function PhotoWell({
  label = "Photo from job gallery",
  className,
  src,
}: {
  label?: string;
  className?: string;
  src?: string;
}) {
  if (src) {
    return (
      <div className={cn("overflow-hidden rounded-md bg-[#e7e2da]", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={cn("grid place-items-center rounded-md bg-[#e7e2da] px-3 text-center text-[12px] text-[#8d877e]", className)}>
      {label}
    </div>
  );
}

export function ToneBadge({
  children,
  tone = "red",
}: {
  children: ReactNode;
  tone?: "red" | "green" | "ink" | "gold" | "stone";
}) {
  const styles = {
    red: "bg-[#d71c27] text-white",
    green: "bg-[#1f6f5b] text-white",
    ink: "bg-[#1c1b1a] text-white",
    gold: "bg-[#8a6a2f] text-white",
    stone: "bg-[#eceae6] text-[#3f3c38]",
  };
  return (
    <span className={cn("inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase", styles[tone])}>
      {children}
    </span>
  );
}
