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
