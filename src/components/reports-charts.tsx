import { cn } from "@/lib/utils";

export function VerticalBars({
  items,
  format,
}: {
  items: { label: string; value: number }[];
  format: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  if (items.length === 0) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">Nothing in this date range.</p>;
  }
  return (
    <div className="flex h-48 items-end gap-1.5 px-4 pb-2 pt-4">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full max-w-10 rounded-t-sm bg-primary/80"
            style={{ height: `${Math.max(4, (item.value / max) * 100)}%` }}
            title={format(item.value)}
          />
          <p className="w-full truncate text-center text-[10px] text-muted-foreground">{item.label}</p>
        </div>
      ))}
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
  const maxStage = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="grid gap-2">
      {rows.map((row, index) => {
        const countPct = mode === "funnel" ? ((maxStage - index * (maxStage / (rows.length + 1))) / maxStage) * (row.count > 0 ? 1 : 0.15) : row.count / maxCount;
        const valuePct = row.value / maxValue;
        return (
          <div key={row.id} className="grid grid-cols-[9rem_1fr_1fr] items-center gap-3">
            <p className="truncate text-xs font-medium">{row.label}</p>
            <div className="flex items-center justify-end gap-2">
              <span className="text-[11px] tabular-nums text-muted-foreground">{row.count}</span>
              <div className="flex h-6 w-full max-w-[14rem] justify-end bg-muted/60">
                <div className="h-full bg-sky-600/80" style={{ width: `${Math.max(row.count ? 6 : 0, countPct * 100)}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-full max-w-[14rem] bg-muted/60">
                <div className="h-full bg-emerald-700/75" style={{ width: `${Math.max(row.value ? 6 : 0, valuePct * 100)}%` }} />
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">{formatMoney(row.value)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
