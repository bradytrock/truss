import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Salesforce-style related list / panel chrome used on Home. */
export function RelatedList({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-sm border border-[#c9c9c9] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.05)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#c9c9c9] bg-[#f3f3f3] px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#181818]">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-snug text-[#706e6b]">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-0 py-0">{children}</div>
    </section>
  );
}

/** Dashboard chart panel — same Lightning chrome as related lists. */
export function DashboardChart({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RelatedList title={title} description={description} action={action} className={className}>
      <div className="px-3 py-3">{children}</div>
    </RelatedList>
  );
}

/** Vertical bars for homepage pipeline / desk charts. */
export function HomeBars({
  items,
  format,
  empty = "Nothing to chart yet.",
}: {
  items: { key?: string; label: string; value: number }[];
  format: (value: number) => string;
  empty?: string;
}) {
  if (items.length === 0 || items.every((item) => item.value <= 0)) {
    return <p className="py-8 text-center text-sm text-[#706e6b]">{empty}</p>;
  }
  const peak = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="flex h-44 items-stretch gap-2 sm:h-52">
      {items.map((item, index) => {
        const height = item.value > 0 ? Math.max(10, (item.value / peak) * 100) : 0;
        return (
          <div
            key={item.key ?? `${item.label}-${index}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <p className="h-4 w-full truncate text-center text-[10px] font-semibold tabular-nums text-[#181818]">
              {item.value ? format(item.value) : ""}
            </p>
            <div className="flex w-full flex-1 items-end justify-center rounded-sm bg-[#f3f3f3]">
              <div
                className={cn("w-full max-w-14 rounded-t-sm", item.value > 0 ? "bg-[#0176d3]" : "bg-transparent")}
                style={{ height: `${height}%` }}
                title={`${item.label}: ${format(item.value)}`}
              />
            </div>
            <p className="w-full truncate text-center text-[10px] font-medium text-[#706e6b]">
              {item.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal share bars for mix charts (win rate, desk mix). */
export function HomeShareRows({
  items,
  empty = "Nothing to chart yet.",
}: {
  items: { label: string; value: number; hint?: string; tone?: "brand" | "success" | "warn" | "muted" }[];
  empty?: string;
}) {
  if (items.length === 0 || items.every((item) => item.value <= 0)) {
    return <p className="py-8 text-center text-sm text-[#706e6b]">{empty}</p>;
  }
  const peak = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-[#181818]">{item.label}</span>
            <span className="text-[11px] tabular-nums text-[#706e6b]">
              {item.hint ?? String(item.value)}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-sm bg-[#e5e5e5]">
            <div
              className={cn(
                "h-full rounded-sm",
                item.tone === "success"
                  ? "bg-[#45c65a]"
                  : item.tone === "warn"
                    ? "bg-[#fe9339]"
                    : item.tone === "muted"
                      ? "bg-[#706e6b]"
                      : "bg-[#0176d3]",
              )}
              style={{ width: `${Math.max(item.value > 0 ? 4 : 0, (item.value / peak) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RelatedListLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-xs font-semibold text-[#0176d3] hover:text-[#014486] hover:underline"
    >
      {children}
    </Link>
  );
}

/** Horizontal Lightning Path for pipeline stages. */
export function PipelinePath({
  stages,
}: {
  stages: Array<{ key: string; label: string; value: string; active?: boolean }>;
}) {
  return (
    <ol className="flex min-w-0 overflow-x-auto">
      {stages.map((stage, index) => {
        const isLast = index === stages.length - 1;
        return (
          <li
            key={stage.key}
            className={cn(
              "relative flex min-w-[7.5rem] flex-1 flex-col justify-center border-y border-[#c9c9c9] px-3 py-2.5",
              index === 0 && "border-l",
              "border-r",
              stage.active ? "bg-[#0176d3] text-white" : "bg-[#f3f3f3] text-[#181818]",
            )}
          >
            {!isLast ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-1/2 -right-2 z-10 size-4 -translate-y-1/2 rotate-45 border-t border-r",
                  stage.active
                    ? "border-[#0176d3] bg-[#0176d3]"
                    : "border-[#c9c9c9] bg-[#f3f3f3]",
                )}
              />
            ) : null}
            <span
              className={cn(
                "text-[10px] font-semibold tracking-wide uppercase",
                stage.active ? "text-white/80" : "text-[#706e6b]",
              )}
            >
              {stage.label}
            </span>
            <span className="mt-0.5 text-sm font-semibold tabular-nums">{stage.value}</span>
          </li>
        );
      })}
    </ol>
  );
}
