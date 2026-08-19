import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";

export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1">
      <div className="relative hidden w-[40%] shrink-0 flex-col justify-between bg-sidebar px-10 py-10 text-sidebar-foreground lg:flex">
        <BrandMark
          className="inline-flex items-center gap-2 text-sidebar-foreground"
          markClassName="size-[18px] text-primary"
        />
        <div>
          <p className="font-heading text-[2.15rem] leading-[1.15] font-medium text-balance">
            Work that starts at someone’s front door.
          </p>
          <ol className="mt-10 space-y-5 text-sm">
            <AuthPoint index="01" label="Leads" copy="Homeowner walks to sold jobs." />
            <AuthPoint index="02" label="Paper" copy="Estimates, invoices, insurance draws." />
            <AuthPoint index="03" label="Field" copy="Schedule, photos, punch." />
          </ol>
        </div>
        <p className="text-[11px] tracking-[0.14em] text-sidebar-foreground/40 uppercase">
          Northline Construction · Denver
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[22rem]">
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

function AuthPoint({ index, label, copy }: { index: string; label: string; copy: string }) {
  return (
    <li className={cn("grid grid-cols-[2.25rem_1fr] gap-3")}>
      <span className="font-mono text-[11px] tracking-wide text-sidebar-foreground/40">{index}</span>
      <span>
        <span className="font-medium text-sidebar-foreground">{label}</span>
        <span className="mt-0.5 block text-sidebar-foreground/55">{copy}</span>
      </span>
    </li>
  );
}
