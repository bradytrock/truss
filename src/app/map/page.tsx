"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobRecordWindow } from "@/components/job-window";
import { MapJobResultList, MapSearchBar } from "@/components/map-job-list";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { jobAddress, isDeletedJob } from "@/lib/job-record";
import { initials } from "@/lib/format";
import {
  addressNeedsGeocode,
  crewFreshness,
  GEO_WATCH_COARSE,
  GEO_WATCH_PRECISE,
  geoShareErrorMessage,
  jobHasCoords,
  jobMatchesMapSearch,
  jobMatchesProjectYear,
  parseMapYear,
  PROJECT_PIN_COLORS,
  projectYears,
  shouldPostPresence,
  shouldStopSharingOnGeoError,
  staffIdsForLiveMap,
  visibleCrew,
  workPinColor,
  workPinLabel,
  type CrewFreshness,
  type MapCrewPing,
} from "@/lib/project-map";
import { missingStormMapMessage } from "@/lib/supabase/schema-errors";
import { staffForReports } from "@/lib/visibility";
import { workColumnFor, WORK_COLUMN_LABELS, type WorkColumn } from "@/lib/work-board";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

const ProjectMapCanvas = dynamic(
  () => import("@/components/project-map-canvas").then((mod) => mod.ProjectMapCanvas),
  { ssr: false, loading: () => <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-[#706e6b]">Loading the map…</div> },
);

export default function MapPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MapPageInner />
    </Suspense>
  );
}

