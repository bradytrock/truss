"use client";

import { Minimize2, Pause, Play } from "lucide-react";
import { alertPaint } from "@/lib/weather/alerts";
import { cn } from "@/lib/utils";

export type RadarFrameTick = { minutesAgo: number; label: string };

export type RadarAlertCard = {
  id: string;
  event: string;
  until: string;
  area: string;
  jobs: string[];
};

type LayerName = "radar" | "warnings" | "hail" | "pins" | "outlook" | "cells";

/** NEXRAD n0q colors at those dBZ steps. The tiles use this scale. */
const DBZ_STOPS = [
  { label: "10", color: "#0300f4" },
  { label: "20", color: "#01c501" },
  { label: "30", color: "#fdf802" },
  { label: "40", color: "#fd9500" },
  { label: "50", color: "#d40000" },
  { label: "60", color: "#f800fd" },
  { label: "70", color: "#fdfdfd" },
] as const;

export function RadarDeskChrome({
  fullscreen,
  onToggleFullscreen,
  showRadar,
  showWarnings,
  showHail,
  showPins,
  showOutlook,
  showCells,
  cellCount,
  onLayer,
  frames,
  frameIndex,
  playing,
  onSelectFrame,
  onTogglePlaying,
  radarSite,
  alertCards,
  onSelectAlert,
}: {
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  showRadar: boolean;
  showWarnings: boolean;
  showHail: boolean;
  showPins: boolean;
  showOutlook: boolean;
  showCells: boolean;
  cellCount: number;
  onLayer: (layer: LayerName, next: boolean) => void;
  frames: RadarFrameTick[];
  frameIndex: number;
  playing: boolean;
  onSelectFrame: (index: number) => void;
  onTogglePlaying: () => void;
  radarSite: string;
  alertCards: RadarAlertCard[];
  onSelectAlert: (id: string) => void;
}) {
  const frame = frames[frameIndex];
  const dock = fullscreen ? "bottom-3" : "bottom-[12.75rem] lg:bottom-3";
  return (
    <>
      {fullscreen ? (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-[#12141a] shadow-lg"
          >
            <Minimize2 className="size-4" />
            Exit full screen
          </button>
          <p className="pointer-events-none hidden rounded-full bg-[#121826]/90 px-3 py-1.5 text-xs text-white shadow-lg sm:block">
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-[#e11d48]" />
            LIVE · {radarSite} · {frame?.label ?? "Now"}
          </p>
          <ReflectivityToggle />
        </div>
      ) : null}

      <fieldset
        className={cn(
          "pointer-events-auto absolute left-3 z-20 w-44 rounded-xl border border-white/10 bg-[#121826]/95 p-3 text-xs text-white shadow-lg",
          fullscreen ? "top-16" : "top-28 lg:top-3",
        )}
      >
        <legend className="px-1 text-[10px] font-semibold tracking-wide text-white/50 uppercase">Layers</legend>
        <LayerBox
          label="Radar"
          checked={showRadar}
          onChange={(next) => onLayer("radar", next)}
        />
        <LayerBox
          label="NWS warnings"
          checked={showWarnings}
          onChange={(next) => onLayer("warnings", next)}
        />
        <LayerBox
          label={cellCount ? `Storm cells · ${cellCount}` : "Storm cells"}
          checked={showCells}
          onChange={(next) => onLayer("cells", next)}
          title="NEXRAD storm cells with +15, +30, and +45 minute forecast points."
        />
        <LayerBox label="Hail (MESH)" checked={showHail} onChange={(next) => onLayer("hail", next)} />
        <LayerBox label="Job pins" checked={showPins} onChange={(next) => onLayer("pins", next)} />
        <LayerBox label="SPC outlook" checked={showOutlook} onChange={(next) => onLayer("outlook", next)} />
        <ul className="mt-2 space-y-1 border-t border-white/10 pt-2 text-[10px] text-white/70">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: "#facc15" }} />
            Severe watch · county
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: "#f9a8d4" }} />
            Tornado watch · county
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border border-white/30" style={{ background: "#fb923c" }} />
            Warning polygon
          </li>
        </ul>
      </fieldset>

      {fullscreen ? (
        <aside className="pointer-events-auto absolute top-16 right-3 bottom-24 z-20 hidden w-72 flex-col gap-2 overflow-y-auto lg:flex">
          {alertCards.length ? (
            alertCards.map((card) => {
              const paint = alertPaint({ event: card.event });
              const where = card.jobs.slice(0, 3);
              const extra = card.jobs.length - where.length;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onSelectAlert(card.id)}
                  className="rounded-xl border border-white/10 bg-[#121826]/95 p-3 text-left text-white shadow-lg"
                >
                  <span className="flex items-start gap-2">
                    <span className="mt-1 size-2.5 shrink-0 rounded-sm" style={{ background: paint.fill }} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{card.event}</span>
                      <span className="mt-0.5 block text-[11px] text-white/60">
                        {card.area || "NWS"}
                        {card.until ? ` · until ${card.until}` : ""}
                      </span>
                      {where.length ? (
                        <span className="mt-1.5 block text-[11px] text-white/80">
                          {card.jobs.length} job{card.jobs.length === 1 ? "" : "s"} inside · {where.join(", ")}
                          {extra > 0 ? ` and ${extra} more` : ""}
                        </span>
                      ) : (
                        <span className="mt-1.5 block text-[11px] text-white/45">No job inside this polygon</span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="rounded-xl border border-white/10 bg-[#121826]/95 p-3 text-xs text-white/70 shadow-lg">
              No active watches or warnings in this area.
            </p>
          )}
        </aside>
      ) : null}

      {showRadar ? (
        <div className={cn("pointer-events-none absolute left-3 z-20", fullscreen ? "bottom-20" : "bottom-[16.5rem] lg:bottom-20")}>
          <div className="rounded-lg bg-[#121826]/95 px-3 py-2 text-[10px] text-white/80 shadow-lg">
            <p className="font-medium text-white">Reflectivity · dBZ</p>
            <div className="mt-1.5 flex h-2 w-40 overflow-hidden rounded-sm">
              {DBZ_STOPS.map((stop) => (
                <span key={stop.label} className="h-full flex-1" style={{ background: stop.color }} />
              ))}
            </div>
            <div className="mt-1 flex w-40 justify-between">
              {DBZ_STOPS.map((stop) => (
                <span key={stop.label}>{stop.label}</span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showRadar && frames.length ? (
        <div className={cn("pointer-events-auto absolute left-1/2 z-20 w-[min(28rem,calc(100%-10rem))] -translate-x-1/2 rounded-full bg-[#121826]/95 px-3 py-2 text-white shadow-lg", dock)}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTogglePlaying}
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[#12141a]"
              aria-label={playing ? "Pause radar loop" : "Play radar loop"}
              aria-pressed={playing}
            >
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Radar time</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, frames.length - 1)}
                step={1}
                value={Math.min(frameIndex, frames.length - 1)}
                onChange={(event) => onSelectFrame(Number(event.target.value))}
                aria-valuetext={frame?.label ?? "Now"}
                className="w-full accent-white"
              />
            </label>
            <span className="w-16 shrink-0 text-right text-[11px] text-white/80">{frame?.minutesAgo ? `${frame.minutesAgo}m` : "Now"}</span>
          </div>
          <p className="mt-0.5 text-center text-[10px] text-white/45">50-min loop · 10-min scans · {radarSite}</p>
        </div>
      ) : null}

    </>
  );
}

function ReflectivityToggle() {
  return (
    <div className="pointer-events-auto inline-flex rounded-full bg-[#121826]/95 p-0.5 text-xs shadow-lg">
      <span className="rounded-full bg-white px-3 py-1 font-medium text-[#12141a]" aria-current="true">
        Reflectivity
      </span>
      <button
        type="button"
        disabled
        title="Velocity is not on the IEM reflectivity feed."
        className="cursor-not-allowed px-3 py-1 text-white/35"
      >
        Velocity
      </button>
    </div>
  );
}

function LayerBox({
  label,
  checked,
  onChange,
  disabled = false,
  title,
}: {
  label: string;
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label className={cn("flex items-center gap-2 py-0.5", disabled ? "text-white/35" : "text-white")} title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="size-3.5 accent-[#e11d48]"
      />
      {label}
    </label>
  );
}
