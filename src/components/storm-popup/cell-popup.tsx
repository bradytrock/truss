"use client";

import { PopupRow, PopupSection, PopupStats, StormPopupShell, popupButtonClass, type PopupArrow } from "@/components/storm-popup/shell";
import type { StormJobPin } from "@/components/storm-popup/job-pin-popup";
import { cellKind, cellKindLabel, cellKindTone, etaIso, formatMotion, jobsInPath, townArrivals } from "@/lib/weather/cells";
import { formatChicagoShortClock, formatHailInches } from "@/lib/weather/hail-point";
import type { StormCell } from "@/lib/weather/types";

export function StormCellPopup({
  cell,
  jobs,
  crewJobIds,
  watching,
  arrow,
  busy,
  onClose,
  onInteract,
  onWarnCrew,
  onWatch,
}: {
  cell: StormCell;
  jobs: StormJobPin[];
  /** Jobs with a crew phone checked in within walking distance. */
  crewJobIds: ReadonlySet<string>;
  watching: boolean;
  arrow?: PopupArrow | null;
  busy: boolean;
  onClose: () => void;
  onInteract: () => void;
  onWarnCrew: () => void;
  onWatch: () => void;
}) {
  const kind = cellKind(cell);
  const tone = cellKindTone(kind);
  const path = jobsInPath(cell, jobs);
  const towns = townArrivals(cell, jobs);
  const crewInPath = path.filter((hit) => crewJobIds.has(hit.job.id));
  const phones = [...new Set(path.map((hit) => hit.job.phone.replace(/[^\d+]/g, "")).filter(Boolean))];
  const smsHref = phones.length ? `sms:${phones.join(",")}` : "";

  return (
    <StormPopupShell
      titleId="storm-cell-title"
      label={`Cell ${cell.id}`}
      width={260}
      arrow={arrow}
      header={
        <div className="pr-8">
          <p id="storm-cell-title" className="text-base leading-tight font-semibold">
            Cell {cell.id}
          </p>
          <span className="mt-1.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold" style={tone}>
            {cellKindLabel(kind)}
          </span>
        </div>
      }
      actions={
        <>
          {crewInPath.length ? (
            <button type="button" className={popupButtonClass("danger")} disabled={busy} onClick={onWarnCrew}>
              {busy ? "Sending…" : crewInPath.length === 1 ? "Warn crew on site" : `Warn ${crewInPath.length} crews on site`}
            </button>
          ) : null}
          {phones.length && !crewInPath.length ? (
            <a href={smsHref} className={popupButtonClass("primary")}>
              Text {phones.length === 1 ? "the homeowner" : `${phones.length} homeowners`} in path
            </a>
          ) : null}
          <button type="button" className={popupButtonClass("outline")} aria-pressed={watching} onClick={onWatch}>
            {watching ? "Watching · we'll tell you" : "Alert me if it grows"}
          </button>
        </>
      }
      footer={
        <>
          <span>Scan {formatChicagoShortClock(cell.valid)}</span>
          <span>{cell.radarSite} · NEXRAD</span>
        </>
      }
      onClose={onClose}
      onInteract={onInteract}
    >
      <PopupStats
        items={[
          { label: "Max dBZ", value: Math.round(cell.maxDbz) },
          { label: "Echo top", value: `${Math.round(cell.echoTopKft)}k ft` },
          { label: "VIL", value: Math.round(cell.vil) },
          { label: "MESH", value: cell.meshIn > 0 ? formatHailInches(cell.meshIn) : "<.75″" },
          { label: "POSH", value: `${Math.round(cell.posh)}%` },
          { label: "Motion", value: formatMotion(cell) },
        ]}
      />
      {towns.length ? (
        <PopupSection title="Arrival (est.)">
          {towns.map((town) => (
            <PopupRow key={town.city} label={town.city} value={town.etaMinutes === 0 ? "Now" : formatChicagoShortClock(etaIso(cell.valid, town.etaMinutes))} />
          ))}
        </PopupSection>
      ) : null}
      <PopupSection title="Your jobs in path">
        {path.length ? (
          path.slice(0, 4).map((hit) => (
            <PopupRow
              key={hit.job.id}
              label={`${hit.job.customer || hit.job.name}${hit.job.city ? ` · ${hit.job.city}` : ""}`}
              value={hit.overhead ? "Now" : `~${formatChicagoShortClock(etaIso(cell.valid, hit.etaMinutes))}`}
            />
          ))
        ) : (
          <p className="text-[13px] text-white/60">None in this track</p>
        )}
        {path.length > 4 ? <p className="text-[11px] text-white/45">{path.length - 4} more in the path</p> : null}
      </PopupSection>
    </StormPopupShell>
  );
}
