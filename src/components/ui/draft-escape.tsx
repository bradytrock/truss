"use client";

import * as React from "react";
import { draftIsDirty, formSignature, isUserDismiss } from "@/lib/draft-escape";
import { UNSAVED_CONFIRM_SELECTOR, UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";

type DraftDetails = { reason: string; event: Event; cancel: () => void };

type DraftEscapeContextValue = {
  attachRoot: (node: HTMLElement | null) => void;
};

const DraftEscapeContext = React.createContext<DraftEscapeContextValue | null>(null);

const EDIT_TARGET = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[data-slot='select-trigger']",
  "[data-slot='checkbox']",
  "[data-slot='switch']",
  "[role='radio']",
  "[aria-pressed]",
  "label",
].join(", ");

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value as T);
    return;
  }
  if (ref && typeof ref === "object") {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

function isConfirmTarget(event: Event) {
  const target = event.target;
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return Boolean(element?.closest(UNSAVED_CONFIRM_SELECTOR));
}

function gestureEdits(event: Event) {
  const target = event.target;
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!element?.closest(EDIT_TARGET)) return false;
  if (!(event instanceof KeyboardEvent)) return true;
  if (event.key === "Escape" || event.key === "Tab") return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return event.key.toLowerCase() === "v";
  return event.key === "Backspace" || event.key === "Delete" || event.key === "Enter" || event.key === " " || event.key.length === 1;
}

function findSave(root: HTMLElement): { label: string; run: () => void } | null {
  const forms = Array.from(root.querySelectorAll("form")).filter(
    (node): node is HTMLFormElement => node instanceof HTMLFormElement,
  );
  const active = document.activeElement;
  const form =
    forms.find((item) => active instanceof Node && item.contains(active) && item.querySelector("[type='submit']")) ??
    forms.find((item) => item.querySelector("button[type='submit'], input[type='submit']")) ??
    null;
  if (!form) return null;
  const button = form.querySelector("button[type='submit'], input[type='submit']");
  if (button instanceof HTMLButtonElement && button.disabled) return null;
  if (button instanceof HTMLInputElement && button.disabled) return null;
  const label =
    button instanceof HTMLInputElement
      ? button.value.trim()
      : (button?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!label || label === "Saving…" || label === "Saving...") return null;
  return {
    label,
    run: () => {
      if (button instanceof HTMLButtonElement || (button instanceof HTMLInputElement && button.type === "submit")) {
        form.requestSubmit(button);
        return;
      }
      form.requestSubmit();
    },
  };
}

function buttonLabel(button: HTMLButtonElement) {
  return (button.textContent ?? "").replace(/\s+/g, " ").trim();
}

function closedDetails<Details extends DraftDetails>(): Details {
  return {
    reason: "none",
    event: new Event("close"),
    cancel() {},
  } as Details;
}

export function useUnsavedBeforeUnload(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [active]);
}

