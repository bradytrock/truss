"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export type BandTone = "red" | "amber" | "purple" | "green" | "cyan" | "slate";

const BAND: Record<BandTone, { background: string; color: string }> = {
  red: { background: "#5a1717", color: "#fecaca" },
  amber: { background: "#5a4410", color: "#fde68a" },
  purple: { background: "#3b2a6b", color: "#ddd6fe" },
  green: { background: "#14422a", color: "#bbf7d0" },
  cyan: { background: "#0f3f47", color: "#a5f3fc" },
  slate: { background: "#1f2937", color: "#e5e7eb" },
};

export type PopupArrow = { side: "top" | "bottom"; left: number };

export function StormPopupShell({
  titleId,
  label,
  headerStyle,
  band,
  header,
  children,
  actions,
  footer,
  arrow,
  width = 320,
  onClose,
  onInteract,
}: {
  titleId: string;
  label: string;
  /** Colored header block for the big-number cards (radar, hail at a point). */
  headerStyle?: CSSProperties;
  /** Thin tinted strip above a neutral header, the way a job card shows its threat. */
  band?: { tone: BandTone; icon?: ReactNode; label: ReactNode; trailing?: ReactNode };
  header: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  arrow?: PopupArrow | null;
  width?: number;
  onClose: () => void;
  onInteract: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  const tint = band ? BAND[band.tone] : null;

  return (
    <div
      role="dialog"
      aria-label={label}
      aria-labelledby={titleId}
      onPointerDown={(event) => {
        event.stopPropagation();
        onInteract();
      }}
      onClick={(event) => event.stopPropagation()}
      className="relative max-w-[calc(100vw-48px)] rounded-xl border border-white/10 bg-[#171a21] text-white shadow-2xl tabular-nums"
      style={{ width }}
    >
      {arrow ? (
        <span
          aria-hidden
          className="absolute size-3 rotate-45 border-white/10 bg-[#171a21]"
          style={
            arrow.side === "bottom"
              ? { bottom: -7, left: Math.round(arrow.left) - 6, borderRightWidth: 1, borderBottomWidth: 1 }
              : { top: -7, left: Math.round(arrow.left) - 6, borderLeftWidth: 1, borderTopWidth: 1, background: tint?.background ?? (headerStyle?.background as string | undefined) ?? "#171a21" }
          }
        />
      ) : null}
      <div className="overflow-hidden rounded-xl">
        {band && tint ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold" style={tint}>
            {band.icon ? <span className="flex size-4 shrink-0 items-center justify-center">{band.icon}</span> : null}
            <span className="min-w-0 flex-1 truncate">{band.label}</span>
            {band.trailing ? <span className="shrink-0 font-mono text-[11px] font-medium opacity-90">{band.trailing}</span> : null}
          </div>
        ) : null}
        <div className="relative px-4 pt-3 pb-3" style={headerStyle}>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-full bg-black/25 text-lg leading-none text-white hover:bg-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            ×
          </button>
          <div id={titleId}>{header}</div>
        </div>
        {children ? <div className="px-4 pb-3">{children}</div> : null}
        {actions ? <div className="space-y-2 px-4 pb-3">{actions}</div> : null}
        {footer ? <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2 font-mono text-[11px] text-white/55">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Eyebrow title with a hairline above, holding rows or a stat grid. */
export function PopupSection({ title, children, first = false }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <section className={first ? "" : "mt-3 border-t border-white/10 pt-3"}>
      <p className="text-[10px] font-semibold tracking-wide text-white/50 uppercase">{title}</p>
      <div className="mt-1.5 space-y-1">{children}</div>
    </section>
  );
}

/** Label on the left, a monospaced value on the right. */
export function PopupRow({ label, value, muted = false }: { label: ReactNode; value: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className={`min-w-0 truncate ${muted ? "text-white/60" : "text-white/85"}`}>{label}</span>
      <span className="shrink-0 font-mono text-xs font-semibold text-white">{value}</span>
    </div>
  );
}

/** Tiny label over a monospaced value, in two or three columns. */
export function PopupStats({ items, columns = 3 }: { items: Array<{ label: string; value: ReactNode }>; columns?: 2 | 3 }) {
  return (
    <dl className={`grid gap-x-3 gap-y-2.5 ${columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">{item.label}</dt>
          <dd className="mt-0.5 truncate font-mono text-sm font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PopupSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <div className="h-3 w-24 animate-pulse rounded bg-white/15" />
      <div className="h-8 w-40 animate-pulse rounded bg-white/15" />
      <div className="grid grid-cols-2 gap-2 pt-2">
        <div className="h-10 animate-pulse rounded bg-white/10" />
        <div className="h-10 animate-pulse rounded bg-white/10" />
        <div className="h-10 animate-pulse rounded bg-white/10" />
        <div className="h-10 animate-pulse rounded bg-white/10" />
      </div>
    </div>
  );
}

/** Small dark pill: the "looking up" state and the no-weather toast. */
export function PopupPill({ children, icon, spinning = false, live = false }: { children: ReactNode; icon?: ReactNode; spinning?: boolean; live?: boolean }) {
  return (
    <div
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      className="inline-flex max-w-[calc(100vw-48px)] items-center gap-2 rounded-full border border-white/10 bg-[#171a21] px-3 py-1.5 text-xs text-white shadow-xl"
    >
      {spinning ? <span aria-hidden className="size-3 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white" /> : icon ? <span className="flex shrink-0 items-center text-emerald-300">{icon}</span> : null}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export type PopupButtonVariant = "primary" | "danger" | "outline";

export function popupButtonClass(variant: PopupButtonVariant | boolean = "outline") {
  const kind: PopupButtonVariant = variant === true ? "primary" : variant === false ? "outline" : variant;
  const base = "flex h-9 w-full items-center justify-center rounded-lg px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-60";
  if (kind === "primary") return `${base} bg-white text-neutral-900 hover:bg-white/90`;
  if (kind === "danger") return `${base} bg-[#dc2626] text-white hover:bg-[#b91c1c]`;
  return `${base} border border-white/15 text-white hover:bg-white/10`;
}
