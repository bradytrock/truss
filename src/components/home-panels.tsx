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
      <div>{children}</div>
    </section>
  );
}

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

/** Compact Salesforce-style KPI tile (Amount Open / Closed Won / Avg Deal). */
export function HomeKpiTile({
  label,
  value,
  hint = "This month",
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-sm border border-[#c9c9c9] bg-white px-3 py-3 shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
      <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">{label}</p>
      <p className="mt-1.5 text-[1.65rem] leading-none font-semibold tabular-nums text-[#032d60]">
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-[#706e6b]">{hint}</p>
    </div>
  );
}

/** Semi-circle quota gauge like Salesforce Closed Won Sales. */
export function HomeGauge({
  value,
  target,
  format,
}: {
  value: number;
  target: number;
  format: (n: number) => string;
}) {
  const max = Math.max(target, value, 1);
  const ratio = Math.min(1, value / max);
  const angle = -90 + ratio * 180;
  const r = 70;
  const cx = 100;
  const cy = 92;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const point = (deg: number, radius = r) => ({
    x: cx + radius * Math.cos(toRad(deg)),
    y: cy + radius * Math.sin(toRad(deg)),
  });
  const arc = (from: number, to: number) => {
    const a = point(from);
    const b = point(to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
  };
  const needle = point(angle, r - 8);
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="h-36 w-full max-w-[16rem]">
        <path d={arc(-90, -30)} stroke="#ea001e" strokeWidth="14" fill="none" strokeLinecap="butt" />
        <path d={arc(-30, 30)} stroke="#fe9339" strokeWidth="14" fill="none" strokeLinecap="butt" />
        <path d={arc(30, 90)} stroke="#2e844a" strokeWidth="14" fill="none" strokeLinecap="butt" />
        <line
          x1={cx}
          y1={cy}
          x2={needle.x}
          y2={needle.y}
          stroke="#032d60"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="5" fill="#032d60" />
        <text
          x={cx}
          y={cy - 18}
          textAnchor="middle"
          className="fill-[#fe9339]"
          style={{ fontSize: "18px", fontWeight: 700 }}
        >
          {format(value)}
        </text>
      </svg>
      <p className="text-xs text-[#706e6b]">
        {target > 0 ? `${pct}% of ${format(target)} quota` : "Set a monthly quota in Settings"}
      </p>
    </div>
  );
}

/** Area / line chart for closed deals over time. */
export function HomeAreaChart({
  items,
  format,
  empty = "No closed deals in this window.",
}: {
  items: { key?: string; label: string; value: number }[];
  format: (n: number) => string;
  empty?: string;
}) {
  if (items.length === 0 || items.every((item) => item.value <= 0)) {
    return <p className="py-10 text-center text-sm text-[#706e6b]">{empty}</p>;
  }
  const width = 560;
  const height = 200;
  const padX = 8;
  const padTop = 16;
  const padBottom = 28;
  const peak = Math.max(...items.map((item) => item.value), 1);
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const coords = items.map((item, index) => {
    const x =
      items.length === 1
        ? width / 2
        : padX + (index / (items.length - 1)) * innerW;
    const y = padTop + innerH - (item.value / peak) * innerH;
    return { x, y, ...item };
  });
  const line = coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = `${line} L ${coords[coords.length - 1].x} ${padTop + innerH} L ${coords[0].x} ${padTop + innerH} Z`;
  const labelEvery = Math.max(1, Math.ceil(items.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full">
      <defs>
        <linearGradient id="homeAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0176d3" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0176d3" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((tick) => {
        const y = padTop + innerH - tick * innerH;
        return (
          <line
            key={tick}
            x1={padX}
            x2={width - padX}
            y1={y}
            y2={y}
            stroke="#e5e5e5"
            strokeWidth="1"
          />
        );
      })}
      <path d={area} fill="url(#homeAreaFill)" />
      <path d={line} fill="none" stroke="#0176d3" strokeWidth="2.5" strokeLinejoin="round" />
      {coords.map((point, index) =>
        index % labelEvery === 0 || index === coords.length - 1 ? (
          <text
            key={point.key ?? point.label}
            x={point.x}
            y={height - 8}
            textAnchor="middle"
            fill="#706e6b"
            style={{ fontSize: "10px" }}
          >
            {point.label}
          </text>
        ) : null,
      )}
      <title>
        {coords
          .filter((p) => p.value > 0)
          .map((p) => `${p.label}: ${format(p.value)}`)
          .join(" · ")}
      </title>
    </svg>
  );
}

const DONUT_COLORS = ["#032d60", "#0176d3", "#1b96ff", "#90d0fe", "#2e844a", "#706e6b"];

/** Donut chart for amount closed by lead source. */
export function HomeDonut({
  items,
  format,
  empty = "No closed deals this month.",
}: {
  items: { label: string; value: number }[];
  format: (n: number) => string;
  empty?: string;
}) {
  const slices = items.filter((item) => item.value > 0).slice(0, 6);
  const total = slices.reduce((sum, item) => sum + item.value, 0);
  if (!slices.length || total <= 0) {
    return <p className="py-10 text-center text-sm text-[#706e6b]">{empty}</p>;
  }

  const cx = 90;
  const cy = 90;
  const r = 68;
  const inner = 38;
  let cursor = -Math.PI / 2;
  const arcs = slices.map((item, index) => {
    const portion = item.value / total;
    const sweep = portion * Math.PI * 2;
    const start = cursor;
    const end = cursor + sweep;
    cursor = end;
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const ix1 = cx + inner * Math.cos(end);
    const iy1 = cy + inner * Math.sin(end);
    const ix2 = cx + inner * Math.cos(start);
    const iy2 = cy + inner * Math.sin(start);
    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2}`,
      "Z",
    ].join(" ");
    return { d, color: DONUT_COLORS[index % DONUT_COLORS.length], ...item, portion };
  });

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
      <svg viewBox="0 0 180 180" className="size-40 shrink-0">
        {arcs.map((arc) => (
          <path key={arc.label} d={arc.d} fill={arc.color}>
            <title>{`${arc.label}: ${format(arc.value)}`}</title>
          </path>
        ))}
        <text
          x={cx}
          y={cy + 5}
          textAnchor="middle"
          fill="#032d60"
          style={{ fontSize: "16px", fontWeight: 700 }}
        >
          {format(total)}
        </text>
      </svg>
      <ul className="w-full min-w-0 space-y-1.5">
        {arcs.map((arc) => (
          <li key={arc.label} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: arc.color }} />
            <span className="min-w-0 flex-1 truncate text-[#181818]">{arc.label}</span>
            <span className="tabular-nums text-[#706e6b]">{Math.round(arc.portion * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
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
