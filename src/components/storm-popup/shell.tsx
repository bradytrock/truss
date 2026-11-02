"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export function StormPopupShell({
  titleId,
  label,
  headerStyle,
  header,
  children,
  actions,
  footer,
  onClose,
  onInteract,
}: {
  titleId: string;
  label: string;
  headerStyle?: CSSProperties;
  header: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  onInteract: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

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
      className="w-[320px] max-w-[calc(100vw-48px)] overflow-hidden rounded-xl border border-white/10 bg-[#1a1d24] text-white shadow-2xl tabular-nums"
    >
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
      <div className="px-4 py-3">{children}</div>
      {actions ? <div className="px-4 pb-3">{actions}</div> : null}
      {footer ? <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2 text-[11px] text-white/55">{footer}</div> : null}
    </div>
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

export function popupButtonClass(primary = false) {
  return primary
    ? "h-9 rounded-lg bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-60"
    : "h-9 rounded-lg border border-white/15 px-3 text-sm text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-60";
}