function MapPageInner() {
  const crm = useCrm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [coords, setCoords] = useState<Record<string, { lat: number; lng: number; geocodeQuery: string }>>({});
  const [crew, setCrew] = useState<MapCrewPing[]>([]);
  const [showProjects, setShowProjects] = useState(true);
  const [showCrew, setShowCrew] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [mapError, setMapError] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [query, setQuery] = useState("");
  const [stages, setStages] = useState<WorkColumn[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const geocodeTried = useRef(new Set<string>());
  const shareWatch = useRef<number | null>(null);
  const lastPresenceAt = useRef<number | null>(null);
  const selectedStaffId = searchParams.get("crew");
  const jobId = searchParams.get("job");
  const [recordJobId, setRecordJobId] = useState<string | null>(null);

  const jobs = useMemo(
    () =>
      (crm.jobs ?? []).filter((job) => !isDeletedJob(job)).map((job) => {
        const extra = coords[job.id];
        return extra ? { ...job, lat: extra.lat, lng: extra.lng, geocodeQuery: extra.geocodeQuery } : job;
      }),
    [coords, crm.jobs],
  );

  const years = useMemo(() => projectYears(jobs), [jobs]);
  const year = parseMapYear(searchParams.get("year"), years);
  const yearJobs = useMemo(() => jobs.filter((job) => jobMatchesProjectYear(job, year)), [jobs, year]);
  const listedJobs = useMemo(
    () =>
      yearJobs.filter((job) => {
        const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
        if (stages.length && !stages.includes(workColumnFor(job, opportunity))) return false;
        const homeowner = crm.getContact(job.primaryContactId)?.name?.trim() || "";
        return jobMatchesMapSearch(job, query, [homeowner, jobAddress(job)]);
      }),
    [crm, query, stages, yearJobs],
  );
  const mappedJobs = useMemo(() => listedJobs.filter(jobHasCoords), [listedJobs]);
  const needGeocode = useMemo(() => yearJobs.filter(addressNeedsGeocode), [yearJobs]);
  const selectedJob = jobId ? jobs.find((job) => job.id === jobId) ?? crm.getJob(jobId) : undefined;
  const recordJob = recordJobId
    ? jobs.find((job) => job.id === recordJobId) ?? crm.getJob(recordJobId)
    : undefined;

  const viewer = crm.effectiveStaff;
  const visibleStaffIds = useMemo(() => {
    if (!viewer) return new Set<string>();
    return staffIdsForLiveMap(
      staffForReports(viewer, crm.book.staff).map((member) => member.id),
      [viewer.id, crm.user.staffId],
    );
  }, [crm.book.staff, crm.user.staffId, viewer]);

  const liveCrew = useMemo(() => {
    const now = Date.now();
    return visibleCrew(crew, now)
      .filter((row) => !visibleStaffIds.size || visibleStaffIds.has(row.staffId))
      .map((row) => ({
        ...row,
        name: crm.book.staff.find((member) => member.id === row.staffId)?.name || row.name,
        freshness: crewFreshness(row.updatedAt, now),
        updatedLabel: relativeTime(row.updatedAt, now),
      }));
  }, [crm.book.staff, crew, visibleStaffIds]);

  const selectedCrew = liveCrew.find((row) => row.staffId === selectedStaffId);

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `/map?${qs}` : "/map", { scroll: false });
    },
    [router, searchParams],
  );

  const setYear = useCallback(
    (next: number | "all") => {
      replaceParams((params) => {
        params.set("year", String(next));
        params.delete("job");
      });
      setRecordJobId(null);
    },
    [replaceParams],
  );

  const selectJob = useCallback(
    (id: string) => {
      setRecordJobId(null);
      replaceParams((params) => {
        params.set("job", id);
        params.delete("crew");
      });
    },
    [replaceParams],
  );

  const selectCrew = useCallback(
    (id: string) => {
      replaceParams((params) => {
        params.set("crew", id);
        params.delete("job");
      });
    },
    [replaceParams],
  );

  const toggleStage = useCallback((column: WorkColumn) => {
    setStages((current) =>
      current.includes(column) ? current.filter((item) => item !== column) : [...current, column],
    );
  }, []);

  const openJobRecord = useCallback((id: string) => {
    setRecordJobId(id);
    replaceParams((params) => {
      params.set("job", id);
      params.delete("crew");
    });
  }, [replaceParams]);

  const closeJobRecord = useCallback(() => {
    setRecordJobId(null);
  }, []);

  const loadCrew = useCallback(async () => {
    const response = await fetch("/api/map/presence", { cache: "no-store" });
    const json = (await response.json()) as { crew?: MapCrewPing[]; error?: string; missing?: boolean };
    if (json.missing) {
      setMapError(missingStormMapMessage());
      return;
    }
    if (!response.ok) {
      setMapError(json.error || "Could not load crew locations.");
      return;
    }
    setCrew(json.crew ?? []);
    if (json.error) setMapError(json.error);
  }, []);

  const geocodeMissing = useCallback(async () => {
    const pending = needGeocode.filter((job) => !geocodeTried.current.has(job.id));
    if (!pending.length) return;
    for (const job of pending) geocodeTried.current.add(job.id);
    setGeocoding(true);
    try {
      const response = await fetch("/api/map/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: pending.map((job) => job.id) }),
      });
      const json = (await response.json()) as {
        jobs?: Array<{ id: string; lat: number; lng: number; geocodeQuery: string }>;
        error?: string;
        missing?: boolean;
      };
      if (json.missing) {
        setMapError(missingStormMapMessage());
        return;
      }
      if (!response.ok) {
        setMapError(json.error || "Could not place those job sites.");
        return;
      }
      if (json.jobs?.length) {
        setCoords((prev) => {
          const next = { ...prev };
          for (const row of json.jobs ?? []) next[row.id] = row;
          return next;
        });
      }
    } finally {
      setGeocoding(false);
    }
  }, [needGeocode]);

  useEffect(() => {
    if (!crm.hydrated) return;
    void loadCrew();
    const timer = window.setInterval(() => void loadCrew(), 15000);
    return () => window.clearInterval(timer);
  }, [crm.hydrated, loadCrew]);

  useEffect(() => {
    if (!crm.hydrated || geocoding || !needGeocode.length) return;
    void geocodeMissing();
  }, [crm.hydrated, geocodeMissing, geocoding, needGeocode.length]);

  const stopSharing = useCallback(() => {
    if (shareWatch.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(shareWatch.current);
    }
    shareWatch.current = null;
    setSharing(false);
  }, []);

  const startSharing = useCallback(() => {
    if (!navigator.geolocation) {
      setMapError(geoShareErrorMessage({ unsupported: true }));
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setMapError(geoShareErrorMessage({ insecure: true }));
      return;
    }
    setSharing(true);
    setMapError("");
    const watch = (options: PositionOptions, fallback: PositionOptions | null) => {
      if (shareWatch.current != null) navigator.geolocation.clearWatch(shareWatch.current);
      shareWatch.current = navigator.geolocation.watchPosition(
        (position) => {
          const now = Date.now();
          if (!shouldPostPresence(lastPresenceAt.current, now)) return;
          lastPresenceAt.current = now;
          void fetch("/api/map/presence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
              heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
            }),
          }).then((response) => {
            if (response.ok) void loadCrew();
          });
        },
        (error) => {
          setMapError(geoShareErrorMessage({ code: error.code }));
          if (shouldStopSharingOnGeoError(error.code)) {
            stopSharing();
            return;
          }
          if (fallback) watch(fallback, null);
        },
        options,
      );
    };
    watch(GEO_WATCH_PRECISE, GEO_WATCH_COARSE);
  }, [loadCrew, stopSharing]);

  useEffect(() => () => stopSharing(), [stopSharing]);

  const pins = useMemo(
    () =>
      mappedJobs.map((job) => {
        const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
        return {
          id: job.id,
          code: job.code,
          name: job.name,
          lat: job.lat as number,
          lng: job.lng as number,
          color: workPinColor(job, opportunity),
          label: workPinLabel(job, opportunity),
          address: jobAddress(job),
          homeowner: crm.getContact(job.primaryContactId)?.name?.trim() || "",
          projectManager: job.projectManager?.trim() || "",
        };
      }),
    [crm, mappedJobs],
  );

  if (!crm.hydrated) return <LoadingScreen />;

  const searchBar = (
    <MapSearchBar
      query={query}
      onQuery={setQuery}
      years={years}
      year={year}
      onYear={setYear}
      stages={stages}
      onToggleStage={toggleStage}
      showCrew={showCrew}
      onToggleCrew={() => setShowCrew((value) => !value)}
    />
  );

  return (
    <div className="lg:space-y-4">
      {crm.hydrateError ? <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} /> : null}
      {mapError ? <ErrorBanner message={mapError} onRetry={() => { setMapError(""); void loadCrew(); void geocodeMissing(); }} /> : null}
      <div className="hidden lg:block">
        <PageHeader
          eyebrow="Field"
          title="Map"
          description="Job sites and live crew. Search an address, filter by year or stage, and tap a name pill to see who is pinging."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={showProjects ? "default" : "outline"} onClick={() => setShowProjects((value) => !value)}>
                Projects {mappedJobs.length}
              </Button>
              <Button variant={sharing ? "secondary" : "outline"} onClick={sharing ? stopSharing : startSharing}>
                {sharing ? "Stop sharing" : "Share my location"}
              </Button>
            </div>
          }
        />
      </div>
      <div className="relative -mx-5 -mb-5 flex min-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden bg-[#eceae6] lg:mx-0 lg:mb-0 lg:min-h-[680px] lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:overflow-hidden lg:rounded-xl lg:border">
        <div className="absolute inset-0 lg:relative lg:order-2">
          <ProjectMapCanvas
            jobs={showProjects ? pins : []}
            crew={showCrew ? liveCrew : []}
            selectedJobId={jobId}
            selectedStaffId={selectedStaffId}
            showProjects={showProjects}
            showCrew={showCrew}
            fitKey={`${year}|${query}|${stages.join(",")}|${showProjects}|${showCrew}|${pins.length}|${liveCrew.length}`}
            onSelectJob={selectJob}
            onOpenJob={openJobRecord}
            onSelectCrew={selectCrew}
          />
          <div className="absolute top-3 right-3 z-10 hidden flex-col gap-2 lg:flex">
            <Button
              size="icon"
              variant={sharing ? "secondary" : "outline"}
              className="bg-background shadow-sm"
              onClick={sharing ? stopSharing : startSharing}
              aria-label={sharing ? "Stop sharing location" : "Share my location"}
            >
              <LocateFixed />
            </Button>
          </div>
          {geocoding || needGeocode.length ? (
            <p className="pointer-events-none absolute bottom-28 left-3 z-10 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm lg:bottom-3">
              {geocoding ? "Mapping sites…" : `${needGeocode.length} still looking up`}
            </p>
          ) : null}
        </div>

        <div className="absolute top-3 right-3 left-3 z-20 lg:hidden">
          {searchBar}
          <div className="mt-2 flex justify-end">
            <Button
              size="icon"
              variant={sharing ? "secondary" : "outline"}
              className="bg-background shadow-sm"
              onClick={sharing ? stopSharing : startSharing}
              aria-label={sharing ? "Stop sharing location" : "Share my location"}
            >
              <LocateFixed />
            </Button>
          </div>
        </div>

        <aside
          className={cn(
            "absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t bg-background shadow-[0_-8px_28px_rgba(0,0,0,0.12)] transition-[height] lg:static lg:order-1 lg:h-auto lg:max-h-none lg:rounded-none lg:border-r lg:border-t-0 lg:shadow-none",
            listOpen ? "h-[58%]" : "h-[8.25rem]",
          )}
        >
          <button
            type="button"
            className="flex w-full flex-col items-center pt-2 lg:hidden"
            onClick={() => setListOpen((value) => !value)}
            aria-expanded={listOpen}
          >
            <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
            <span className="sr-only">{listOpen ? "Collapse job list" : "Expand job list"}</span>
          </button>
          <div className="hidden border-b p-3 lg:block">{searchBar}</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <MapJobResultList
              jobs={listedJobs}
              photos={crm.photos}
              opportunities={crm.opportunities}
              selectedJobId={jobId}
              onSelect={(id) => {
                selectJob(id);
                setListOpen(false);
              }}
            />
            {selectedCrew ? (
              <div className="mt-3">
                <CrewCard
                  name={selectedCrew.name}
                  freshness={selectedCrew.freshness}
                  updatedLabel={selectedCrew.updatedLabel}
                  nearby={nearbyJobs(listedJobs, selectedCrew.lat, selectedCrew.lng)}
                  onSelectJob={selectJob}
                />
              </div>
            ) : null}
            {selectedJob ? (
              <div className="mt-3 hidden lg:block">
                <JobCard
                  job={selectedJob}
                  homeowner={crm.getContact(selectedJob.primaryContactId)?.name?.trim() || ""}
                  onOpen={() => openJobRecord(selectedJob.id)}
                />
              </div>
            ) : null}
            <div className="mt-3 hidden lg:block">
              <Legend />
            </div>
          </div>
        </aside>
      </div>
      {recordJob ? <JobRecordWindow key={recordJob.id} job={recordJob} onClose={closeJobRecord} /> : null}
    </div>
  );
}

