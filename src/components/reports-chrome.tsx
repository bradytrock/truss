import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TableCell, TableRow } from "@/components/ui/table";
import { REPORT_COLORS } from "@/components/reports-charts";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "blue" | "orange";

const TONE_COLOR: Record<StatTone, string> = {
  default: REPORT_COLORS.ink,
  blue: REPORT_COLORS.blue,
  orange: REPORT_COLORS.orange,
};

export function ReportCard({
  children,
  className,
  highlight,
}: {
  children: ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        highlight && "border-[#c9d6f6] bg-[#e8eefc]",
        className,
      )}
      style={highlight ? undefined : { borderColor: REPORT_COLORS.border }}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  dot,
  highlight,
  className,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: StatTone;
  /** Colored swatch before the label, for metrics that match a chart series. */
  dot?: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <ReportCard highlight={highlight} className={cn("px-4 py-3.5", className)}>
      <p className="flex items-center gap-1.5 text-[13px]" style={{ color: REPORT_COLORS.muted }}>
        {dot ? <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: dot }} /> : null}
        {label}
      </p>
      <p
        className="mt-1.5 text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums"
        style={{ color: TONE_COLOR[tone] }}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-xs leading-snug" style={{ color: REPORT_COLORS.muted }}>
          {hint}
        </p>
      ) : null}
    </ReportCard>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("grid gap-3 sm:grid-cols-2", className)}>{children}</section>;
}

export function ReportPanel({
  title,
  description,
  action,
  footer,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <ReportCard className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] leading-tight font-semibold" style={{ color: REPORT_COLORS.ink }}>
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-xs leading-snug" style={{ color: REPORT_COLORS.muted }}>
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      <div className={cn("px-4 pb-4", bodyClassName)}>{children}</div>
      {footer ? (
        <div className="border-t px-4 py-2.5 text-xs" style={{ borderColor: REPORT_COLORS.border, color: REPORT_COLORS.muted }}>
          {footer}
        </div>
      ) : null}
    </ReportCard>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "default",
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  size?: "default" | "sm";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-0.5 rounded-lg bg-[#f1f3f6] p-0.5", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md whitespace-nowrap font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
              active ? "bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "hover:text-foreground",
            )}
            style={{ color: active ? REPORT_COLORS.ink : REPORT_COLORS.muted }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Black-on-white pill set: Last 7 days / Last 30 days … the inverse of Segmented. */
export function PillTabs<T extends string>({
  value,
  onChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-0.5 rounded-lg border bg-white p-0.5", className)}
      style={{ borderColor: REPORT_COLORS.border }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              active ? "bg-[#111827] text-white" : "hover:bg-[#f1f3f6]",
            )}
            style={active ? undefined : { color: REPORT_COLORS.ink }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function PersonAvatar({ name, photoUrl, size = "default" }: { name: string; photoUrl?: string; size?: "default" | "lg" }) {
  const photo = photoUrl?.trim() ?? "";
  return (
    <Avatar size={size} className="after:border-transparent">
      {photo ? <AvatarImage src={photo} alt="" /> : null}
      <AvatarFallback
        className={cn("font-semibold", size === "lg" ? "text-sm" : "text-[11px]")}
        style={{ backgroundColor: REPORT_COLORS.blueTint, color: REPORT_COLORS.blue }}
      >
        {initials(name) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}

export function PersonCell({
  name,
  subtitle,
  photoUrl,
  you,
}: {
  name: string;
  subtitle?: string;
  photoUrl?: string;
  you?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <PersonAvatar name={name} photoUrl={photoUrl} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm leading-tight font-semibold" style={{ color: REPORT_COLORS.ink }}>
          <span className="truncate">{name}</span>
          {you ? <YouBadge /> : null}
        </p>
        {subtitle ? (
          <p className="text-xs leading-tight" style={{ color: REPORT_COLORS.muted }}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function YouBadge() {
  return (
    <span
      className="inline-flex h-4 items-center rounded-full px-1.5 text-[9px] font-bold tracking-wider text-white uppercase"
      style={{ backgroundColor: REPORT_COLORS.blue }}
    >
      You
    </span>
  );
}

export function RankBadge({ rank }: { rank: number }) {
  const podium = rank <= 3;
  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-[5px] text-xs font-semibold tabular-nums",
        podium ? "text-white" : "",
      )}
      style={podium ? { backgroundColor: REPORT_COLORS.ink } : { color: REPORT_COLORS.muted }}
    >
      {rank}
    </span>
  );
}

export function Pill({ children, tone = "orange" }: { children: ReactNode; tone?: "orange" | "neutral" }) {
  const style =
    tone === "orange"
      ? { backgroundColor: REPORT_COLORS.orangeTint, color: REPORT_COLORS.orangeText }
      : { backgroundColor: REPORT_COLORS.tint, color: REPORT_COLORS.ink };
  return (
    <span className="inline-flex max-w-[11rem] items-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium" style={style}>
      {children}
    </span>
  );
}

export function TotalRow({ children }: { children: ReactNode }) {
  return (
    <TableRow className="border-t-2 font-semibold hover:bg-transparent" style={{ borderTopColor: "#cfd4db" }}>
      {children}
    </TableRow>
  );
}

export function EmptyRow({ cols, message = "Nothing in this date range." }: { cols: number; message?: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={cols} className="py-6 text-center text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}

export function Num({ children, tone, bold, className }: { children: ReactNode; tone?: StatTone; bold?: boolean; className?: string }) {
  return (
    <span
      className={cn("tabular-nums", bold && "font-semibold", className)}
      style={tone && tone !== "default" ? { color: TONE_COLOR[tone] } : undefined}
    >
      {children}
    </span>
  );
}
