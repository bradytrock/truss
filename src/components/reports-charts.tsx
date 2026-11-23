import Link from "next/link";
import { cn } from "@/lib/utils";

/** Report palette, sampled from the dashboard design. Chart ink only — chrome stays on theme tokens. */
export const REPORT_COLORS = {
  ink: "#111827",
  muted: "#5b6472",
  border: "#e3e6eb",
  tint: "#f1f3f6",
  blue: "#1e4fd8",
  blueLight: "#a5b9ef",
  blueTint: "#e8eefc",
  teal: "#0f766e",
  tealLight: "#9fc8c5",
  slate: "#475569",
  slateLight: "#b5bbc3",
  orange: "#c2410c",
  orangeDark: "#7c2d12",
  orangeTint: "#fbeee8",
  orangeText: "#9a3412",
} as const;

export type BarPalette = { bar: string; light: string };

export const BAR_PALETTES: Record<"blue" | "teal" | "slate", BarPalette> = {
  blue: { bar: REPORT_COLORS.blue, light: REPORT_COLORS.blueLight },
  teal: { bar: REPORT_COLORS.teal, light: REPORT_COLORS.tealLight },
  slate: { bar: REPORT_COLORS.slate, light: REPORT_COLORS.slateLight },
};

export function VerticalBars({
  items,
  format,
  palette = BAR_PALETTES.blue,
  highlightKey,
  className,
}: {
  items: { key?: string; label: string; value: number }[];
  format: (value: number) => string;
  palette?: BarPalette;
  /** Month still in progress; drawn lighter so it does not read as a drop. */
  highlightKey?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">Nothing in this date range.</p>;
  }
  const max = Math.max(...items.map((item) => item.value), 0);
  const peak = max > 0 ? max : 1;
  const dense = items.length > 14;
  return (
    <div className={cn("flex h-52 items-stretch gap-1.5", className)}>
      {items.map((item, index) => {
        const height = item.value > 0 ? Math.max(4, (item.value / peak) * 100) : 0;
        const key = item.key ?? `${item.label}-${index}`;
        const current = Boolean(highlightKey && item.key === highlightKey);
        const showLabel = !dense || index % Math.ceil(items.length / 12) === 0;
        return (
          <div key={key} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
            <p
              className={cn(
                "h-4 w-full truncate text-center text-[11px] tabular-nums",
                dense && "opacity-0 group-hover:opacity-100",
              )}
              style={{ color: REPORT_COLORS.muted }}
            >
              {item.value ? format(item.value) : ""}
            </p>
            <div className="flex w-full flex-1 items-end justify-center">
              <div
                className="w-full max-w-12 rounded-t-[3px] transition-opacity group-hover:opacity-80"
                style={{
                  height: `${height}%`,
                  backgroundColor: item.value > 0 ? (current ? palette.light : palette.bar) : "transparent",
                }}
                title={`${item.label}: ${format(item.value)}`}
              />
            </div>
            <p
              className={cn("w-full truncate text-center text-[11px]", !showLabel && "invisible")}
              style={{ color: REPORT_COLORS.muted }}
            >
              {item.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function ShareBar({
  value,
  color = REPORT_COLORS.blue,
  track = REPORT_COLORS.tint,
  className,
}: {
  value: number;
  color?: string;
  track?: string;
  className?: string;
}) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full", className)} style={{ backgroundColor: track }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, value) * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

/** Horizontal bar with its label beside it, for table cells. */
export function BarCell({
  value,
  label,
  color,
  track,
  labelClassName,
  barClassName,
}: {
  value: number;
  label: string;
  color?: string;
  track?: string;
  labelClassName?: string;
  barClassName?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2.5">
      <ShareBar value={value} color={color} track={track} className={cn("w-24 shrink-0 sm:w-32", barClassName)} />
      <span className={cn("w-14 shrink-0 text-right text-sm tabular-nums", labelClassName)}>{label}</span>
    </div>
  );
}

export const SOURCE_COLORS = [
  REPORT_COLORS.blue,
  REPORT_COLORS.orange,
  REPORT_COLORS.teal,
  "#7c3aed",
  "#b45309",
  "#0e7490",
  "#9aa3af",
];

export function sourceColor(index: number) {
  return SOURCE_COLORS[index % SOURCE_COLORS.length];
}

export function Swatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-[2px]", className)}
      style={{ backgroundColor: color }}
    />
  );
}

export function StackedShare({
  items,
  format = (value) => String(value),
  caption,
}: {
  items: { label: string; value: number }[];
  format?: (value: number) => string;
  caption?: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!items.length || total === 0) {
    return <p className="text-sm text-muted-foreground">No leads in this date range.</p>;
  }
  return (
    <div className="space-y-2">
      {caption ? (
        <p className="text-xs" style={{ color: REPORT_COLORS.muted }}>
          {caption}
        </p>
      ) : null}
      <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-[4px]">
        {items.map((item, index) => (
          <div
            key={item.label}
            style={{ width: `${(item.value / total) * 100}%`, backgroundColor: sourceColor(index) }}
            title={`${item.label}: ${format(item.value)} (${Math.round((item.value / total) * 100)}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item, index) => (
          <span key={item.label} className="inline-flex items-center gap-1.5 text-xs">
            <Swatch color={sourceColor(index)} />
            <span className="font-medium">{item.label}</span>
            <span className="tabular-nums" style={{ color: REPORT_COLORS.muted }}>
              {((item.value / total) * 100).toFixed(1)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Linear blend between two hex colors; t in [0, 1]. */
function mixHex(from: string, to: string, t: number) {
  const parse = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  const channel = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${channel(r1, r2)}, ${channel(g1, g2)}, ${channel(b1, b2)})`;
}

/** Early columns are gray, late ones blue — the same ramp the design uses. */
export function stageColor(index: number, count: number) {
  const t = count > 1 ? index / (count - 1) : 1;
  return mixHex("#cbd5e1", REPORT_COLORS.blue, t);
}

export function PipelineBars({
  rows,
  mode,
  metric,
  formatMoney,
  hrefFor,
}: {
  rows: { id: string; label: string; count: number; value: number }[];
  mode: "funnel" | "bars";
  metric: "count" | "value";
  formatMoney: (value: number) => string;
  hrefFor?: (id: string) => string;
}) {
  const peak = Math.max(...rows.map((row) => (metric === "count" ? row.count : row.value)), 1);
  return (
    <div className="grid gap-1">
      {rows.map((row, index) => {
        const amount = metric === "count" ? row.count : row.value;
        const share = amount / peak;
        const width = amount > 0 ? Math.max(6, share * 100) : 0;
        const color = stageColor(index, rows.length);
        const body = (
          <>
            <p className="truncate text-[13px] font-medium">{row.label}</p>
            <div className={cn("flex h-6 min-w-0 flex-1", mode === "funnel" ? "justify-center" : "justify-start")}>
              <div
                className="h-full rounded-[4px] transition-[width]"
                style={{ width: `${width}%`, backgroundColor: color }}
                title={`${row.label}: ${row.count} jobs · ${formatMoney(row.value)}`}
              />
            </div>
            <p className="w-16 shrink-0 text-right text-[13px] tabular-nums">
              <span className="font-semibold">{row.count}</span>{" "}
              <span style={{ color: REPORT_COLORS.muted }}>jobs</span>
            </p>
            <p className="w-20 shrink-0 text-right text-[13px] font-medium tabular-nums">{formatMoney(row.value)}</p>
          </>
        );
        const className =
          "grid grid-cols-[11rem_1fr_auto_auto] items-center gap-4 rounded-md px-2 py-2 transition-colors hover:bg-[#f5f6f8]";
        return hrefFor ? (
          <Link key={row.id} href={hrefFor(row.id)} className={className}>
            {body}
          </Link>
        ) : (
          <div key={row.id} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
