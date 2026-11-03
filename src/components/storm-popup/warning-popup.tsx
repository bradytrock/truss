"use client";

import { useState } from "react";
import { Square } from "lucide-react";
import { PopupRow, PopupSection, PopupStats, StormPopupShell, popupButtonClass, type PopupArrow } from "@/components/storm-popup/shell";
import type { StormJobPin } from "@/components/storm-popup/job-pin-popup";
import { areaCount, issuedLine, leadCounty, minutesLeftLabel } from "@/lib/weather/alerts";
import { formatHailInches } from "@/lib/weather/hail-point";
import { warningTone } from "@/lib/weather/overlays";
import type { WeatherAlert } from "@/lib/weather/types";

export function WarningPopup({
  alert,
  jobsInside,
  canNotify,
  arrow,
  busy,
  onClose,
  onInteract,
  onNotify,
  onOpenJob,
}: {
  alert: WeatherAlert;
  jobsInside: StormJobPin[];
  /** Company leaders send the office text; everyone else sees why the button is off. */
  canNotify: boolean;
  arrow?: PopupArrow | null;
  busy: boolean;
  onClose: () => void;
  onInteract: () => void;
  onNotify: () => void;
  onOpenJob: (id: string) => void;
}) {
  const [reading, setReading] = useState(false);
  const county = leadCounty(alert.areaDesc);
  const more = areaCount(alert.areaDesc) - 1;
  const left = minutesLeftLabel(alert.ends);
  const fullText = [alert.headline, alert.description, alert.instruction].filter(Boolean).join("\n\n");

  return (
    <StormPopupShell
      titleId="warning-title"
      label={alert.event}
      width={300}
      arrow={arrow}
      band={{
        tone: warningTone(alert.event),
        icon: <Square className="size-3" strokeWidth={2.5} />,
        label: <span id="warning-title">{alert.event}</span>,
        trailing: left,
      }}
      header={
        <div className="pr-8">
          <p className="text-[15px] leading-tight font-semibold">
            {county || alert.areaDesc || "NWS warning"}
            {more > 0 ? <span className="ml-1.5 text-xs font-normal text-white/55">+{more} more</span> : null}
          </p>
          <p className="mt-1 text-xs leading-snug text-white/60">{issuedLine(alert) || alert.headline}</p>
        </div>
      }
      actions={
        <>
          <button
            type="button"
            className={popupButtonClass("danger")}
            disabled={busy || !canNotify || !jobsInside.length}
            title={!canNotify ? "A company admin sends the storm text." : !jobsInside.length ? "No job inside this polygon" : undefined}
            onClick={onNotify}
          >
            {busy ? "Sending…" : "Notify all contacts inside"}
          </button>
          <button type="button" className={popupButtonClass("outline")} aria-expanded={reading} onClick={() => setReading((value) => !value)}>
            {reading ? "Hide NWS text" : "Read full NWS text"}
          </button>
        </>
      }
      onClose={onClose}
      onInteract={onInteract}
    >
      <PopupStats
        columns={2}
        items={[
          { label: "Source", value: alert.source || "NWS" },
          { label: "Max hail", value: alert.hailInches ? formatHailInches(alert.hailInches) : alert.windMph ? `${Math.round(alert.windMph)} mph` : "—" },
        ]}
      />
      <PopupSection title="Jobs inside">
        {jobsInside.length ? (
          jobsInside.slice(0, 4).map((job) => (
            <button key={job.id} type="button" onClick={() => onOpenJob(job.id)} className="block w-full rounded px-1 text-left hover:bg-white/5">
              <PopupRow label={`${job.customer || job.name}${job.city ? ` · ${job.city}` : ""}`} value={job.stage} />
            </button>
          ))
        ) : (
          <p className="text-[13px] text-white/60">No job inside this polygon</p>
        )}
        {jobsInside.length > 4 ? <p className="text-[11px] text-white/45">{jobsInside.length - 4} more inside</p> : null}
      </PopupSection>
      {reading ? (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg bg-black/40 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-white/85">
          {fullText || "The NWS product text is not in this feed."}
        </div>
      ) : null}
    </StormPopupShell>
  );
}
