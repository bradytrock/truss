"use client";

import { PopupStats, StormPopupShell, popupButtonClass, type PopupArrow } from "@/components/storm-popup/shell";
import { cellApproach, nearestCell } from "@/lib/weather/cells";
import { formatChicagoShortClock, formatCoord, formatHailInches, radarCategory, type HailPopupHit } from "@/lib/weather/hail-point";
import type { StormCell, WeatherAlert } from "@/lib/weather/types";

export function RadarCellPopup({
  lat,
  lng,
  dbz,
  radarSite,
  scanAt,
  cells,
  hits,
  warnings,
  watching,
  dropping,
  arrow,
  onClose,
  onInteract,
  onWatch,
  onDropLead,
}: {
  lat: number;
  lng: number;
  dbz: number;
  radarSite: string;
  /** Time of the radar frame that was sampled. */
  scanAt: string;
  cells: StormCell[];
  /** Hail already on the ground here, from the swaths on the map. */
  hits: HailPopupHit[];
  warnings: WeatherAlert[];
  watching: boolean;
  dropping: boolean;
  arrow?: PopupArrow | null;
  onClose: () => void;
  onInteract: () => void;
  onWatch: (cell: StormCell | null) => void;
  onDropLead: () => void;
}) {
  const nearest = nearestCell(cells, lat, lng);
  const approach = nearest ? cellApproach(nearest.cell, lat, lng) : null;
  const meshHere = hits.reduce((max, hit) => Math.max(max, hit.maxBandIn), 0);
  const warning = warnings[0] ?? null;
  const heading =
    !approach || !nearest
      ? "No cell tracked"
      : approach.status === "overhead"
        ? "Overhead now"
        : approach.status === "incoming"
          ? `Yes · ${approach.etaMinutes} min`
          : approach.status === "passed"
            ? "No · passed"
            : "No";

  return (
    <StormPopupShell
      titleId="radar-cell-title"
      label="Radar cell"
      width={260}
      arrow={arrow}
      headerStyle={{ background: "linear-gradient(90deg, #15803d 0%, #ca8a04 50%, #dc2626 100%)" }}
      header={
        <div className="pr-8">
          <p className="text-[10px] font-semibold tracking-wide uppercase">Reflectivity</p>
          <p id="radar-cell-title" className="mt-1 font-mono text-4xl leading-none font-semibold">
            {Math.round(dbz)} dBZ
          </p>
          <p className="mt-1.5 text-sm font-medium">{radarCategory(dbz)}</p>
        </div>
      }
      actions={
        <>
          <button type="button" className={popupButtonClass("primary")} aria-pressed={watching} onClick={() => onWatch(nearest?.cell ?? null)}>
            {watching ? "Watching · we'll tell you" : "Alert me if it grows"}
          </button>
          <button type="button" className={popupButtonClass("outline")} disabled={dropping} onClick={onDropLead}>
            {dropping ? "Adding…" : "Add lead at this point"}
          </button>
        </>
      }
      footer={
        <>
          <span>
            {formatCoord(lat)}, {formatCoord(lng)}
          </span>
          <span>
            {radarSite}
            {scanAt ? ` · ${formatChicagoShortClock(scanAt)}` : ""}
          </span>
        </>
      }
      onClose={onClose}
      onInteract={onInteract}
    >
      <PopupStats
        columns={2}
        items={[
          { label: "Nearest cell", value: nearest ? `${nearest.cell.id} · ${nearest.miles.toFixed(1)} mi` : "None" },
          { label: "Heading here?", value: heading },
          { label: "MESH here", value: meshHere > 0 ? formatHailInches(meshHere) : "None" },
          { label: "Warning", value: warning ? warningCode(warning.event) : "None" },
        ]}
      />
    </StormPopupShell>
  );
}

function warningCode(event: string) {
  if (/tornado/i.test(event)) return "TOR";
  if (/severe thunderstorm/i.test(event)) return "SVR";
  if (/flash flood/i.test(event)) return "FFW";
  return event.replace(/ Warning$/, "");
}
