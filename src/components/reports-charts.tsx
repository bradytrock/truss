import { cn } from "@/lib/utils";

export function VerticalBars({
  items,
  format,
}: {
  items: { key?: string; label: string; value: number }[];
  format: (value: number) => string;
}) {
  if (items.length === 0) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">Nothing in this date range.</p>;
  }
  const max = Math.max(...items.map((item) => item.value), 0);
  const peak = max > 0 ? max : 1;
  return (
    <div className="flex h-56 items-stretch gap-1.5 px-3 pb-3 pt-2 sm:px-4">
      {items.map((item, index) => {
        const height = item.value > 0 ? Math.max(8, (item.value / peak) * 100) : 0;
        return (
          <div
            key={item.key ?? `${item.label}-${index}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <p className="h-4 w-full truncate text-center text-[10px] tabular-nums text-foreground">
              {item.value ? format(item.value) : ""}
            </p>
            <div className="flex w-full flex-1 items-end justify-center">
              <div
                className={cn(
                  "w-full max-w-12 rounded-t-sm",
                  item.value > 0 ? "bg-primary" : "bg-transparent",
                )}
                style={{ height: `${height}%` }}
                title={`${item.label}: ${format(item.value)}`}
              />
            </div>
            <p className="w-full truncate text-center text-[10px] text-muted-foreground">{item.label}</p>
          </div>
        );
      })}
    </div>
  );
}

export function ShareBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full bg-primary/70", className)} style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

export const SOURCE_SWATCH = [
  "bg-sky-900",
  "bg-sky-600",
  "bg-sky-400",
  "bg-emerald-600",
  "bg-orange-500",
  "bg-violet-500",
  "bg-slate-500",
];

export function sourceSwatch(index: number) {
  return SOURCE_SWATCH[index % SOURCE_SWATCH.length];
}

export function StackedShare({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!items.length || total === 0) {
    return <p className="text-sm text-muted-foreground">No leads in this date range.</p>;
  }
  return (
    <div className="flex h-5 w-full overflow-hidden rounded-sm bg-muted">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={sourceSwatch(index)}
          style={{ width: `${(item.value / total) * 100}%` }}
          title={`${item.label}: ${item.value}`}
        />
      ))}
    </div>
  );
}

export function PipelineBars({
  rows,
  mode,
  formatMoney,
}: {
  rows: { id: string; label: string; count: number; value: number }[];
  mode: "funnel" | "bars";
  formatMoney: (value: number) => string;
}) {
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="grid gap-1.5">
      {rows.map((row, index) => {
        const taper = mode === "funnel" ? 1 - (index / (rows.length + 3)) * 0.4 : 1;
        const countPct = (row.count / maxCount) * taper;
        const valuePct = (row.value / maxValue) * taper;
        return (
          <div key={row.id} className="grid grid-cols-[9.5rem_1fr_1fr] items-center gap-3">
            <p className="truncate text-xs font-medium">{row.label}</p>
            <div className="flex items-center justify-end gap-2">
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {row.count} jobs
              </span>
              <div className="flex h-7 min-w-0 flex-1 justify-end bg-muted/40">
                <div
                  className="h-full bg-sky-600/80"
                  style={{ width: `${Math.max(row.count ? 6 : 0, countPct * 100)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-7 min-w-0 flex-1 bg-muted/40">
                <div
                  className="h-full bg-emerald-700/75"
                  style={{ width: `${Math.max(row.value ? 6 : 0, valuePct * 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {formatMoney(row.value)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
