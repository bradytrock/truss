"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocateFixed, MapPin, Maximize2, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { JobRecordWindow } from "@/components/job-window";
import { MapAlertList } from "@/components/map-alert-list";
import {
  MapJobResultList,
  MapListToolbar,
  MapSearchBar,
  mapJobStage,
  sortMapJobs,
  type MapListSort,
} from "@/components/map-job-list";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { jobAddress, isDeletedJob } from "@/lib/job-record";
import { formatCurrencyFull, formatDateShort, initials } from "@/lib/format";
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
import { alertChips, alertKind, type AlertChip } from "@/lib/weather/alerts";
import { loadStormLayers, sendStormTexts } from "@/lib/weather/client";
import { pointInGeometry } from "@/lib/weather/geometry";
import { chicagoDaysAgoFromIso, daysAgoLabel, formatChicagoClock, nearestRadarSite } from "@/lib/weather/hail-point";
import type { StormLayers } from "@/lib/weather/types";
import { isCompanyLeader, staffForReports } from "@/lib/visibility";
import { boardValue, WORK_COLUMN_LABELS, type WorkColumn } from "@/lib/work-board";
import { ACTIVITY_LABELS, type Job } from "@/lib/types";
import type { StormJobPin } from "@/components/storm-popup/job-pin-popup";
import { cn } from "@/lib/utils";

