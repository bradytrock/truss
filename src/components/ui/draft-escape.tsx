"use client";

import * as React from "react";
import { escapeKeepsDraft, formSignature } from "@/lib/draft-escape";

type DraftDetails = { reason: string; event: Event; cancel: () => void };

type DraftEscapeContextValue = {
  attachRoot: (node: HTMLElement | null) => void;
};

const DraftEscapeContext = React.createContext<DraftEscapeContextValue | null>(null);

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value as T);
    return;
  }
  if (ref && typeof ref === "object") {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

export function useDraftEscape<Details extends DraftDetails>(
  onOpenChange: ((open: boolean, eventDetails: Details) => void) | undefined,
) {
  const baselineRef = React.useRef<string | null>(null);
  const rootRef = React.useRef<HTMLElement | null>(null);
  const sessionRef = React.useRef(0);

  const begin = React.useCallback((node: HTMLElement) => {
    if (baselineRef.current != null) return;
    const session = ++sessionRef.current;
    let locked = false;
    const lock = () => {
      locked = true;
    };
    node.addEventListener("input", lock, true);
    node.addEventListener("change", lock, true);
    const capture = () => {
      if (locked || sessionRef.current !== session || rootRef.current !== node) return;
      baselineRef.current = formSignature(node);
    };
    capture();
    requestAnimationFrame(() => {
      capture();
      requestAnimationFrame(() => {
        capture();
        node.removeEventListener("input", lock, true);
        node.removeEventListener("change", lock, true);
      });
    });
  }, []);

  const attachRoot = React.useCallback(
    (node: HTMLElement | null) => {
      rootRef.current = node;
      if (node) begin(node);
    },
    [begin],
  );

  const handleOpenChange = React.useCallback(
    (open: boolean, eventDetails: Details) => {
      if (!open && eventDetails.reason === "escape-key") {
        const root = rootRef.current;
        const current = root ? formSignature(root) : null;
        if (escapeKeepsDraft({ reason: eventDetails.reason, baseline: baselineRef.current, current })) {
          eventDetails.cancel();
          eventDetails.event.preventDefault();
          return;
        }
      }
      if (!open) {
        baselineRef.current = null;
        sessionRef.current += 1;
      } else if (rootRef.current && baselineRef.current == null) {
        begin(rootRef.current);
      }
      onOpenChange?.(open, eventDetails);
    },
    [begin, onOpenChange],
  );

  const context = React.useMemo<DraftEscapeContextValue>(() => ({ attachRoot }), [attachRoot]);

  return { onOpenChange: handleOpenChange, context };
}

export function DraftEscapeProvider({
  value,
  children,
}: {
  value: DraftEscapeContextValue;
  children: React.ReactNode;
}) {
  return <DraftEscapeContext.Provider value={value}>{children}</DraftEscapeContext.Provider>;
}

export function useDraftRootRef<T extends HTMLElement>(forwarded?: React.Ref<T>) {
  const ctx = React.useContext(DraftEscapeContext);
  return React.useCallback(
    (node: T | null) => {
      ctx?.attachRoot(node);
      assignRef(forwarded, node);
    },
    [ctx, forwarded],
  );
}
