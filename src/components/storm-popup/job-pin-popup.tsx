"use client";

import { AlertTriangle, Check, CircleDot, Radar } from "lucide-react";
import { PopupRow, PopupSection, StormPopupShell, popupButtonClass, type PopupArrow } from "@/components/storm-popup/shell";
import { cellThreatText, formatMotion, pointThreat } from "@/lib/weather/cells";
import { formatChipDate, formatHailInches, fromPopupHit, headerHit, type HailPopupHit } from "@/lib/weather/hail-point";
import { arrivalLabel, clearsByLabel, hailEventsAtLeast, jobBand, type JobBand } from "@/lib/weather/overlays";
import type { StormCell, WeatherAlert } from "@/lib/weather/types";

export type StormJobPin = {
  id: string;
  code: string;
  name: string;
  customer: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  color: string;
  stage: string;
  /** Homeowner's phone, when the primary contact has one. */
  phone: string;
};

export type CrewOnSite = { name: string; sinceLabel: string };

export function JobPinPopup({
  pin,
  warnings,
  cells,
  hits,
  crewOnSite,
  arrow,
  busy,
  onClose,
  onInteract,
  onOpenJob,
  onWarnCrew,
  onAttachHail,
}: {
  pin: StormJobPin;
  /** Warnings whose polygon covers this address. */
  warnings: WeatherAlert[];
  cells: StormCell[];
  /** Hail at this address from the swaths on the map. */
  hits: HailPopupHit[];
  crewOnSite: CrewOnSite | null;
  arrow?: PopupArrow | null;
  busy: boolean;
  onClose: () => void;
  onInteract: () => void;
  onOpenJob: () => void;
  onWarnCrew: () => void;
  onAttachHail: (hit: HailPopupHit) => void;
}) {
  const threat = pointThreat(cells, pin.lat, pin.lng);
  const top = headerHit(hits.map(fromPopupHit));
  const swathHit = hits.find((hit) => hit.stormId === top?.storm.id) ?? null;
  const band = jobBand({ warnings, threat, swathHit });
  const history = [...hits].sort((a, b) => b.stormDate.localeCompare(a.stormDate));
  const directions = pin.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pin.address)}` : "";
  const tel = pin.phone.replace(/[^\d+]/g, "");
  const underThreat = band.kind === "tornado" || band.kind === "warning" || band.kind === "overhead";

  return (
    <StormPopupShell
      titleId="job-pin-title"
      label={pin.customer || pin.code || pin.name}
      width={300}
      arrow={arrow}
      band={{ tone: band.tone, icon: bandIcon(band), label: band.label }}
      header={
        <div className="pr-8">
          <p id="job-pin-title" className="text-[15px] leading-tight font-semibold">
            {pin.customer || pin.name}
          </p>
          <p className="mt-0.5 text-xs text-white/60">{pin.address || "No address yet"}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium">
              <span className="size-1.5 rounded-full" style={{ background: pin.color }} />
              {pin.stage}
            </span>
            {pin.code ? <span className="font-mono text-[11px] text-white/55">{pin.code}</span> : null}
          </div>
        </div>
      }
      actions={
        band.kind === "clear" || band.kind === "incoming" ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={popupButtonClass("primary")} onClick={onOpenJob}>
              Open job
            </button>
            {directions ? (
              <a href={directions} target="_blank" rel="noreferrer" className={popupButtonClass("outline")}>
                Directions
              </a>
            ) : (
              <button type="button" className={popupButtonClass("outline")} disabled title="No address to route to yet">
                Directions
              </button>
            )}
          </div>
        ) : band.kind === "swath" && swathHit ? (
          <>
            <button type="button" className={popupButtonClass("primary")} disabled={busy} onClick={() => onAttachHail(swathHit)}>
              {busy ? "Saving…" : "Attach hail report to claim"}
            </button>
            <button type="button" className={popupButtonClass("outline")} onClick={onOpenJob}>
              Open job
            </button>
          </>
        ) : crewOnSite ? (
          <>
            <button type="button" className={popupButtonClass("danger")} disabled={busy} onClick={onWarnCrew}>
              {busy ? "Sending…" : "Warn crew: tarp & get down"}
            </button>
            <button type="button" className={popupButtonClass("outline")} onClick={onOpenJob}>
              Open job
            </button>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {tel ? (
              <a href={`sms:${tel}`} className={popupButtonClass("danger")}>
                Text homeowner
              </a>
            ) : (
              <button type="button" className={popupButtonClass("danger")} disabled title="No phone on the primary contact">
                Text homeowner
              </button>
            )}
            <button type="button" className={popupButtonClass("outline")} onClick={onOpenJob}>
              Open job
            </button>
          </div>
        )
      }
      onClose={onClose}
      onInteract={onInteract}
    >
      {underThreat ? (
        <PopupSection title="Right now" first>
          <PopupRow
            label="Storm cell"
            value={threat.overhead ? `${threat.overhead.cell.id} overhead` : threat.incoming ? `${threat.incoming.cell.id} inbound` : "None tracked"}
          />
          <PopupRow label="Est. hail at address" value={estimatedHail(band.warning, threat.overhead?.cell ?? null)} />
          <PopupRow
            label="Clears by"
            value={clearsByLabel(threat.overhead?.cell.valid ?? "", threat.overhead?.clearsInMinutes ?? null, band.warning?.ends ?? "")}
          />
        </PopupSection>
      ) : null}
      {threat.incoming ? (
        <PopupSection title="Incoming" first={!underThreat}>
          <PopupRow label="Storm cell" value={`${threat.incoming.cell.id} · ${formatMotion(threat.incoming.cell)}`} />
          <PopupRow label="Arrives" value={arrivalLabel(threat.incoming.cell.valid, threat.incoming.etaMinutes)} />
          <PopupRow label="Threat" value={cellThreatText(threat.incoming.cell)} />
        </PopupSection>
      ) : null}
      {crewOnSite ? (
        <PopupSection title="On site" first={!underThreat && !threat.incoming}>
          <PopupRow label={crewOnSite.name} value={`Checked in · ${crewOnSite.sinceLabel}`} />
        </PopupSection>
      ) : null}
      <PopupSection title="Hail history here" first={!underThreat && !threat.incoming && !crewOnSite}>
        {history.length ? (
          <>
            {history.slice(0, 3).map((hit) => (
              <PopupRow key={hit.stormId} label={hit.source === "mesh" ? `${formatChipDate(hit.stormDate)} · 24h max` : formatChipDate(hit.stormDate)} value={formatHailInches(hit.maxBandIn)} />
            ))}
            <PopupRow label="Events ≥ 1″" value={`${hailEventsAtLeast(history, 1)} of ${history.length}`} muted />
          </>
        ) : (
          <p className="text-[13px] text-white/60">No hail on file — no swath over this address.</p>
        )}
      </PopupSection>
    </StormPopupShell>
  );
}

function bandIcon(band: JobBand) {
  if (band.kind === "tornado" || band.kind === "warning" || band.kind === "overhead") return <AlertTriangle className="size-3.5" />;
  if (band.kind === "incoming") return <Radar className="size-3.5" />;
  if (band.kind === "swath") return <CircleDot className="size-3.5" />;
  return <Check className="size-3.5" />;
}

function estimatedHail(warning: WeatherAlert | null, cell: StormCell | null) {
  const inches = Math.max(cell?.meshIn ?? 0, warning?.hailInches ?? 0);
  return inches > 0 ? formatHailInches(inches) : "None";
}