function JobCard({
  job,
  homeowner,
  onOpen,
}: {
  job: Job;
  homeowner: string;
  onOpen: () => void;
}) {
  return (
    <div className="border border-[#c9c9c9] bg-white px-4 py-3 text-left shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
      <p className="font-mono text-xs tracking-wide text-[#706e6b]">{job.code || "Job"}</p>
      <p className="mt-0.5 font-medium text-[#181818]">{job.name || jobAddress(job) || "Untitled"}</p>
      <p className="mt-2 text-sm text-[#181818]">{jobAddress(job) || "No site yet"}</p>
      <p className="mt-1 text-sm text-[#706e6b]">Homeowner · {homeowner || "No homeowner"}</p>
      <p className="mt-1 text-sm text-[#706e6b]">PM · {job.projectManager || "Unassigned"}</p>
      <Button className="mt-3" onClick={onOpen}>
        Open job
      </Button>
    </div>
  );
}

function CrewCard({
  name,
  freshness,
  updatedLabel,
  nearby,
  onSelectJob,
}: {
  name: string;
  freshness: CrewFreshness;
  updatedLabel: string;
  nearby: Job[];
  onSelectJob: (id: string) => void;
}) {
  return (
    <div className="border border-[#c9c9c9] bg-white px-4 py-3 shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2">
        <span className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white ${freshness === "live" ? "bg-[#111]" : "bg-[#6b7280]"}`}>
          {initials(name) || "?"}
        </span>
        <div>
          <p className="font-medium text-[#181818]">{name}</p>
          <p className="text-xs text-[#706e6b]">{freshness === "live" ? "Live" : "Last seen"} · {updatedLabel}</p>
        </div>
      </div>
      {nearby.length ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">Jobs near them</p>
          {nearby.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => onSelectJob(job.id)}
              className="block w-full text-left text-sm text-[#181818] hover:underline"
            >
              {job.code || job.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Legend() {
  const items: WorkColumn[] = [
    "lead",
    "estimating",
    "proposal_sent",
    "supplementing",
    "in_progress",
    "punch",
    "complete",
  ];
  return (
    <div className="border border-[#c9c9c9] bg-white px-4 py-3 text-xs text-[#706e6b]">
      <p className="mb-2 text-[11px] font-semibold tracking-wide uppercase">Pins</p>
      <ul className="space-y-1">
        {items.map((column) => (
          <li key={column} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: pinColor(column) }} />
            {WORK_COLUMN_LABELS[column]}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="flex size-4 items-center justify-center rounded-full bg-[#111] text-[8px] font-semibold text-white">AA</span>
          Live phone
        </li>
      </ul>
    </div>
  );
}

function pinColor(column: WorkColumn) {
  return PROJECT_PIN_COLORS[column];
}

function nearbyJobs(jobs: Job[], lat: number, lng: number) {
  return jobs
    .filter(jobHasCoords)
    .map((job) => ({ job, miles: haversineMiles(lat, lng, job.lat as number, job.lng as number) }))
    .filter((row) => row.miles <= 8)
    .sort((left, right) => left.miles - right.miles)
    .slice(0, 4)
    .map((row) => row.job);
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function relativeTime(value: string, now = Date.now()) {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return "unknown";
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hr ago" : `${hours} hr ago`;
}