export function useDraftEscape<Details extends DraftDetails>(
  onOpenChange: ((open: boolean, eventDetails: Details) => void) | undefined,
  options?: { enabled?: boolean; open?: boolean },
) {
  const enabled = options?.enabled !== false;
  const baselineRef = React.useRef<string | null>(null);
  const rootRef = React.useRef<HTMLElement | null>(null);
  const sessionRef = React.useRef(0);
  const editedRef = React.useRef(false);
  const cleanupRef = React.useRef<(() => void) | null>(null);
  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const saveRunRef = React.useRef<(() => void) | null>(null);
  const bypassRef = React.useRef(false);
  const onOpenChangeRef = React.useRef(onOpenChange);
  const enabledRef = React.useRef(enabled);
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
    enabledRef.current = enabled;
  }, [enabled, onOpenChange]);

  const [dirty, setDirty] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmRoot, setConfirmRoot] = React.useState<HTMLElement | null>(null);
  const [saveLabel, setSaveLabel] = React.useState<string | null>(null);
  const [seenOpen, setSeenOpen] = React.useState(options?.open);
  if (options?.open !== seenOpen) {
    setSeenOpen(options?.open);
    if (options?.open === false) {
      setDirty(false);
      setConfirmOpen(false);
      setSaveLabel(null);
    }
  }

  useUnsavedBeforeUnload(enabled && dirty);

  const readDirty = React.useCallback(() => {
    if (!editedRef.current || baselineRef.current == null || !rootRef.current) return false;
    return draftIsDirty(baselineRef.current, formSignature(rootRef.current));
  }, []);

  const refreshDirty = React.useCallback(() => {
    const next = readDirty();
    setDirty((current) => (current === next ? current : next));
  }, [readDirty]);

  const openConfirm = React.useCallback(() => {
    const save = rootRef.current ? findSave(rootRef.current) : null;
    saveRunRef.current = save?.run ?? null;
    setSaveLabel(save?.label ?? null);
    setConfirmRoot(rootRef.current);
    setDirty(true);
    setConfirmOpen(true);
  }, []);

  const begin = React.useCallback(
    (node: HTMLElement) => {
      cleanupRef.current?.();
      const session = ++sessionRef.current;
      editedRef.current = false;
      baselineRef.current = formSignature(node);
      let stopped = false;

      const still = () => !stopped && sessionRef.current === session;

      const onInput = () => {
        if (!still()) return;
        editedRef.current = true;
        refreshDirty();
      };

      const onGesture = (event: Event) => {
        if (!still() || editedRef.current || !gestureEdits(event)) return;
        baselineRef.current = formSignature(node);
        editedRef.current = true;
      };

      const onCancelClick = (event: MouseEvent) => {
        if (!still() || bypassRef.current || !readDirty()) return;
        if (isConfirmTarget(event)) return;
        const target = event.target;
        const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
        const button = element?.closest("button");
        if (!(button instanceof HTMLButtonElement)) return;
        if (button.type === "submit" || button.disabled) return;
        if (buttonLabel(button) !== "Cancel") return;
        event.preventDefault();
        event.stopPropagation();
        pendingActionRef.current = () => {
          if (!button.isConnected) {
            onOpenChangeRef.current?.(false, closedDetails<Details>());
            return;
          }
          bypassRef.current = true;
          try {
            button.click();
          } finally {
            bypassRef.current = false;
          }
        };
        openConfirm();
      };

      const observer = new MutationObserver(() => {
        if (!still()) return;
        if (!editedRef.current) {
          baselineRef.current = formSignature(node);
          return;
        }
        refreshDirty();
      });

      node.addEventListener("input", onInput, true);
      node.addEventListener("change", onInput, true);
      node.addEventListener("pointerdown", onGesture, true);
      node.addEventListener("keydown", onGesture, true);
      node.addEventListener("click", onCancelClick, true);
      observer.observe(node, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-checked", "aria-pressed", "data-checked", "value", "checked"],
      });

      let frame = 0;
      const loop = () => {
        if (!still() || editedRef.current) return;
        if (rootRef.current === node) baselineRef.current = formSignature(node);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);

      cleanupRef.current = () => {
        stopped = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        node.removeEventListener("input", onInput, true);
        node.removeEventListener("change", onInput, true);
        node.removeEventListener("pointerdown", onGesture, true);
        node.removeEventListener("keydown", onGesture, true);
        node.removeEventListener("click", onCancelClick, true);
      };
    },
    [openConfirm, readDirty, refreshDirty],
  );

  const attachRoot = React.useCallback(
    (node: HTMLElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      rootRef.current = node;
      if (node && enabledRef.current) begin(node);
    },
    [begin],
  );

  React.useEffect(() => {
    if (options?.open === false) {
      editedRef.current = false;
      baselineRef.current = null;
      sessionRef.current += 1;
      pendingActionRef.current = null;
      return;
    }
    if (options?.open && rootRef.current && enabledRef.current) begin(rootRef.current);
  }, [begin, options?.open]);

  const handleOpenChange = React.useCallback(
    (next: boolean, eventDetails: Details) => {
      if (!enabledRef.current) {
        onOpenChangeRef.current?.(next, eventDetails);
        return;
      }
      if (!next && eventDetails && isConfirmTarget(eventDetails.event)) {
        eventDetails.cancel();
        return;
      }
      if (!next && eventDetails && isUserDismiss(eventDetails.reason) && readDirty()) {
        eventDetails.cancel();
        eventDetails.event.preventDefault();
        openConfirm();
        return;
      }
      if (!next) {
        editedRef.current = false;
        baselineRef.current = null;
        sessionRef.current += 1;
        pendingActionRef.current = null;
        setDirty(false);
        setConfirmOpen(false);
      }
      onOpenChangeRef.current?.(next, eventDetails);
    },
    [openConfirm, readDirty],
  );

  const keep = React.useCallback(() => {
    pendingActionRef.current = null;
    setConfirmOpen(false);
  }, []);

  const discard = React.useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setConfirmOpen(false);
    if (action) {
      action();
      return;
    }
    onOpenChangeRef.current?.(false, closedDetails<Details>());
  }, []);

  const save = React.useCallback(() => {
    const run = saveRunRef.current;
    pendingActionRef.current = null;
    setConfirmOpen(false);
    run?.();
  }, []);

  const context = React.useMemo<DraftEscapeContextValue>(() => ({ attachRoot }), [attachRoot]);

  const confirm = enabled ? (
    <UnsavedChangesDialog
      open={confirmOpen}
      container={confirmRoot}
      submitLabel={saveLabel}
      onKeep={keep}
      onDiscard={discard}
      onSave={saveLabel ? save : undefined}
    />
  ) : null;

  return { onOpenChange: enabled ? handleOpenChange : onOpenChange, context, confirm };
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
