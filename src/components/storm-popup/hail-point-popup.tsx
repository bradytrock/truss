"use client";

import { useState } from "react";
import { PopupSkeleton, StormPopupShell, popupButtonClass } from "@/components/storm-popup/shell";
import { hailBin } from "@/lib/weather/hail";
import {
  chicagoDaysAgo,
  daysAgoLabel,
  formatChicagoClock,
  formatChicagoRange,
  formatChipDate,
  formatCoord,
  formatHailInches,
  formatStormDate,
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
};

export function HailPointPopup({
  lat,
  lng,
  status,
  message,
  hits,
  hiddenIds,
  dropping,
  pinsForStorm,
  onRetry,
  onClose,
  onInteract,
  onDropLead,
  onOpenJob,
}: {
  lat: number;
  lng: number;
  status: "loading" | "error" | "ready";
  message: string;
  hits: HailPopupHit[];
  hiddenIds: ReadonlySet<string>;
  dropping: boolean;
  pinsForStorm: (stormId: string) => CanvassPin[];
  onRetry: () => void;
  onClose: () => void;
  onInteract: () => void;
  onDropLead: () => void;
  onOpenJob: (id: string) => void;
}) {
  const split = splitVisibleStorms(
    hits.map((hit) => ({
      ...hit,
      storm: {
        id: hit.stormId,
        stormDate: hit.stormDate,
        startedAt: hit.passageAt,
        endedAt: hit.passageAt,
        radarSite: hit.radarSite,
        stormMaxIn: hit.stormMaxIn,
        source: "",
        track: [],
        bands: [],
        report: hit.report ? { ...hit.report, lat: 0, lng: 0 } : null,
      },
      jobsInSwath: hit.jobsInSwath,
    })),
    hiddenIds,
  );
  const visible = hits.filter((hit) => !hiddenIds.has(hit.stormId));
  const lead = headerHit(
    visible.map((hit) => ({
      storm: {
        id: hit.stormId,
        stormDate: hit.stormDate,
        startedAt: hit.passageAt,
        endedAt: hit.passageAt,
        radarSite: hit.radarSite,
        stormMaxIn: hit.stormMaxIn,
        source: "",
        track: [],
        bands: [],
        report: null,
      },
      maxBandIn: hit.maxBandIn,
      distanceMi: hit.distanceMi,
      passageAt: hit.passageAt,
      passedStart: hit.passedStart,
      passedEnd: hit.passedEnd,
      jobsInSwath: hit.jobsInSwath,
    })),
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [canvass, setCanvass] = useState(false);
  const selected = visible.find((hit) => hit.stormId === pickedId) ?? visible.find((hit) => hit.stormId === lead?.storm.id) ?? visible[0] ?? null;
  const note = hiddenStormNote(split.hidden);
  const footer = (
    <>
      <span>
        {formatCoord(lat)}, {formatCoord(lng)}
      </span>
      <span>Radar estimate</span>
    </>
  );

  if (status === "loading") {
    return (
      <StormPopupShell titleId="hail-point-title" label="Looking up hail" header={<p id="hail-point-title" className="text-xs tracking-wide text-white/80 uppercase">Hail at this point</p>} footer={footer} onClose={onClose} onInteract={onInteract}>
        <PopupSkeleton />
        <p className="sr-only">Looking up hail at this point.</p>
      </StormPopupShell>
    );
  }

  if (status === "error") {
    return (
      <StormPopupShell
        titleId="hail-point-title"
        label="Hail lookup failed"
        header={<p id="hail-point-title" className="pr-8 text-sm font-medium">Could not read hail here</p>}
        actions={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={popupButtonClass()} onClick={onRetry}>
              Retry
            </button>
            <button type="button" className={popupButtonClass(true)} disabled={dropping} onClick={onDropLead}>
              {dropping ? "Dropping…" : "Drop lead here"}
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
        label="No hail"
        header={<p id="hail-point-title" className="pr-8 text-lg font-semibold">No hail</p>}
        actions={
          <button type="button" className={`${popupButtonClass()} w-full`} disabled={dropping} onClick={onDropLead}>
            {dropping ? "Dropping…" : "Drop lead here"}
          </button>
        }
        footer={footer}
        onClose={onClose}
        onInteract={onInteract}
      >
        <p className="text-sm text-white/80">No swath in the storms shown.</p>
        {note ? <p className="mt-2 text-sm text-white/60">{note}</p> : null}
      </StormPopupShell>
    );
  }

  if (canvass) {
    const pins = pinsForStorm(selected.stormId);
    return (
      <StormPopupShell
        titleId="hail-point-title"
        label="Canvass list"
        header={
          <div className="pr-8">
            <p className="text-[10px] tracking-wide text-white/70 uppercase">Canvass list</p>
            <p id="hail-point-title" className="text-lg font-semibold">
              {formatChipDate(selected.stormDate)}
            </p>
          </div>
        }
        headerStyle={{ background: hailBin(selected.maxBandIn)?.color ?? "#dc2626" }}
        actions={
          <button type="button" className={`${popupButtonClass()} w-full`} onClick={() => setCanvass(false)}>
            Back to hail
          </button>
        }
        footer={footer}
        onClose={onClose}
        onInteract={onInteract}
      >
        {pins.length ? (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {pins.map((pin) => (
              <li key={pin.id}>
                <button type="button" onClick={() => onOpenJob(pin.id)} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: pin.color }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{pin.code || pin.name}</span>
                    <span className="block truncate text-xs text-white/60">{pin.address || pin.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/75">No saved jobs inside this swath.</p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-white/45">TODO: assigning this list to a canvasser is not wired yet.</p>
      </StormPopupShell>
    );
  }

  const band = hailBin(selected.maxBandIn);
  const stormMax = hailBin(selected.stormMaxIn);
  const isMax = selected.stormId === lead?.storm.id;
  const days = chicagoDaysAgo(selected.stormDate);
  return (
    <StormPopupShell
      titleId="hail-point-title"
      label="Max hail at this point"
      headerStyle={{ background: band?.color ?? "#dc2626" }}
      header={
        <div className="pr-8">
          <p className="text-[10px] font-semibold tracking-wide uppercase">{isMax ? "Max hail at this point" : "Hail at this point"}</p>
          <p id="hail-point-title" className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl leading-none font-semibold">{formatHailInches(selected.maxBandIn)}</span>
            <span className="text-lg">{band?.label ?? "Hail"}</span>
          </p>
          <p className="mt-1 text-sm text-white/90">
            {formatStormDate(selected.stormDate)} · {formatChicagoClock(selected.passageAt)} · {daysAgoLabel(days)}
          </p>
        </div>
      }
      actions={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={popupButtonClass()} disabled={dropping} onClick={onDropLead}>
            {dropping ? "Dropping…" : "Drop lead here"}
          </button>
          <button type="button" className={popupButtonClass(true)} onClick={() => setCanvass(true)}>
            Build canvass list
          </button>
        </div>
      }
      footer={footer}
      onClose={onClose}
      onInteract={onInteract}
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">Storm max</dt>
          <dd className="font-medium">
            {formatHailInches(selected.stormMaxIn)} {stormMax?.label ?? ""}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">From core</dt>
          <dd className="font-medium">{selected.distanceMi.toFixed(1)} mi</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">Passed over</dt>
          <dd className="font-medium">{formatChicagoRange(selected.passedStart, selected.passedEnd)}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">Radar</dt>
          <dd className="font-medium">{selected.radarSite} · MESH</dd>
        </div>
      </dl>
      {selected.report ? (
        <p className="mt-3 rounded-lg bg-black/45 px-3 py-2 text-sm leading-snug">
          <span className="mr-2 font-semibold text-red-300">NWS LSR</span>
          {formatHailInches(selected.report.sizeIn)} hail reported {selected.report.place} at {formatChicagoClock(selected.report.reportedAt).replace(/ [A-Z]{2,4}$/, "")}
        </p>
      ) : null}
      <div className="mt-3">
        <p className="text-[10px] tracking-wide text-white/50 uppercase">Storms at this point · {visible.length}</p>
        <ul className="mt-1.5 space-y-1">
          {visible.map((hit) => {
            const color = hailBin(hit.maxBandIn)?.color ?? "#dc2626";
            const name = hailBin(hit.maxBandIn)?.label ?? "Hail";
            const active = hit.stormId === selected.stormId;
            return (
              <li key={hit.stormId}>
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setPickedId(hit.stormId)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${active ? "bg-white/10 ring-1 ring-white/30" : "hover:bg-white/5"}`}
                >
                  <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: color }}>
                    {formatHailInches(hit.maxBandIn)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {formatStormDate(hit.stormDate)} · {name}
                  </span>
                  <span className="text-xs text-white/55">{daysAgoLabel(chicagoDaysAgo(hit.stormDate), true)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-black/40 px-3 py-2">
          <p className="text-2xl leading-none font-semibold">{selected.jobsInSwath ?? "—"}</p>
          <p className="mt-1 text-[11px] text-white/60">your jobs in this swath</p>
        </div>
        <div className="rounded-lg bg-black/40 px-3 py-2" title="TODO: no parcel layer is connected yet.">
          <p className="text-2xl leading-none font-semibold">—</p>
          <p className="mt-1 text-[11px] text-white/60">roofs within 1 mi (est.)</p>
          <p className="text-[10px] text-white/40">Parcel count not connected</p>
        </div>
      </div>
      {note ? <p className="mt-2 text-xs text-white/50">{note}</p> : null}
    </StormPopupShell>
  );
}
