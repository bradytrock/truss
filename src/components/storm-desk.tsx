"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CloudLightning, CloudRain, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { isDeletedJob, jobAddress } from "@/lib/job-record";
import { formatCurrencyFull } from "@/lib/format";
import { jobHasCoords, workPinColor, workPinLabel } from "@/lib/project-map";
import { boardValue } from "@/lib/work-board";
import { ACTIVITY_LABELS } from "@/lib/types";
import { chicagoDaysAgoFromIso, daysAgoLabel } from "@/lib/weather/hail-point";
import type { StormJobPin } from "@/components/storm-popup/job-pin-popup";
import { PHOTO_PROMPT, buildStormDesk, type DeskJob, type JobStormImpact } from "@/lib/weather/desk";
import { HAIL_SWATH_NOTE } from "@/lib/weather/hail";
import { loadStormLayers, sendStormTexts, swathUrl } from "@/lib/weather/client";
import type { StormLayers } from "@/lib/weather/types";
import { isCompanyLeader } from "@/lib/visibility";

const StormMap = dynamic(
  () => import("@/components/storm-map").then((mod) => mod.StormMap),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading the map…</div> },
);

export function StormDesk() {
  const crm = useCrm();
  const [layers, setLayers] = useState<StormLayers | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showRadar, setShowRadar] = useState(false);
  const [showRotation, setShowRotation] = useState(false);

  const jobs = useMemo(() => (crm.jobs ?? []).filter((job) => !isDeletedJob(job) && jobHasCoords(job)), [crm.jobs]);
  const deskJobs = useMemo<DeskJob[]>(
    () =>
      jobs.map((job) => ({
        id: job.id,
        name: job.name,
        code: job.code,
        city: job.city,
        state: job.state,
        postalCode: job.postalCode,
        status: job.status,
        lat: job.lat as number,
        lng: job.lng as number,
        ownerStaffId: job.ownerStaffId,
      })),
    [jobs],
  );
  const states = useMemo(
    () => [crm.company.state, ...deskJobs.map((job) => job.state)].filter(Boolean),
    [crm.company.state, deskJobs],
  );

  useEffect(() => {
    if (!crm.hydrated) return;
    let cancel = false;
    const points = deskJobs.map((job) => ({ id: job.id, lat: job.lat, lng: job.lng, state: job.state }));
    loadStormLayers(points, states)
      .then((next) => {
        if (!cancel) setLayers(next);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : "The storm picture did not load.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [crm.hydrated, deskJobs, states]);

  const desk = useMemo(
    () =>
      layers
        ? buildStormDesk(deskJobs, layers)
        : null,
    [deskJobs, layers],
  );
  const selected = desk?.impacts.find((row) => row.id === selectedId) ?? desk?.impacts.find((row) => row.warning) ?? null;
  const selectedJob = selected ? deskJobs.find((job) => job.id === selected.id) : undefined;
  const pins = useMemo(() => mapPins(crm, jobs), [crm, jobs]);

  if (!crm.hydrated) return <LoadingScreen />;

  const rotation = showRotation && layers?.bounds
    ? { url: swathUrl(layers.bounds, "rotation"), bounds: layers.bounds }
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <PageHeader
        eyebrow="Field"
        title="Storm"
        description={desk?.summary ?? "Warnings, hail swaths, and the jobs sitting under them."}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={showRadar ? "default" : "outline"} onClick={() => setShowRadar((value) => !value)}>
              <CloudRain data-icon="inline-start" />
              Radar
            </Button>
            <Button type="button" variant={showRotation ? "default" : "outline"} onClick={() => setShowRotation((value) => !value)}>
              Wind path
            </Button>
            <Button type="button" variant="outline" disabled={loading} onClick={() => void reload(deskJobs, states, setLayers, setError, setLoading)}>
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
            {isCompanyLeader(crm.user.role) ? (
              <Button type="button" disabled={sending} onClick={() => void textCrew(setSending)}>
                Text the crew
              </Button>
            ) : null}
          </div>
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void reload(deskJobs, states, setLayers, setError, setLoading)} /> : null}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <aside className="min-h-0 space-y-3 overflow-y-auto pr-1">
          {loading && !layers ? <p className="text-sm text-muted-foreground">Reading warnings and the hail swath…</p> : null}
          {layers?.errors.map((item) => (
            <p key={item} className="text-sm text-amber-800">{item}</p>
          ))}
          {desk?.digest ? <p className="text-sm leading-relaxed">{desk.digest}</p> : null}
          <section>
            <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Warnings</h2>
            <ul className="mt-2 space-y-2">
              {(layers?.alerts ?? []).filter((alert) => alert.route !== "map").slice(0, 8).map((alert) => (
                <li key={alert.id} className="rounded-lg border px-3 py-2">
                  <p className="text-sm font-medium">{alert.event}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{alert.headline}</p>
                </li>
              ))}
              {layers && !layers.alerts.some((alert) => alert.route !== "map") ? (
                <li className="text-sm text-muted-foreground">No warning or watch over this book.</li>
              ) : null}
            </ul>
          </section>
          <section>
            <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Where to go</h2>
            <ul className="mt-2 space-y-1.5">
              {(desk?.canvass ?? []).slice(0, 12).map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className="flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{row.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[row.city, row.postalCode].filter(Boolean).join(" · ")}
                        {row.open ? " · open job" : " · past job"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs">{row.hailText}</span>
                  </button>
                </li>
              ))}
              {desk && !desk.canvass.length ? <li className="text-sm text-muted-foreground">No 1 inch hail or warning on a saved job.</li> : null}
            </ul>
          </section>
          <section>
            <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Neighborhoods</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(desk?.neighborhoods ?? []).slice(0, 8).map((row) => (
                <li key={row.key} className="flex justify-between gap-3">
                  <span>{row.label}</span>
                  <span className="text-muted-foreground">
                    {row.jobs} job{row.jobs === 1 ? "" : "s"}
                    {row.maxHail != null ? ` · ${row.maxHail.toFixed(2)} in` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {selected && selectedJob ? <StormSheet job={selectedJob} impact={selected} /> : null}
          <p className="text-xs leading-relaxed text-muted-foreground">{HAIL_SWATH_NOTE} {layers?.attribution}</p>
        </aside>
        <div className="relative min-h-[420px] overflow-hidden rounded-xl border lg:min-h-0">
          <StormMap
            pins={pins}
            showRadar={showRadar}
            focusId={selectedId}
            rotation={rotation}
            onDropLead={(lat, lng) => dropLead(crm, lat, lng)}
            onLogVisit={(jobId) => logVisit(crm, jobId)}
          />
          {loading ? (
            <p className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
              Updating the swath…
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StormSheet({ job, impact }: { job: DeskJob; impact: JobStormImpact }) {
  return (
    <section className="rounded-lg border bg-card px-3 py-3" aria-label="Storm sheet">
      <div className="flex items-center gap-2">
        <CloudLightning className="size-4" />
        <h2 className="text-sm font-medium">Storm sheet · {job.code || job.name}</h2>
      </div>
      <p className="mt-2 text-sm">{[job.city, job.state, job.postalCode].filter(Boolean).join(", ") || job.name}</p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Radar estimate</dt>
          <dd>{impact.hailText || "Under 0.75 in"}</dd>
        </div>
        {impact.nearestReport ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Nearest report</dt>
            <dd className="text-right">{impact.nearestReport.label} · {impact.nearestReport.miles.toFixed(1)} mi</dd>
          </div>
        ) : null}
        {impact.warning ? (
          <div>
            <dt className="text-muted-foreground">Warning</dt>
            <dd className="mt-0.5">{impact.warning.headline}</dd>
          </div>
        ) : null}
        {impact.lightningPercent != null && impact.lightningPercent >= 20 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Lightning, next 30 min</dt>
            <dd>{Math.round(impact.lightningPercent)}%</dd>
          </div>
        ) : null}
      </dl>
      {impact.hold ? <p className="mt-2 text-sm font-medium">{impact.holdReason}</p> : null}
      {impact.photoPrompt ? <p className="mt-2 text-sm">{PHOTO_PROMPT}</p> : null}
      {impact.comps.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Same storm: {impact.comps.map((comp) => `${comp.name} ${comp.hailText}`).join("; ")}
        </p>
      ) : null}
    </section>
  );
}

function mapPins(crm: ReturnType<typeof useCrm>, jobs: ReturnType<typeof useCrm>["jobs"]): StormJobPin[] {
  return jobs
    .filter((job) => jobHasCoords(job))
    .map((job) => {
      const opportunity = job.opportunityId ? crm.opportunities.find((item) => item.id === job.opportunityId) : undefined;
      const claim = (crm.jobInsurance ?? []).find((item) => item.jobId === job.id);
      const activity = (crm.activities ?? [])
        .filter((item) => item.entityType === "job" && item.entityId === job.id)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
      const contact = crm.contacts.find((item) => item.id === job.primaryContactId);
      return {
        id: job.id,
        code: job.code,
        name: job.name,
        customer: contact?.name?.trim() || job.name,
        address: jobAddress(job),
        lat: job.lat as number,
        lng: job.lng as number,
        color: workPinColor(job, opportunity),
        stage: workPinLabel(job, opportunity),
        carrier: claim?.carrier?.trim() || "",
        valueLabel: formatCurrencyFull(boardValue(job, opportunity)),
        rep: job.projectManager || job.salesRep || "",
        claimFiled: Boolean(claim),
        lastActivity: activity
          ? `${ACTIVITY_LABELS[activity.type]} · ${daysAgoLabel(chicagoDaysAgoFromIso(activity.createdAt))}`
          : "No activity yet",
      };
    });
}

async function dropLead(crm: ReturnType<typeof useCrm>, lat: number, lng: number) {
  let place = {
    street: "",
    city: "",
    state: crm.company.state || "",
    postalCode: "",
    label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
  };
  try {
    const response = await fetch(`/api/map/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`);
    if (response.ok) {
      const body = (await response.json()) as typeof place;
      if (body.label) place = body;
    }
  } catch {
    place = { ...place };
  }
  const created = await crm.addOpportunity({
    name: place.street ? `Storm lead · ${place.street}` : "Storm lead",
    clientId: null,
    primaryContactId: "",
    stage: "pursuing",
    value: 0,
    bidDueAt: null,
    preBidWalkAt: null,
    location: place.label,
    projectType: "roofing",
    market: "residential",
    deliveryMethod: "insurance_claim",
    estimator: crm.user.name,
    ownerStaffId: crm.user.staffId,
    nextStep: "Call the homeowner.",
    leadSource: "storm",
    referralContactId: null,
    street: place.street,
    city: place.city,
    state: place.state,
    postalCode: place.postalCode,
    notes: `Dropped on the storm map at ${lat.toFixed(4)}, ${lng.toFixed(4)}.`,
  });
  if (created.costingJob) {
    await crm.updateJob(created.costingJob.id, {
      lat,
      lng,
      street: place.street,
      city: place.city,
      state: place.state,
      postalCode: place.postalCode,
      location: place.label,
      geocodedAt: new Date().toISOString(),
      geocodeQuery: place.label,
      ownerStaffId: crm.user.staffId,
      projectManager: crm.user.name,
    });
  }
  toast.success("Lead dropped.");
}

async function logVisit(crm: ReturnType<typeof useCrm>, jobId: string) {
  await crm.addActivity({
    entityType: "job",
    entityId: jobId,
    type: "site_walk",
    body: "Site visit logged from the storm map.",
  });
  toast.success("Visit logged.");
}

async function reload(
  jobs: DeskJob[],
  states: string[],
  setLayers: (layers: StormLayers) => void,
  setError: (message: string) => void,
  setLoading: (value: boolean) => void,
) {
  setLoading(true);
  setError("");
  try {
    const next = await loadStormLayers(
      jobs.map((job) => ({ id: job.id, lat: job.lat, lng: job.lng, state: job.state })),
      states,
      true,
    );
    setLayers(next);
  } catch (err) {
    setError(err instanceof Error ? err.message : "The storm picture did not load.");
  } finally {
    setLoading(false);
  }
}

async function textCrew(setSending: (value: boolean) => void) {
  setSending(true);
  try {
    const result = await sendStormTexts();
    if (result.skipped) toast.message(result.skipped);
    else if ((result.texts ?? 0) === 0) toast.message("Nobody new to text. Warnings already went out, or none cover a job.");
    else if ((result.mocked ?? 0) > 0 && result.mocked === result.texts) toast.message("Office text isn't connected, so the message was not delivered.");
    else toast.success(`Texted ${result.texts}.`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "The storm text did not send.");
  } finally {
    setSending(false);
  }
}
