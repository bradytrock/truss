"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { parseVerifiedCoords } from "@/lib/roof-measure-satellite";
import { cn } from "@/lib/utils";

const RoofMeasurePinMap = dynamic(
  () => import("@/components/roof-measure-pin-map").then((mod) => mod.RoofMeasurePinMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-72 items-center justify-center text-sm text-muted-foreground">
        Loading the map…
      </div>
    ),
  },
);

export function RoofMeasureVerifyDialog({
  open,
  jobId,
  address,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  jobId: string;
  address: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (pin: { lat: number; lng: number }) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [locating, setLocating] = useState(true);
  const [error, setError] = useState("");
  const [seed, setSeed] = useState<{ lat: number; lng: number } | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/roof-measure/locate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          lat?: unknown;
          lng?: unknown;
        };
        if (cancelled) return;
        const coords = parseVerifiedCoords(data);
        if (!response.ok || !coords) {
          setError(data.error || "Could not find that address.");
          setSeed(null);
          setPin(null);
          return;
        }
        setError("");
        setSeed(coords);
        setPin(coords);
      } catch {
        if (!cancelled) setError("Could not look up that address.");
      } finally {
        if (!cancelled) setLocating(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, jobId, attempt]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => panelRef.current?.focus(), 0);
    function onKey(event: KeyboardEvent) {
      const panel = panelRef.current;
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")].filter(
        (item) => !item.hasAttribute("disabled"),
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  const shownAddress = address.trim();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[min(92dvh,44rem)] w-full max-w-xl flex-col overflow-hidden rounded-md bg-popover text-sm text-popover-foreground ring-1 ring-border outline-none"
      >
        <div className="space-y-1 px-5 pt-5">
          <h2 id={titleId} className="font-heading text-base leading-none font-medium">
            Verify the property
          </h2>
          <p id={descriptionId} className="text-sm text-muted-foreground">
            The address lookup can land on the wrong house. Drag the pin onto the roof, then measure.
          </p>
          {shownAddress ? <p className="pt-1 text-sm font-medium">{shownAddress}</p> : null}
        </div>
        <div
          className={cn(
            "mx-5 mt-4 h-80 overflow-hidden rounded-md border",
            error ? "bg-muted/40" : "bg-[#1c1c1e]",
          )}
        >
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setError("");
                  setSeed(null);
                  setPin(null);
                  setLocating(true);
                  setAttempt((value) => value + 1);
                }}
              >
                Try again
              </Button>
            </div>
          ) : locating || !seed ? (
            <div className="flex h-full min-h-72 items-center justify-center text-sm text-white/70">
              Looking up the address…
            </div>
          ) : (
            <RoofMeasurePinMap
              key={`${seed.lat.toFixed(5)},${seed.lng.toFixed(5)}`}
              lat={seed.lat}
              lng={seed.lng}
              onMove={setPin}
            />
          )}
        </div>
        {seed && !error ? (
          <p className="px-5 pt-2 text-xs text-muted-foreground">Click the roof or drag the pin.</p>
        ) : (
          <div className="pt-2" />
        )}
        <div className="mt-3 flex flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!pin || locating || Boolean(error)}
            onClick={() => {
              if (pin) onConfirm(pin);
            }}
          >
            Verify and measure
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
