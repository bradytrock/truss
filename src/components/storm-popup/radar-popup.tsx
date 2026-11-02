"use client";

import { StormPopupShell, popupButtonClass } from "@/components/storm-popup/shell";
import { formatCoord, radarCategory } from "@/lib/weather/hail-point";

export function RadarCellPopup({
  lat,
  lng,
  dbz,
  radarSite,
  hailChance,
  onClose,
  onInteract,
  onAlert,
}: {
  lat: number;
  lng: number;
  dbz: number;
  radarSite: string;
  hailChance: string;
  onClose: () => void;
  onInteract: () => void;
  onAlert: () => void;
}) {
  return (
    <StormPopupShell
      titleId="radar-cell-title"
      label="Radar cell"
      headerStyle={{ background: "linear-gradient(90deg, #16a34a 0%, #ca8a04 48%, #dc2626 100%)" }}
      header={
        <div className="pr-8">
          <p className="text-[10px] font-semibold tracking-wide uppercase">Reflectivity</p>
          <p id="radar-cell-title" className="mt-1 text-4xl leading-none font-semibold">
            {Math.round(dbz)} dBZ
          </p>
          <p className="mt-1 text-sm">{radarCategory(dbz)}</p>
        </div>
      }
      actions={
        <button type="button" className={`${popupButtonClass(true)} w-full`} onClick={onAlert}>
          Alert me if it grows
        </button>
      }
      footer={
        <>
          <span>
            {formatCoord(lat)}, {formatCoord(lng)}
          </span>
          <span>IEM / NWS</span>
        </>
      }
      onClose={onClose}
      onInteract={onInteract}
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">Storm motion</dt>
          <dd className="font-medium">—</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">Echo top</dt>
          <dd className="font-medium">—</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">Radar site</dt>
          <dd className="font-medium">{radarSite}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">Hail probability</dt>
          <dd className="font-medium">{hailChance}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-white/45">
        dBZ is approximated from the radar tile color. TODO: motion, echo top, and a real reflectivity grid.
      </p>
    </StormPopupShell>
  );
}
