"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  donutIndexAt,
  nearestChartIndex,
  pointerInViewBox,
} from "@/lib/home-chart-motion";
import { cn } from "@/lib/utils";

export const HOME_CARD_CLASS =
  "overflow-hidden rounded-2xl border border-black/6 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)]";

/** Soft dashboard card chrome used on Home. */
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
    <section className={cn(HOME_CARD_CLASS, "h-full", className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-[#181818]">{title}</h2>
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
      <div className="px-5 pb-5 pt-1">{children}</div>
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

/** Compact KPI tile (Amount Open / Closed Won / Avg Deal). */
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
    <div className={cn(HOME_CARD_CLASS, "flex h-full flex-col justify-between px-5 py-5")}>
      <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">{label}</p>
      <p className="mt-4 text-[2rem] leading-none font-semibold tabular-nums text-[#0f172a]">
        {value}
      </p>
      <p className="mt-3 text-[11px] text-[#706e6b]">{hint}</p>
    </div>
  );
}

function ChartTip({
  title,
  value,
  className,
}: {
  title: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 rounded-lg border border-black/8 bg-white px-2.5 py-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.12)]",
        className,
      )}
    >
      <p className="text-[11px] text-[#706e6b]">{title}</p>
      <p className="text-sm font-semibold tabular-nums text-[#0f172a]">{value}</p>
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
  const [drawn, setDrawn] = useState(false);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
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
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;

  return (
    <div className="relative flex flex-col items-center">
      <svg
        viewBox="0 0 200 120"
        className="h-36 w-full max-w-[16rem] cursor-pointer"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <path d={arc(-90, -30)} stroke="#ea001e" strokeWidth="14" fill="none" strokeLinecap="butt" />
        <path d={arc(-30, 30)} stroke="#fe9339" strokeWidth="14" fill="none" strokeLinecap="butt" />
        <path d={arc(30, 90)} stroke="#2e844a" strokeWidth="14" fill="none" strokeLinecap="butt" />
        <g
          className="home-gauge-needle"
          style={{
            transform: `rotate(${drawn ? angle : -90}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
          }}
        >
          <line
            x1={cx}
            y1={cy}
            x2={cx}
            y2={cy - (r - 8)}
            stroke="#032d60"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
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
      {hover ? (
        <ChartTip
          title="Closed won this month"
          value={
            target > 0 ? `${format(value)} · ${pct}% of ${format(target)}` : format(value)
          }
          className="bottom-10 left-1/2 -translate-x-1/2"
        />
      ) : null}
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
  const [hover, setHover] = useState<number | null>(null);
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
  const active = hover !== null ? coords[hover] : null;

  function onMove(event: MouseEvent<SVGSVGElement>) {
    const point = pointerInViewBox(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      width,
      height,
    );
    setHover(nearestChartIndex(point.x, coords.map((item) => item.x)));
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="homeAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b96ff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#1b96ff" stopOpacity="0.02" />
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
        <path className="home-chart-area" d={area} fill="url(#homeAreaFill)" />
        <path
          className="home-chart-line"
          d={line}
          fill="none"
          stroke="#0176d3"
          strokeWidth="2.5"
          strokeLinejoin="round"
          pathLength={1}
        />
        {coords.map((point, index) => (
          <circle
            key={`dot-${point.key ?? point.label}`}
            className="home-chart-dot"
            cx={point.x}
            cy={point.y}
            r={hover === index ? 5.5 : 3.5}
            fill="#fff"
            stroke={hover === index ? "#0176d3" : "#e8a317"}
            strokeWidth="2"
            style={{ animationDelay: `${120 + index * 35}ms` }}
          />
        ))}
        {active ? (
          <line
            x1={active.x}
            x2={active.x}
            y1={padTop}
            y2={padTop + innerH}
            stroke="#0176d3"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ) : null}
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
      </svg>
      {active ? (
        <ChartTip
          title={active.label}
          value={format(active.value)}
          className={cn(
            "top-2",
            active.x > width * 0.62 ? "right-2" : "left-2",
          )}
        />
      ) : null}
    </div>
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
  const [hover, setHover] = useState<number | null>(null);
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
    return {
      d,
      color: DONUT_COLORS[index % DONUT_COLORS.length],
      start,
      end,
      ...item,
      portion,
    };
  });

  const active = hover !== null ? arcs[hover] : null;

  function onMove(event: MouseEvent<SVGSVGElement>) {
    const point = pointerInViewBox(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      180,
      180,
    );
    const index = donutIndexAt(
      point.x,
      point.y,
      cx,
      cy,
      inner,
      r,
      arcs.map((arc) => ({ start: arc.start, end: arc.end })),
    );
    setHover(index < 0 ? null : index);
  }

  return (
    <div className="relative flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
      <svg
        viewBox="0 0 180 180"
        className="size-40 shrink-0 cursor-pointer"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {arcs.map((arc, index) => (
          <path
            key={arc.label}
            className="home-chart-slice"
            d={arc.d}
            fill={arc.color}
            opacity={hover === null || hover === index ? 1 : 0.35}
            style={{ animationDelay: `${index * 80}ms` }}
            onMouseEnter={() => setHover(index)}
          />
        ))}
        <text
          x={cx}
          y={cy + 5}
          textAnchor="middle"
          fill="#032d60"
          style={{ fontSize: "16px", fontWeight: 700 }}
        >
          {format(active?.value ?? total)}
        </text>
      </svg>
      <ul className="w-full min-w-0 space-y-1.5">
        {arcs.map((arc, index) => (
          <li
            key={arc.label}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-xs",
              hover === index && "bg-[#f3f8fd]",
            )}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: arc.color }} />
            <span className="min-w-0 flex-1 truncate text-[#181818]">{arc.label}</span>
            <span className="tabular-nums text-[#706e6b]">{Math.round(arc.portion * 100)}%</span>
          </li>
        ))}
      </ul>
      {active ? (
        <ChartTip
          title={active.label}
          value={`${format(active.value)} · ${Math.round(active.portion * 100)}%`}
          className="top-0 right-0 sm:top-2 sm:right-2"
        />
      ) : null}
    </div>
  );
}

/** Horizontal stage cards for pipeline value. */
export function PipelinePath({
  stages,
}: {
  stages: Array<{ key: string; label: string; value: string; active?: boolean }>;
}) {
  return (
    <ol className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {stages.map((stage) => (
        <li
          key={stage.key}
          className={cn(
            "rounded-xl border px-3 py-3",
            stage.active
              ? "border-[#e8a317]/70 bg-[#fff8e8] text-[#181818] shadow-[0_6px_16px_rgba(232,163,23,0.12)]"
              : "border-black/6 bg-[#f8fafc] text-[#181818]",
          )}
        >
          <span className="text-[10px] font-semibold tracking-wide text-[#706e6b] uppercase">
            {stage.label}
          </span>
          <span className="mt-1.5 block text-base font-semibold tabular-nums">{stage.value}</span>
        </li>
      ))}
    </ol>
  );
}
