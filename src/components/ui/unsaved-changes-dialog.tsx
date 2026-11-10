"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export const UNSAVED_CONFIRM_SELECTOR = "[data-unsaved-confirm]";

export function UnsavedChangesDialog({
  open,
  title = "Close without saving?",
  description = "You have changes in this window that are not saved yet. Closing throws them away.",
  submitLabel,
  onKeep,
  onDiscard,
  onSave,
  container,
}: {
  open: boolean;
  title?: string;
  description?: string;
  submitLabel?: string | null;
  onKeep: () => void;
  onDiscard: () => void;
  onSave?: () => void;
  /** Mount inside the open dialog so focus and dismissal stay on that window. */
  container?: HTMLElement | null;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("[data-unsaved-keep] button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onKeep();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onKeep, open]);

  if (!open || typeof document === "undefined") return null;
  const mount = container?.isConnected ? container : document.body;

  return createPortal(
    <div
      data-unsaved-confirm=""
      className={
        mount === document.body
          ? "fixed inset-0 z-[80] flex items-center justify-center p-4"
          : "fixed inset-0 z-20 flex items-center justify-center p-4"
      }
    >
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Keep editing" onClick={onKeep} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative z-10 w-full max-w-md rounded-2xl bg-popover p-6 text-popover-foreground shadow-lg ring-1 ring-border"
      >
        <h2 id={titleId} className="font-heading text-lg font-medium tracking-tight">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="text-sm font-semibold text-primary" onClick={onDiscard}>
            Discard
          </button>
          <div className="flex flex-wrap justify-end gap-2">
            <span data-unsaved-keep="">
              <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={onKeep}>
                Keep editing
              </Button>
            </span>
            {submitLabel && onSave ? (
              <Button type="button" className="h-10 rounded-lg" onClick={onSave}>
                {submitLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    mount,
  );
}
