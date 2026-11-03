"use client";

import { useEffect, useState } from "react";
import { PopupSection, PopupStats, StormPopupShell, popupButtonClass, type PopupArrow } from "@/components/storm-popup/shell";
import { hailBin } from "@/lib/weather/hail";
import { formatHailInches } from "@/lib/weather/hail-point";
import { reportClaimText } from "@/lib/weather/overlays";
import type { StormReport } from "@/lib/weather/types";

const CHICAGO = "America/Chicago";

export function StormReportPopup({
  report,
  arrow,
  onClose,
  onInteract,
}: {
  report: StormReport;
  arrow?: PopupArrow | null;
  onClose: () => void;
  onInteract: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const when = new Date(report.valid);
  const hasTime = !Number.isNaN(when.getTime());
  const size = report.kind === "hail" && report.inches != null ? formatHailInches(report.inches) : report.kind === "wind" && report.mph != null ? `${Math.round(report.mph)} mph` : "";
  const bin = report.kind === "hail" && report.inches != null ? hailBin(report.inches) : null;
  const kindName = report.kind === "hail" ? "Hail report" : report.kind === "wind" ? "Wind report" : "Tornado report";

  const copy = () => {
    const text = reportClaimText(report);
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => fallbackCopy(text, () => setCopied(true)));
    } else {
      fallbackCopy(text, () => setCopied(true));
    }
  };

  return (
    <StormPopupShell
      titleId="storm-report-title"
      label={kindName}
      width={300}
      arrow={arrow}
      header={
        <div className="pr-8">
          <p id="storm-report-title" className="text-base leading-tight font-semibold">
            {kindName}
            {size ? <span className="ml-1.5 font-mono">· {size}</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-white/60">{bin ? `${bin.label} · ` : ""}NWS local storm report</p>
        </div>
      }
      actions={
        <button type="button" className={popupButtonClass("outline")} onClick={copy}>
          {copied ? "Copied" : "Copy report for claim"}
        </button>
      }
      onClose={onClose}
      onInteract={onInteract}
    >
      <PopupStats
        columns={2}
        items={[
          { label: "Date", value: hasTime ? new Intl.DateTimeFormat("en-US", { timeZone: CHICAGO, month: "short", day: "numeric" }).format(when) : "—" },
          { label: "Time", value: hasTime ? new Intl.DateTimeFormat("en-US", { timeZone: CHICAGO, hour: "numeric", minute: "2-digit" }).format(when) : "—" },
          { label: "Near", value: report.city ? `${report.city}${report.state ? `, ${report.state}` : ""}` : `${report.lat.toFixed(3)}, ${report.lng.toFixed(3)}` },
          { label: "Source", value: report.source || "NWS" },
        ]}
      />
      <PopupSection title="Report text">
        <p className="text-[13px] leading-snug text-white/85">{report.remarks || "No remarks on this report."}</p>
      </PopupSection>
    </StormPopupShell>
  );
}

function fallbackCopy(text: string, done: () => void) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    if (document.execCommand("copy")) done();
  } catch {
    // Clipboard blocked: the report text stays visible on the card to copy by hand.
  } finally {
    document.body.removeChild(area);
  }
}
