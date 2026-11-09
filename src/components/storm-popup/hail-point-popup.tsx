"use client";

import { useState } from "react";
import { PopupStats, StormPopupShell, popupButtonClass, type PopupArrow } from "@/components/storm-popup/shell";
import { roofDamageLabel } from "@/lib/weather/cells";
import { hailBin } from "@/lib/weather/hail";
import {
  chicagoDaysAgo,
  daysAgoLabel,
  formatChipDate,
  formatCoord,
  formatHailInches,
  fromPopupHit,
  headerHit,
  hiddenStormNote,
  splitVisibleStorms,
  type HailPopupHit,
} from "@/lib/weather/hail-point";

export type CanvassPin = {
  id: string;
  code: string;
  name: string;
  address: string;
  color: string;
  miles: number;
};

export function HailPointPopup({
  lat,
  lng,
  status,
  message,
  hits,
  hiddenIds,
  nearestReportMi,
  nearbyPins,
  dropping,
  arrow,
  onRetry,
  onClose,
  onInteract,
  onDropLead,
  onOpenJob,
}: {
  lat: number;
  lng: number;
  status: "error" | "ready";
  message: string;
  hits: HailPopupHit[];
  hiddenIds: ReadonlySet<string>;
  /** Miles to the closest spotter hail report, or null when none is on the map. */
  nearestReportMi: number | null;
  /** Jobs within a mile of the point, closest first. */
  nearbyPins: CanvassPin[];
  dropping: boolean;
  arrow?: PopupArrow | null;
  onRetry: () => void;
  onClose: () => void;
  onInteract: () => void;
  onDropLead: () => void;
  onOpenJob: (id: string) => void;
}) {
  const asHits = hits.map(fromPopupHit);
  const split = splitVisibleStorms(asHits, hiddenIds);
  const visible = hits.filter((hit) => !hiddenIds.has(hit.stormId));
  const lead = headerHit(visible.map(fromPopupHit));
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [canvass, setCanvass] = useState(false);
  const selected = visible.find((hit) => hit.stormId === pickedId) ?? visible.find((hit) => hit.stormId === lead?.storm.id) ?? visible[0] ?? null;
  const note = hiddenStormNote(split.hidden);
  const footer = (
    <>
      <span>
        {formatCoord(lat)}, {formatCoord(lng)}
      </span>
      <span>{selected?.source === "mesh" || hits.some((hit) => hit.source === "mesh") ? "MRMS MESH" : "Radar estimate"}</span>
    </>
  );

  if (status === "error") {
    return (
      <StormPopupShell
        titleId="hail-point-title"
        label="Hail lookup failed"
        width={260}
        arrow={arrow}
        header={<p id="hail-point-title" className="pr-8 text-sm font-medium">Could not read hail here</p>}
        actions={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={popupButtonClass("outline")} onClick={onRetry}>
              Retry
            </button>
            <button type="button" className={popupButtonClass("primary")} disabled={dropping} onClick={onDropLead}>
              {dropping ? "Adding…" : "Add lead here"}
            </button>
          </div>
        }
        footer={footer}
        onClose={onClose}
        onInteract={onInteract}
      >
        <p className="text-sm text-white/80">{message || "The hail lookup did not finish."}</p>
      </StormPopupShell>
    );
  }

  if (!selected) {
    return (
      <StormPopupShell
        titleId="hail-point-title"
        label="No hail shown"
        width={260}
        arrow={arrow}
        header={<p id="hail-point-title" className="pr-8 text-base font-semibold">No hail shown here</p>}
        actions={
          <button type="button" className={popupButtonClass("outline")} disabled={dropping} onClick={onDropLead}>
            {dropping ? "Adding…" : "Add lead at this point"}
          </button>
        }
        footer={footer}
        onClose={onClose}
        onInteract={onInteract}
      >
        <p className="text-sm text-white/70">{note || "No swath in the storms shown."}</p>
      </StormPopupShell>
    );
  }

  const band = hailBin(selected.maxBandIn);
  const color = band?.color ?? "#7e22ce";

  if (canvass) {
    return (
      <StormPopupShell
        titleId="hail-point-title"
        label="Canvass list"
        width={280}
        arrow={arrow}
        headerStyle={{ background: color }}
        header={
          <div className="pr-8">
            <p className="text-[10px] font-semibold tracking-wide uppercase">Canvass · 1-mile radius</p>
            <p id="hail-point-title" className="mt-0.5 text-lg font-semibold">
              {nearbyPins.length} job{nearbyPins.length === 1 ? "" : "s"} · {formatChipDate(selected.stormDate)}
            </p>
          </div>
        }
        actions={
          <button type="button" className={popupButtonClass("outline")} onClick={() => setCanvass(false)}>
            Back to hail
          </button>
        }
        footer={footer}
        onClose={onClose}
        onInteract={onInteract}
      >
        {nearbyPins.length ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {nearbyPins.map((pin) => (
              <li key={pin.id}>
                <button type="button" onClick={() => onOpenJob(pin.id)} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: pin.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{pin.code || pin.name}</span>
                    <span className="block truncate text-xs text-white/60">{pin.address || pin.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-white/55">{pin.miles.toFixed(1)} mi</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/70">No saved job within a mile. Add a lead at this point to start the list.</p>
        )}
      </StormPopupShell>
    );
  }

  return (
    <StormPopupShell
      titleId="hail-point-title"
      label="Hail at this point"
      width={260}
      arrow={arrow}
      headerStyle={{ background: color }}
      header={
        <div className="pr-8">
          <p className="text-[10px] font-semibold tracking-wide uppercase">
            Hail at this point · {selected.source === "mesh" ? "last 24 h" : formatChipDate(selected.stormDate)}
          </p>
          <p id="hail-point-title" className="mt-1 font-mono text-4xl leading-none font-semibold">
            {formatHailInches(selected.maxBandIn)}
          </p>
          <p className="mt-1.5 text-sm font-medium">
            {band?.label ?? "Hail"} · {roofDamageLabel(selected.maxBandIn)}
          </p>
        </div>
      }
      actions={
        <>
          <button type="button" className={popupButtonClass("primary")} onClick={() => setCanvass(true)}>
            Canvass a 1-mile radius
          </button>
          <button type="button" className={popupButtonClass("outline")} disabled={dropping} onClick={onDropLead}>
            {dropping ? "Adding…" : "Add lead at this point"}
          </button>
        </>
      }
      footer={footer}
      onClose={onClose}
      onInteract={onInteract}
    >
      <PopupStats
        columns={2}
        items={[
          { label: "Nearest report", value: nearestReportMi == null ? "None" : `${nearestReportMi.toFixed(1)} mi` },
          { label: "Your jobs ≤1 mi", value: nearbyPins.length },
        ]}
      />
      {visible.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Storms at this point">
          {visible.map((hit) => {
            const active = hit.stormId === selected.stormId;
            return (
              <button
                key={hit.stormId}
                type="button"
                aria-pressed={active}
                onClick={() => setPickedId(hit.stormId)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${active ? "ring-1 ring-white/60" : "opacity-70 hover:opacity-100"}`}
                style={{ background: hailBin(hit.maxBandIn)?.color ?? "#7e22ce" }}
              >
                {formatChipDate(hit.stormDate)} · {formatHailInches(hit.maxBandIn)} · {daysAgoLabel(chicagoDaysAgo(hit.stormDate), true)}
              </button>
            );
          })}
        </div>
      ) : null}
      {note ? <p className="mt-2 text-[11px] text-white/50">{note}</p> : null}
    </StormPopupShell>
  );
}
