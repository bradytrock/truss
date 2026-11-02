"use client";

import { alertChips, alertKind, shortAlertLabel } from "@/lib/weather/alerts";
import { pointInGeometry } from "@/lib/weather/geometry";
import type { WeatherAlert } from "@/lib/weather/types";

export type AlertListJob = {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
};

export function MapAlertList({
  alerts,
  jobs,
  onSelectJob,
}: {
  alerts: WeatherAlert[];
  jobs: AlertListJob[];
  onSelectJob: (id: string) => void;
}) {
  const covered = jobs.flatMap((job) => {
    const hits = alerts.filter((alert) => pointInGeometry(job.lng, job.lat, alert.geometry));
    return hits.length ? [{ job, hits }] : [];
  });
  const inWarning = covered.filter((row) => row.hits.some((alert) => alertKind(alert.event) === "warning"));
  const warnedIds = new Set(inWarning.map((row) => row.job.id));
  const inWatch = covered.filter(
    (row) => !warnedIds.has(row.job.id) && row.hits.some((alert) => alertKind(alert.event) === "watch"),
  );
  const warningIds = new Set(
    inWarning.flatMap((row) => row.hits.filter((alert) => alertKind(alert.event) === "warning").map((alert) => alert.id)),
  );
  const products = alerts.filter((alert) => {
    const kind = alert.kind ?? alertKind(alert.event);
    return kind === "warning" || kind === "watch";
  });

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#f3d2d2] bg-[#fff5f5] px-3 py-2.5 text-sm text-[#7f1d1d]">
        {warningIds.size ? (
          <p className="font-medium">
            {warningIds.size} active warning{warningIds.size === 1 ? "" : "s"} near your jobs
          </p>
        ) : (
          <p className="font-medium">No warning covers a job site right now</p>
        )}
        <p className="mt-0.5 text-xs text-[#9f1239]/80">
          {inWarning.length
            ? `${inWarning.length} job${inWarning.length === 1 ? "" : "s"} in a warning.`
            : "Watches still shade the county when one is up."}
          {inWatch.length ? ` ${inWatch.length} more in a watch.` : ""}
        </p>
      </div>

      <JobGroup title="In a warning" rows={inWarning} onSelectJob={onSelectJob} empty="No job is inside a warning polygon." />
      <JobGroup title="In a watch" rows={inWatch} onSelectJob={onSelectJob} empty="No job is inside a watch county." />

      <section>
        <h3 className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          On the map · {products.length}
        </h3>
        {products.length ? (
          <ul className="mt-2 space-y-2">
            {products.slice(0, 12).map((alert) => {
              const kind = alert.kind ?? alertKind(alert.event);
              return (
                <li key={alert.id} className="rounded-xl border bg-background px-3 py-2.5">
                  <p className="text-sm font-semibold text-[#181818]">{shortAlertLabel(alert.event)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {alert.areaDesc || "NWS"}
                    {alert.until ? ` · until ${alert.until}` : ""}
                    {kind === "watch" ? " · county fill" : " · warning polygon"}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 px-1 text-sm text-muted-foreground">No active watches or warnings in this area.</p>
        )}
        {products.length > 12 ? (
          <p className="mt-2 px-1 text-xs text-muted-foreground">{products.length - 12} more on the map.</p>
        ) : null}
      </section>
    </div>
  );
}

function JobGroup({
  title,
  rows,
  onSelectJob,
  empty,
}: {
  title: string;
  rows: Array<{ job: AlertListJob; hits: WeatherAlert[] }>;
  onSelectJob: (id: string) => void;
  empty: string;
}) {
  return (
    <section>
      <h3 className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title} · {rows.length}
      </h3>
      {rows.length ? (
        <ul className="mt-2 space-y-2">
          {rows.map((row) => {
            const chips = alertChips(row.hits);
            return (
              <li key={row.job.id}>
                <button
                  type="button"
                  onClick={() => onSelectJob(row.job.id)}
                  className="w-full rounded-xl border bg-background px-3 py-2.5 text-left"
                >
                  <span className="block truncate text-sm font-semibold text-[#181818]">{row.job.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.job.address || "No address"}</span>
                  <span className="mt-2 flex flex-wrap gap-1">
                    {chips.map((chip) => {
                      const until = row.hits.find((alert) => shortAlertLabel(alert.event) === chip.label)?.until;
                      return (
                        <span
                          key={chip.label}
                          className={
                            chip.tone === "warning"
                              ? "rounded-full bg-[#fee2e2] px-2 py-0.5 text-[11px] font-medium text-[#9f1239]"
                              : "rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11px] font-medium text-[#92400e]"
                          }
                        >
                          {chip.label}
                          {until ? ` · ${until}` : ""}
                        </span>
                      );
                    })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 px-1 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
