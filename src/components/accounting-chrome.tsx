import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const accCard =
  "rounded-2xl border border-[#ece7e1] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]";

export const accRed =
  "bg-[#c43832] text-white hover:bg-[#a82f2a] disabled:bg-[#e7d4d2] disabled:text-white";

export function CountPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "danger";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none font-medium",
        tone === "danger" ? "bg-[#fde8e6] text-[#c43832]" : "bg-[#eceae4] text-[#5e5a55]",
        className,
      )}
    >
      {children}
    </span>
  );
}
