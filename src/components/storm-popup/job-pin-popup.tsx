"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PopupSkeleton, StormPopupShell, popupButtonClass } from "@/components/storm-popup/shell";
import { jobRecordHref } from "@/lib/job-record";
import { loadHailPoint } from "@/lib/weather/client";
import { hailBin } from "@/lib/weather/hail";
import {
  chicagoDaysAgo,
  daysAgoLabel,
  formatChipDate,
  formatHailInches,
  headerHit,
  type HailPopupHit,
} from "@/lib/weather/hail-point";
import { readJobHail, writeJobHail } from "@/lib/weather/point-cache";

export type StormJobPin = {
  id: string;
  code: string;
  name: string;
  customer: string;
  address: string;
  lat: number;
  lng: number;
  color: string;
  stage: string;
  carrier: string;
  valueLabel: string;
  rep: string;
  claimFiled: boolean;
  lastActivity: string;
};

export function JobPinPopup({
  pin,
  onClose,
  onInteract,
  onLogVisit,
  logging,
  lookupHail,
}: {
  pin: StormJobPin;
  onClose: () => void;
  onInteract: () => void;
  onLogVisit: () => void;
  logging: boolean;
  /** When set, hail comes from the swaths already on the map instead of a separate lookup. */
  lookupHail?: (lat: number, lng: number) => HailPopupHit[];
}) {
  const router = useRouter();
  const cached = readJobHail(pin.id);
  const liveHits = lookupHail ? lookupHail(pin.lat, pin.lng) : null;
  const [status, setStatus] = useState<"loading" | "error" | "ready">(cached ? "ready" : "loading");
  const [hits, setHits] = useState<HailPopupHit[]>(cached ?? []);
  const [message, setMessage] = useState("");
  const shownHits = liveHits ?? hits;
  const shownStatus = liveHits ? "ready" : status;

  useEffect(() => {
    if (lookupHail) return;
    const saved = readJobHail(pin.id);
    if (saved) return;
    let cancel = false;
    loadHailPoint(pin.lat, pin.lng)
      .then((result) => {
        if (cancel) return;
        writeJobHail(pin.id, result.hits);
        setHits(result.hits);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancel) return;
        setMessage(error instanceof Error ? error.message : "The hail lookup did not finish.");
        setStatus("error");
      });
    return () => {
      cancel = true;
    };
  }, [lookupHail, pin.id, pin.lat, pin.lng]);

  const top = headerHit(
    shownHits.map((hit) => ({
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
  const shown = shownHits.find((hit) => hit.stormId === top?.storm.id) ?? shownHits[0] ?? null;
  const band = shown ? hailBin(shown.maxBandIn) : null;

  return (
    <StormPopupShell
      titleId="job-pin-title"
      label={pin.code || pin.name}
      headerStyle={{ background: "#14161c" }}
      header={
        <div className="pr-8">
          <div className="flex items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: pin.color }}>
              {pin.stage}
            </span>
            <span id="job-pin-title" className="text-sm font-semibold">
              {pin.code || pin.name}
            </span>
          </div>
          <p className="mt-2 text-base leading-tight font-medium">{pin.customer || pin.name}</p>
          <p className="mt-0.5 text-sm text-white/65">{pin.address || "No address yet"}</p>
        </div>
      }
      actions={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={popupButtonClass()} disabled={logging} onClick={onLogVisit}>
            {logging ? "Saving…" : "Log visit"}
          </button>
          <button type="button" className={popupButtonClass(true)} onClick={() => router.push(jobRecordHref(pin.id))}>
            Open job
          </button>
        </div>
      }
      onClose={onClose}
      onInteract={onInteract}
    >
      <div className="rounded-lg bg-black/40 px-3 py-2">
        {shownStatus === "loading" ? <PopupSkeleton /> : null}
        {shownStatus === "error" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-white/75">{message}</p>
            <button
              type="button"
              className="text-sm font-medium underline"
              onClick={() => {
                setStatus("loading");
                (lookupHail ? Promise.resolve({ hits: lookupHail(pin.lat, pin.lng) }) : loadHailPoint(pin.lat, pin.lng))
                  .then((result) => {
                    writeJobHail(pin.id, result.hits);
                    setHits(result.hits);
                    setStatus("ready");
                  })
                  .catch((error: unknown) => {
                    setMessage(error instanceof Error ? error.message : "The hail lookup did not finish.");
                    setStatus("error");
                  });
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
        {shownStatus === "ready" && shown && band ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: band.color }}>
              {formatHailInches(shown.maxBandIn)}
            </span>
            <span>
              {band.label} · {formatChipDate(shown.stormDate)} · {daysAgoLabel(chicagoDaysAgo(shown.stormDate))}
            </span>
            {shownHits.length > 1 ? <span className="text-white/55">{shownHits.length} storms total</span> : null}
          </p>
        ) : null}
        {shownStatus === "ready" && !shown ? (
          <p className="text-sm text-white/75">
            {lookupHail ? "No hail on file — no swath over this address in the last 24 hours." : "No hail on file — no swath over this address in 90 days."}
          </p>
        ) : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">Carrier</dt>
          <dd className="font-medium">{pin.carrier || "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">Job value</dt>
          <dd className="font-medium">{pin.valueLabel}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">Assigned rep</dt>
          <dd className="font-medium">{pin.rep || "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-white/50 uppercase">Claim status</dt>
          <dd className="font-medium">{pin.claimFiled ? "Filed" : "Not filed"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-white/55">{pin.lastActivity}</p>
    </StormPopupShell>
  );
}