const StormMap = dynamic(
  () => import("@/components/storm-map").then((mod) => mod.StormMap),
  { ssr: false, loading: () => <div className="flex h-full min-h-0 items-center justify-center text-sm text-[#706e6b]">Loading the map…</div> },
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
  const [showWeather, setShowWeather] = useState(true);
  const [showHail, setShowHail] = useState(true);
  const [showOutlook, setShowOutlook] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);
  const [radarFull, setRadarFull] = useState(false);
  const [listTab, setListTab] = useState<"jobs" | "warnings">("jobs");
  const [texting, setTexting] = useState(false);
  const [stormLayers, setStormLayers] = useState<StormLayers | null>(null);
  const [swathError, setSwathError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [mapError, setMapError] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [query, setQuery] = useState("");
  const [stages, setStages] = useState<WorkColumn[]>([]);
  const [sort, setSort] = useState<MapListSort>("recent");
  const [listOpen, setListOpen] = useState(false);
  const geocodeTried = useRef(new Set<string>());
  const shareWatch = useRef<number | null>(null);
  const lastPresenceAt = useRef<number | null>(null);
  const popupOpen = useRef(false);
  const radarDeskRef = useRef<HTMLDivElement>(null);
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
  const searchedJobs = useMemo(
    () =>
      yearJobs.filter((job) => {
        const homeowner = crm.getContact(job.primaryContactId)?.name?.trim() || "";
        return jobMatchesMapSearch(job, query, [homeowner, jobAddress(job)]);
      }),
    [crm, query, yearJobs],
  );
  const stageCounts = useMemo(() => {
    const counts: Partial<Record<WorkColumn, number>> = {};
    for (const job of searchedJobs) {
      const column = mapJobStage(job, crm.opportunities);
      counts[column] = (counts[column] ?? 0) + 1;
    }
    return counts;
  }, [crm.opportunities, searchedJobs]);
  const listedJobs = useMemo(() => {
    const filtered = stages.length
      ? searchedJobs.filter((job) => stages.includes(mapJobStage(job, crm.opportunities)))
      : searchedJobs;
    return sortMapJobs(filtered, sort);
  }, [crm.opportunities, searchedJobs, sort, stages]);
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

  const clearStages = useCallback(() => setStages([]), []);

  const clearJob = useCallback(() => {
    setRecordJobId(null);
    replaceParams((params) => {
      params.delete("job");
    });
  }, [replaceParams]);

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

  const pins = useMemo(() => mapPins(crm, mappedJobs), [crm, mappedJobs]);
  const radarSite = useMemo(() => {
    const fromSwath = stormLayers?.hailSwaths?.[0]?.radarSite;
    if (fromSwath) return fromSwath;
    const pin = pins[0];
    return pin ? nearestRadarSite(pin.lat, pin.lng) : "NEXRAD";
  }, [pins, stormLayers]);
  const alertNotes = useMemo(() => {
    const notes = new Map<string, AlertChip[]>();
    const alerts = stormLayers?.alerts ?? [];
    for (const pin of pins) {
      const hits = alerts.filter((alert) => pointInGeometry(pin.lng, pin.lat, alert.geometry));
      const chips = alertChips(hits);
      if (chips.length) notes.set(pin.id, chips);
    }
    return notes;
  }, [pins, stormLayers]);
  const watchWarningCount = useMemo(
    () =>
      (stormLayers?.alerts ?? []).filter((alert) => {
        const kind = alert.kind ?? alertKind(alert.event);
        return kind === "warning" || kind === "watch";
      }).length,
    [stormLayers],
  );

  useEffect(() => {
    if (!crm.hydrated) return;
    let cancel = false;
    const points = mappedJobs.map((job) => ({
      id: job.id,
      lat: job.lat as number,
      lng: job.lng as number,
      state: job.state,
    }));
    loadStormLayers(points, [crm.company.state, ...points.map((point) => point.state || "")])
      .then((layers) => {
        if (cancel) return;
        setStormLayers(layers);
        setSwathError(layers.errors.find((item) => /hail/i.test(item)) ?? "");
      })
      .catch((error: unknown) => {
        if (cancel) return;
        setStormLayers(null);
        setSwathError(error instanceof Error ? error.message : "The hail swath did not load.");
      });
    return () => {
      cancel = true;
    };
  }, [crm.company.state, crm.hydrated, mappedJobs]);

  const leaveRadar = useCallback(() => {
    setRadarFull(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  const enterRadar = useCallback(() => {
    setRadarFull(true);
    const node = radarDeskRef.current;
    if (node?.requestFullscreen) void node.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!radarFull) return;
    const onChange = () => {
      if (!document.fullscreenElement) setRadarFull(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || popupOpen.current) return;
      leaveRadar();
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [leaveRadar, radarFull]);

  if (!crm.hydrated) return <LoadingScreen />;

  const searchProps = {
    query,
    onQuery: setQuery,
    years,
    year,
    onYear: setYear,
    stages,
    onToggleStage: toggleStage,
    onClearStages: clearStages,
    stageCounts,
    totalCount: searchedJobs.length,
    showCrew,
    onToggleCrew: () => setShowCrew((value) => !value),
    showWeather,
    onToggleWeather: () => setShowWeather((value) => !value),
  };
  const selectedOpportunity = selectedJob?.opportunityId ? crm.getOpportunity(selectedJob.opportunityId) : undefined;
  const selectedPhone = selectedJob ? crm.getContact(selectedJob.primaryContactId)?.phone?.trim() || "" : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:gap-4">
      {crm.hydrateError ? <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} /> : null}
      {mapError ? <ErrorBanner message={mapError} onRetry={() => { setMapError(""); void loadCrew(); void geocodeMissing(); }} /> : null}
      <div className="hidden shrink-0 lg:block">
        <PageHeader
          eyebrow="Field"
          title="Map"
          description="Job sites, live radar, county watches, warning polygons, hail, and the SPC outlook."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs">
                <span className="size-1.5 rounded-full bg-[#e11d48]" />
                LIVE · {radarSite}
              </span>
              <Button type="button" className="bg-[#e11d48] text-white hover:bg-[#be123c]" onClick={enterRadar}>
                <Maximize2 data-icon="inline-start" />
                Full-screen radar
              </Button>
              <Button variant={sharing ? "secondary" : "outline"} onClick={sharing ? stopSharing : startSharing}>
                <MapPin data-icon="inline-start" />
                {sharing ? "Stop sharing" : "Share my location"}
              </Button>
              {isCompanyLeader(crm.user.role) ? (
                <Button type="button" variant="outline" disabled={texting} onClick={() => void textCrew(setTexting)}>
                  Text the crew
                </Button>
              ) : null}
            </div>
          }
        />
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background lg:grid lg:grid-cols-[26rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:rounded-xl lg:border">
        <div
          ref={radarDeskRef}
          className={cn(
            "min-h-0 bg-[#070b14]",
            radarFull ? "fixed inset-0 z-[70]" : "absolute inset-0 lg:relative lg:order-2 lg:h-full",
          )}
        >
          <StormMap
            pins={pins}
            showRadar={showWeather}
            showHail={showHail}
            showOutlook={showOutlook}
            showWarnings={showWarnings}
            showPins={showProjects}
            crew={liveCrew}
            showCrew={showCrew}
            selectedStaffId={selectedStaffId}
            onSelectCrew={selectCrew}
            focusId={jobId}
            outlooks={stormLayers?.outlooks}
            alerts={stormLayers?.alerts}
            reports={stormLayers?.reports}
            liveStorms={stormLayers?.hailSwaths}
            swathReady={stormLayers != null && !swathError}
            swathNote={swathCaption(stormLayers, swathError)}
            embedded
            fullscreen={radarFull}
            radarSite={radarSite}
            onToggleFullscreen={() => (radarFull ? leaveRadar() : enterRadar())}
            onPopupChange={(open) => {
              popupOpen.current = open;
            }}
            onLayer={(layer, next) => {
              if (layer === "radar") setShowWeather(next);
              else if (layer === "warnings") setShowWarnings(next);
              else if (layer === "hail") setShowHail(next);
              else if (layer === "pins") setShowProjects(next);
              else setShowOutlook(next);
            }}
            fitTo="pins"
            fitKey={`${year}|${query}|${stages.join(",")}|${showProjects}|${showCrew}|${showHail}|${pins.length}|${liveCrew.length}`}
            onLogVisit={(id) => logVisit(crm, id)}
          />
          {radarFull ? null : (
          <div className="absolute top-3 right-3 z-10 hidden items-center gap-2 lg:flex">
            <Button
              type="button"
              variant={showCrew ? "default" : "outline"}
              className={cn("shadow-sm", !showCrew && "bg-background")}
              aria-pressed={showCrew}
              onClick={() => setShowCrew((value) => !value)}
            >
              Crew
            </Button>
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
          )}
          {radarFull ? null : (
          <div className="pointer-events-none absolute bottom-24 left-52 z-10 hidden lg:block">
            <Legend />
          </div>
          )}
          {selectedJob && !radarFull ? (
            <div
              className={cn(
                "absolute right-3 z-20",
                listOpen ? "bottom-[calc(58%+0.75rem)] lg:bottom-20" : "bottom-[12.5rem] lg:bottom-20",
              )}
            >
              <SelectedJobCard
                job={selectedJob}
                stage={workPinLabel(selectedJob, selectedOpportunity)}
                stageColor={workPinColor(selectedJob, selectedOpportunity)}
                phone={selectedPhone}
                onOpen={() => openJobRecord(selectedJob.id)}
                onClose={clearJob}
              />
            </div>
          ) : null}
          {geocoding || needGeocode.length ? radarFull ? null : (
            <p className={cn("pointer-events-none absolute left-3 z-10 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm", showWeather ? "bottom-56 lg:bottom-36" : "bottom-36 lg:bottom-32")}>
              {geocoding ? "Mapping sites…" : `${needGeocode.length} still looking up`}
            </p>
          ) : null}
        </div>

        {radarFull ? null : (
        <div className="absolute top-3 right-3 left-3 z-20 lg:hidden">
          <MapSearchBar variant="overlay" {...searchProps} />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" className="bg-[#e11d48] text-white shadow-sm hover:bg-[#be123c]" onClick={enterRadar}>
              <Maximize2 data-icon="inline-start" />
              Full screen
            </Button>
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
        )}

        <aside
          className={cn(
            "absolute inset-x-0 bottom-0 z-20 flex min-h-0 flex-col overflow-hidden rounded-t-2xl border-t bg-background shadow-[0_-8px_28px_rgba(0,0,0,0.12)] transition-[height] lg:static lg:order-1 lg:h-full lg:rounded-none lg:border-t-0 lg:border-r lg:shadow-none",
            listOpen ? "h-[58%]" : "h-[11.5rem]",
          )}
        >
          <button
            type="button"
            className="flex w-full shrink-0 flex-col items-center pt-2 lg:hidden"
            onClick={() => setListOpen((value) => !value)}
            aria-expanded={listOpen}
          >
            <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
            <span className="sr-only">{listOpen ? "Collapse job list" : "Expand job list"}</span>
          </button>
          <div className="hidden shrink-0 border-b p-3 lg:block">
            <MapSearchBar variant="dock" {...searchProps} />
          </div>
          <div className="flex shrink-0 gap-4 border-b px-3">
            <button
              type="button"
              className={cn("border-b-2 py-2 text-sm", listTab === "jobs" ? "border-[#181818] font-semibold" : "border-transparent text-muted-foreground")}
              aria-pressed={listTab === "jobs"}
              onClick={() => setListTab("jobs")}
            >
              Jobs
            </button>
            <button
              type="button"
              className={cn("border-b-2 py-2 text-sm", listTab === "warnings" ? "border-[#181818] font-semibold" : "border-transparent text-muted-foreground")}
              aria-pressed={listTab === "warnings"}
              onClick={() => {
                setListTab("warnings");
                setListOpen(true);
              }}
            >
              Warnings{watchWarningCount ? ` · ${watchWarningCount}` : ""}
            </button>
          </div>
          {listTab === "jobs" ? (
          <div className="shrink-0 px-3 pt-2 pb-2">
            <MapListToolbar count={listedJobs.length} sort={sort} onSort={setSort} />
          </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3" role="region" aria-label={listTab === "warnings" ? "Warnings" : "Jobs"}>
            {listTab === "warnings" ? (
              <MapAlertList
                alerts={stormLayers?.alerts ?? []}
                jobs={pins.map((pin) => ({ id: pin.id, title: pin.customer || pin.name, address: pin.address, lat: pin.lat, lng: pin.lng }))}
                onSelectJob={(id) => {
                  selectJob(id);
                  setListOpen(false);
                }}
              />
            ) : (
            <MapJobResultList
              jobs={listedJobs}
              opportunities={crm.opportunities}
              selectedJobId={jobId}
              notes={alertNotes}
              onSelect={(id) => {
                selectJob(id);
                setListOpen(false);
              }}
            />
            )}
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
          </div>
        </aside>
      </div>
      {recordJob ? <JobRecordWindow key={recordJob.id} job={recordJob} onClose={closeJobRecord} /> : null}
    </div>
  );
}

function SelectedJobCard({
  job,
  stage,
  stageColor,
  phone,
  onOpen,
  onClose,
}: {
  job: Job;
  stage: string;
  stageColor: string;
  phone: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  const address = jobAddress(job);
  const raw = job.startDate || job.geocodedAt || job.substantialCompletion || "";
  const dateLabel = raw && formatDateShort(raw) !== "—" ? formatDateShort(raw) : "";
  const tel = phone.replace(/[^\d+]/g, "");
  return (
    <div className="w-[min(19rem,calc(100vw-1.5rem))] rounded-xl border bg-background p-3 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-[#181818]">{job.name.trim() || address || "Untitled"}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close job details"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-sm text-[#706e6b]">{address || "No site yet"}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs">
          <span className="size-2 shrink-0 rounded-full" style={{ background: stageColor }} />
          <span className="truncate font-medium">{stage}</span>
          {job.code ? <span className="truncate font-mono text-[#706e6b]">{job.code}</span> : null}
        </span>
        {dateLabel ? <span className="shrink-0 text-xs text-[#706e6b]">{dateLabel}</span> : null}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button onClick={onOpen}>Open job</Button>
        {address ? (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            Directions
          </a>
        ) : null}
        {tel ? (
          <a
            href={`tel:${tel}`}
            aria-label={`Call ${phone}`}
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <Phone />
          </a>
        ) : null}
      </div>
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
  const items: WorkColumn[] = ["lead", "supplementing", "proposal_sent", "in_progress", "complete"];
  return (
    <div className="pointer-events-none rounded-full border bg-background/95 px-3 py-1.5 shadow-sm">
      <ul className="flex items-center gap-x-3 text-[11px] whitespace-nowrap text-[#706e6b]">
        {items.map((column) => (
          <li key={column} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: pinColor(column) }} />
            {WORK_COLUMN_LABELS[column]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function swathCaption(layers: StormLayers | null, error: string) {
  if (!layers) return error || "Reading the NOAA hail grid…";
  if (error && !layers.hailSwaths?.length) return error;
  if (!layers.hailSwaths?.length) return "No penny-size hail in the last 24 hours.";
  if (layers.swathValid && !Number.isNaN(Date.parse(layers.swathValid))) {
    return `NOAA MRMS · last 24 hours · through ${formatChicagoClock(layers.swathValid)}`;
  }
  return "NOAA MRMS · last 24 hours";
}

function mapPins(crm: ReturnType<typeof useCrm>, jobs: Job[]): StormJobPin[] {
  return jobs.filter(jobHasCoords).map((job) => {
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

async function logVisit(crm: ReturnType<typeof useCrm>, jobId: string) {
  await crm.addActivity({
    entityType: "job",
    entityId: jobId,
    type: "site_walk",
    body: "Site visit logged from the map.",
  });
  toast.success("Visit logged.");
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

