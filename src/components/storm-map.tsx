"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { StormCellPopup } from "@/components/storm-popup/cell-popup";
import { HailPointPopup, type CanvassPin } from "@/components/storm-popup/hail-point-popup";
import { JobPinPopup, type CrewOnSite, type StormJobPin } from "@/components/storm-popup/job-pin-popup";
import { RadarCellPopup } from "@/components/storm-popup/radar-popup";
import { StormReportPopup } from "@/components/storm-popup/report-popup";
import { PopupPill, type PopupArrow } from "@/components/storm-popup/shell";
import { WarningPopup } from "@/components/storm-popup/warning-popup";
import { clusterJobPins, crewMapLabel, PROJECT_MAP_CENTER, type CrewFreshness } from "@/lib/project-map";
import { loadRadarCell } from "@/lib/weather/client";
import { alertDrawRank, alertKind, alertPaint } from "@/lib/weather/alerts";
import { cellGrowthNote, cellKind, cellMoving, projectCell, snapshotCell, type CellSnapshot } from "@/lib/weather/cells";
import { geometryBBox, milesBetween, pointInGeometry } from "@/lib/weather/geometry";
import { HAIL_BINS, hailBin } from "@/lib/weather/hail";
import { hailReports, jobsWithin, nearestReportTo, warningsAt } from "@/lib/weather/overlays";
import type { OutlookArea, OutlookProduct, StormCell, StormReport, WeatherAlert } from "@/lib/weather/types";
import { RadarDeskChrome, type RadarAlertCard } from "@/components/radar-desk-chrome";
import {
  formatChicagoShortClock,
  formatChipDate,
  formatHailInches,
  hailAtPoint,
  hoverReadout,
  popupPanDelta,
  toPopupHit,
  type HailPopupHit,
} from "@/lib/weather/hail-point";
import type { HailStorm } from "@/lib/weather/sample-storms";
import { RADAR_ATTRIBUTION, RADAR_EMPTY_TILE, RADAR_MAX_NATIVE_ZOOM, RADAR_OPACITY, radarFrames } from "@/lib/weather-radar";

const STAGE_LEGEND = [
  { label: "Lead", color: "#3b6fd4" },
  { label: "Supplementing", color: "#0f766e" },
  { label: "Proposal sent", color: "#c47b2b" },
  { label: "In progress", color: "#1f7a4d" },
  { label: "Complete", color: "#4b5563" },
] as const;

const PAD_TOP = 112;
const PAD_BOTTOM = 72;
const POPUP_GAP = 14;
const FLASH_MS = 3000;
const FORECAST_MINUTES = [15, 30, 45] as const;

type MapCrewMarker = {
  staffId: string;
  name: string;
  lat: number;
  lng: number;
  freshness: CrewFreshness;
  updatedLabel: string;
};

const NO_STORMS: HailStorm[] = [];
const NO_OUTLOOKS: OutlookArea[] = [];
const NO_ALERTS: WeatherAlert[] = [];
const NO_REPORTS: StormReport[] = [];
const NO_CELLS: StormCell[] = [];
const NO_CREW: MapCrewMarker[] = [];
const NO_SITES: Record<string, CrewOnSite> = {};

type OpenPopup =
  | { kind: "loading"; lat: number; lng: number }
  | { kind: "error"; lat: number; lng: number; message: string }
  | { kind: "hail"; lat: number; lng: number; hits: HailPopupHit[] }
  | { kind: "job"; id: string }
  | { kind: "radar"; lat: number; lng: number; dbz: number; site: string; scanAt: string }
  | { kind: "cell"; id: string }
  | { kind: "warning"; id: string; lat: number; lng: number }
  | { kind: "report"; id: string };

type Placement = { left: number; top: number; arrow: PopupArrow };

type Flash = { text: string; coords: string; tone: "clear" | "note" };

const OUTLOOK_NAME: Record<OutlookProduct, string> = {
  hail: "Hail",
  sigHail: "Sig. hail",
  wind: "Wind",
  tornado: "Tornado",
};

export function StormMap({
  pins,
  showRadar,
  focusId,
  rotation,
  onDropLead,
  onOpenJob,
  onWarnCrew,
  onNotifyWarning,
  onAttachHail,
  outlooks = NO_OUTLOOKS,
  alerts = NO_ALERTS,
  reports = NO_REPORTS,
  cells = NO_CELLS,
  showHail = true,
  showOutlook = false,
  showWarnings = true,
  showPins = true,
  showCells = true,
  crew = NO_CREW,
  crewSites = NO_SITES,
  showCrew = false,
  selectedStaffId = null,
  onSelectCrew,
  canNotify = false,
  embedded = false,
  fitTo = "storms",
  fitKey = "",
  liveStorms,
  swathNote = "",
  swathReady = false,
  fullscreen = false,
  onToggleFullscreen,
  onLayer,
  onPopupChange,
  radarSite = "NEXRAD",
}: {
  pins: StormJobPin[];
  showRadar: boolean;
  focusId?: string | null;
  rotation?: { url: string; bounds: { west: number; south: number; east: number; north: number } } | null;
  onDropLead: (lat: number, lng: number) => Promise<void>;
  onOpenJob: (jobId: string) => void;
  /** Office text to the crew that is out on a roof right now. */
  onWarnCrew: () => Promise<void>;
  /** Office text to everyone with a job inside the warning polygon. */
  onNotifyWarning: (alertId: string) => Promise<void>;
  /** Save the radar hail estimate on the job as a claim note. */
  onAttachHail: (jobId: string, hit: HailPopupHit) => Promise<void>;
  outlooks?: OutlookArea[];
  alerts?: WeatherAlert[];
  reports?: StormReport[];
  /** Latest NEXRAD storm cells. Tags, forecast points, and job-card threats come from these. */
  cells?: StormCell[];
  showHail?: boolean;
  showOutlook?: boolean;
  /** County watches and warning polygons. Independent of the SPC outlook. */
  showWarnings?: boolean;
  showPins?: boolean;
  showCells?: boolean;
  crew?: MapCrewMarker[];
  /** Jobs with a crew phone checked in on site, by job id. */
  crewSites?: Record<string, CrewOnSite>;
  showCrew?: boolean;
  selectedStaffId?: string | null;
  onSelectCrew?: (id: string) => void;
  canNotify?: boolean;
  /** Field map: no "Storm Map" title, fit to jobs instead of swaths. */
  embedded?: boolean;
  fitTo?: "storms" | "pins";
  fitKey?: string;
  /** NOAA MRMS polygons for the jobs on screen. Sample storms are never drawn. */
  liveStorms?: HailStorm[];
  swathNote?: string;
  swathReady?: boolean;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onLayer?: (layer: "radar" | "warnings" | "hail" | "pins" | "outlook" | "cells", next: boolean) => void;
  onPopupChange?: (open: boolean) => void;
  radarSite?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const ignoreUntil = useRef(0);
  const moveAt = useRef(0);
  const showRadarRef = useRef(showRadar);
  const showHailRef = useRef(showHail);
  const showWarningsRef = useRef(showWarnings);
  const fitToRef = useRef(fitTo);
  const embeddedRef = useRef(embedded);
  const onSelectCrewRef = useRef(onSelectCrew);
  const hiddenRef = useRef<string[]>([]);
  const stormsRef = useRef<HailStorm[]>([]);
  const alertsRef = useRef<WeatherAlert[]>([]);
  const pinsRef = useRef<StormJobPin[]>([]);
  const swathReadyRef = useRef(swathReady);
  const onPopupChangeRef = useRef(onPopupChange);
  const lookupRef = useRef<(lat: number, lng: number) => void>(() => undefined);
  const radarFramesMemo = useMemo(() => radarFrames(), []);
  const [frameIndex, setFrameIndex] = useState(radarFramesMemo.length - 1);
  const [radarPlaying, setRadarPlaying] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const frameIndexRef = useRef(frameIndex);
  const [hidden, setHidden] = useState<string[]>([]);
  const [zoom, setZoom] = useState(9);
  const [hover, setHover] = useState<{ text: string; coords: string } | null>(null);
  const [popup, setPopup] = useState<OpenPopup | null>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [dropping, setDropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [watched, setWatched] = useState<Record<string, CellSnapshot>>({});
  const watchedRef = useRef(watched);
  const lookupToken = useRef(0);
  const storms = liveStorms ?? NO_STORMS;
  const hiddenSet = new Set(hidden);
  const anchor = useMemo(() => {
    if (!popup) return null;
    if (popup.kind === "job") return pinPoint(pins, popup.id);
    if (popup.kind === "cell") {
      const cell = cells.find((item) => cellKey(item) === popup.id);
      return cell ? { lat: cell.lat, lng: cell.lng } : null;
    }
    if (popup.kind === "report") {
      const report = reports.find((item) => item.id === popup.id);
      return report ? { lat: report.lat, lng: report.lng } : null;
    }
    return { lat: popup.lat, lng: popup.lng };
  }, [cells, pins, popup, reports]);
  const anchorKey = anchor ? `${anchor.lat.toFixed(5)},${anchor.lng.toFixed(5)}` : "";
  const placeRef = useRef<() => void>(() => undefined);
  const pannedKey = useRef("");
  const fittedSource = useRef("");
  const fittedFocus = useRef<string | null>(null);
  const fitKeyRef = useRef<string | null>(null);
  const anchorRef = useRef(anchor);

  function arm() {
    ignoreUntil.current = Date.now() + 450;
  }

  const lookupHail = useCallback((lat: number, lng: number) => {
    return hailAtPoint(stormsRef.current, lat, lng, {
      jobs: pinsRef.current.map((pin) => ({ lat: pin.lat, lng: pin.lng })),
    }).map(toPopupHit);
  }, []);

  const warningsHere = useCallback((lat: number, lng: number) => {
    return warningsAt(alertsRef.current, (alert) => pointInGeometry(lng, lat, alert.geometry));
  }, []);

  const lookup = useCallback(
    async (lat: number, lng: number) => {
      const coords = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      if (showWarningsRef.current) {
        const warning = warningsHere(lat, lng)[0];
        if (warning) {
          setPopup({ kind: "warning", id: warning.id, lat, lng });
          return;
        }
      }
      const wantHail = showHailRef.current;
      const wantRadar = showRadarRef.current;
      if (!wantHail && !wantRadar) return;
      if (wantHail && !swathReadyRef.current && !wantRadar) {
        setFlash({ text: "The NOAA hail grid is still loading.", coords, tone: "note" });
        return;
      }
      const token = ++lookupToken.current;
      const hits = wantHail && swathReadyRef.current ? lookupHail(lat, lng) : [];
      const hiddenNow = new Set(hiddenRef.current);
      const visible = hits.some((hit) => !hiddenNow.has(hit.stormId));
      const covered = hits.some((hit) => hiddenNow.has(hit.stormId));
      if (visible || covered) {
        setPopup({ kind: "hail", lat, lng, hits });
        return;
      }
      if (!wantRadar) {
        setPopup(null);
        setFlash({ text: "No hail here", coords, tone: "clear" });
        return;
      }
      setPopup({ kind: "loading", lat, lng });
      const zoomNow = mapRef.current?.getZoom() ?? 8;
      const sampledAt = new Date().toISOString();
      const radar = await loadRadarCell(lat, lng, zoomNow).catch(() => null);
      if (token !== lookupToken.current) return;
      if (radar?.active && radar.dbz != null) {
        setPopup({ kind: "radar", lat, lng, dbz: radar.dbz, site: radar.radarSite || "KFWS", scanAt: sampledAt });
        return;
      }
      setPopup(null);
      setFlash({
        text: wantHail && !swathReadyRef.current ? "No precip here · hail grid still loading" : wantHail ? "No precip or hail here" : "No precip here",
        coords,
        tone: "clear",
      });
    },
    [lookupHail, warningsHere],
  );

  useLayoutEffect(() => {
    showRadarRef.current = showRadar;
    showHailRef.current = showHail;
    showWarningsRef.current = showWarnings;
    fitToRef.current = fitTo;
    embeddedRef.current = embedded;
    onSelectCrewRef.current = onSelectCrew;
    onPopupChangeRef.current = onPopupChange;
    frameIndexRef.current = frameIndex;
    hiddenRef.current = hidden;
    stormsRef.current = storms;
    alertsRef.current = alerts;
    pinsRef.current = pins;
    swathReadyRef.current = swathReady;
    anchorRef.current = anchor;
    lookupRef.current = lookup;
    watchedRef.current = watched;
    placeRef.current = () => {
      const map = mapRef.current;
      const node = popupRef.current;
      const current = anchorRef.current;
      if (!map || !current) return;
      const point = map.latLngToContainerPoint([current.lat, current.lng]);
      const size = map.getSize();
      const width = node?.offsetWidth ?? Math.min(300, size.x - 48);
      const height = node?.offsetHeight ?? 400;
      let left = point.x - width / 2;
      let top = point.y - height - POPUP_GAP;
      let side: PopupArrow["side"] = "bottom";
      if (top < PAD_TOP) {
        top = point.y + POPUP_GAP;
        side = "top";
      }
      left = Math.max(12, Math.min(left, size.x - width - 12));
      const arrowLeft = Math.max(16, Math.min(point.x - left, width - 16));
      const next: Placement = { left: Math.round(left), top: Math.round(top), arrow: { side, left: Math.round(arrowLeft) } };
      setPos((currentPos) =>
        currentPos && currentPos.left === next.left && currentPos.top === next.top && currentPos.arrow.side === next.arrow.side && currentPos.arrow.left === next.arrow.left
          ? currentPos
          : next,
      );
    };
  }, [alerts, anchor, embedded, fitTo, frameIndex, hidden, lookup, onPopupChange, onSelectCrew, pins, showHail, showRadar, showWarnings, storms, swathReady, watched]);

  useEffect(() => {
    onPopupChangeRef.current?.(Boolean(popup));
  }, [popup]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(
      fitToRef.current === "pins" ? [PROJECT_MAP_CENTER.lat, PROJECT_MAP_CENTER.lng] : [32.9, -97.15],
      fitToRef.current === "pins" ? 8 : 9,
    );
    L.control.zoom({ position: embeddedRef.current ? "bottomright" : "topright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    const swathPane = map.createPane("swath");
    swathPane.style.zIndex = "340";
    swathPane.style.pointerEvents = "none";
    const outlookPane = map.createPane("outlook");
    outlookPane.style.zIndex = "345";
    outlookPane.style.pointerEvents = "none";
    const alertPane = map.createPane("alerts");
    alertPane.style.zIndex = "360";
    alertPane.style.pointerEvents = "none";
    const radarPane = map.createPane("radar");
    radarPane.style.zIndex = "350";
    radarPane.style.pointerEvents = "none";
    const cellPane = map.createPane("cells");
    cellPane.style.zIndex = "420";
    mapRef.current = map;
    const onZoom = () => setZoom(map.getZoom());
    const onMove = () => placeRef.current();
    const onClick = (event: L.LeafletMouseEvent) => {
      if (Date.now() < ignoreUntil.current) return;
      const target = event.originalEvent.target;
      if (target instanceof Node && popupRef.current?.contains(target)) return;
      lookupRef.current(event.latlng.lat, event.latlng.lng);
    };
    const onHover = (event: L.LeafletMouseEvent) => {
      const now = Date.now();
      if (now - moveAt.current < 90) return;
      moveAt.current = now;
      const visibleStorms = stormsRef.current.filter((storm) => !hiddenRef.current.includes(storm.id));
      const hits = hailAtPoint(visibleStorms, event.latlng.lat, event.latlng.lng);
      const text = hoverReadout(hits);
      const coords = `${event.latlng.lat.toFixed(4)}, ${event.latlng.lng.toFixed(4)}`;
      setHover((current) => (current && current.text === text && current.coords === coords ? current : { text, coords }));
    };
    map.on("zoomend", onZoom);
    map.on("move", onMove);
    map.on("click", onClick);
    map.on("mousemove", onHover);
    const initial = stormsRef.current.flatMap((storm) => storm.track.map((pair) => [pair[1], pair[0]] as L.LatLngTuple));
    if (fitToRef.current === "storms" && initial.length) map.fitBounds(L.latLngBounds(initial), { padding: [64, 64], maxZoom: 10, animate: false });
    const resize = () => map.invalidateSize();
    const timer = window.setTimeout(resize, 80);
    const observed = el.current;
    const observer = new ResizeObserver(resize);
    if (observed) observer.observe(observed);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitTo !== "storms" || fittedSource.current === "live") return;
    const points = storms.flatMap((storm) => storm.track.map((pair) => [pair[1], pair[0]] as L.LatLngTuple));
    if (!points.length) return;
    fittedSource.current = "live";
    map.fitBounds(L.latLngBounds(points), { padding: [64, 64], maxZoom: 10, animate: false });
  }, [fitTo, storms]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showHail) return;
    const group = L.layerGroup().addTo(map);
    const features = storms
      .filter((storm) => !hidden.includes(storm.id))
      .flatMap((storm) =>
        [...storm.bands]
          .sort((a, b) => a.sizeIn - b.sizeIn)
          .map((band) => ({
            type: "Feature" as const,
            properties: { sizeIn: band.sizeIn },
            geometry: band.geometry,
          })),
      );
    if (features.length) {
      const collection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
      L.geoJSON(collection, {
        pane: "swath",
        interactive: false,
        style: (feature) => {
          const size = Number(feature?.properties?.sizeIn);
          const color = hailBin(size)?.color ?? "#dc2626";
          return { color, weight: 1, opacity: 0.85, fillColor: color, fillOpacity: 0.5 };
        },
      }).addTo(group);
    }
    return () => {
      map.removeLayer(group);
    };
  }, [showHail, storms, hidden]);

  const warnedPinIds = useMemo(() => {
    const ids = new Set<string>();
    if (!showWarnings) return ids;
    const warnings = alerts.filter((alert) => alert.geometry && (alert.kind ?? alertKind(alert.event)) === "warning");
    if (!warnings.length) return ids;
    for (const pin of pins) {
      if (warnings.some((alert) => pointInGeometry(pin.lng, pin.lat, alert.geometry))) ids.add(pin.id);
    }
    return ids;
  }, [alerts, pins, showWarnings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showPins) return;
    const group = L.layerGroup().addTo(map);
    const pinBorder = "#181818";
    const clusters = clusterJobPins(
      pins.map((pin) => ({ id: pin.id, lat: pin.lat, lng: pin.lng })),
      zoom,
    );
    for (const cluster of clusters) {
      const members = pins.filter((pin) => cluster.jobIds.includes(pin.id));
      if (members.length > 1) {
        const warnedCount = members.filter((pin) => warnedPinIds.has(pin.id)).length;
        const icon = L.divIcon({
          className: "project-map-cluster",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          html: `<button type="button" class="project-map-cluster-btn${warnedCount ? " is-warned" : ""}" aria-label="${members.length} jobs${warnedCount ? `, ${warnedCount} in a warning` : ""}">${members.length}</button>`,
        });
        const marker = L.marker([cluster.lat, cluster.lng], { icon, zIndexOffset: 200 });
        marker.on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          ignoreUntil.current = Date.now() + 450;
          const bounds = L.latLngBounds(members.map((pin) => [pin.lat, pin.lng] as L.LatLngTuple));
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
        });
        marker.addTo(group);
        continue;
      }
      const pin = members[0];
      if (!pin) continue;
      const selected = popup?.kind === "job" && popup.id === pin.id;
      const warned = warnedPinIds.has(pin.id);
      const icon = L.divIcon({
        className: `project-map-pin${warned ? " is-warned" : ""}`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        html: `<button type="button" aria-label="${escapeAttr(pin.customer || pin.code || pin.name)}${warned ? " (in a warning)" : ""}" class="project-map-pin-btn" style="border:${selected ? `3px solid ${pinBorder}` : "2px solid #fff"};background:${pin.color}"></button>`,
      });
      const marker = L.marker([pin.lat, pin.lng], { icon, zIndexOffset: selected ? 400 : 100 });
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        ignoreUntil.current = Date.now() + 450;
        setPopup({ kind: "job", id: pin.id });
      });
      marker.addTo(group);
    }
    return () => {
      map.removeLayer(group);
    };
  }, [pins, popup, showPins, warnedPinIds, zoom]);

  const rotationUrl = rotation?.url ?? null;
  const rotationSouth = rotation?.bounds.south;
  const rotationWest = rotation?.bounds.west;
  const rotationNorth = rotation?.bounds.north;
  const rotationEast = rotation?.bounds.east;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rotationUrl || rotationSouth == null || rotationWest == null || rotationNorth == null || rotationEast == null) return;
    const layer = L.imageOverlay(rotationUrl, [[rotationSouth, rotationWest], [rotationNorth, rotationEast]], {
      pane: "swath",
      opacity: 0.7,
      interactive: false,
    }).addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [rotationEast, rotationNorth, rotationSouth, rotationUrl, rotationWest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showOutlook) return;
    const group = L.layerGroup().addTo(map);
    if (outlooks.length) {
      const collection: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: outlooks.map((area) => ({
          type: "Feature",
          properties: area,
          geometry: area.geometry,
        })),
      };
      L.geoJSON(collection, {
        pane: "outlook",
        interactive: false,
        style: (feature) => {
          const area = feature?.properties as OutlookArea | undefined;
          return {
            color: area?.stroke || "#92400e",
            weight: area?.product === "sigHail" ? 2 : 1.5,
            fillColor: area?.fill || "#f59e0b",
            fillOpacity: area?.product === "sigHail" ? 0.22 : 0.16,
            dashArray: area?.product === "sigHail" ? "4 3" : undefined,
          };
        },
      }).addTo(group);
    }
    for (const report of reports) {
      if (report.kind === "hail") continue;
      L.circleMarker([report.lat, report.lng], {
        radius: 4,
        color: "#181818",
        weight: 1,
        fillColor: report.kind === "tornado" ? "#7f1d1d" : "#2563eb",
        fillOpacity: 0.9,
        interactive: false,
      }).addTo(group);
    }
    return () => {
      map.removeLayer(group);
    };
  }, [outlooks, reports, showOutlook]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !(showHail || showOutlook)) return;
    const group = L.layerGroup().addTo(map);
    for (const report of hailReports(reports)) {
      const selected = popup?.kind === "report" && popup.id === report.id;
      const icon = L.divIcon({
        className: "storm-report",
        iconSize: [18, 18],
        iconAnchor: [9, 12],
        html: `<button type="button" class="storm-report-btn${selected ? " is-selected" : ""}" aria-label="${escapeAttr(`Hail report ${report.inches?.toFixed(2) ?? ""} in${report.city ? ` near ${report.city}` : ""}`)}"><span class="storm-report-tri"></span></button>`,
      });
      const marker = L.marker([report.lat, report.lng], { icon, zIndexOffset: selected ? 450 : 150 });
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        ignoreUntil.current = Date.now() + 450;
        setPopup({ kind: "report", id: report.id });
      });
      marker.addTo(group);
    }
    return () => {
      map.removeLayer(group);
    };
  }, [popup, reports, showHail, showOutlook]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showCells || !cells.length) return;
    const group = L.layerGroup().addTo(map);
    const towns = pins.filter((pin) => pin.city.trim());
    for (const cell of cells) {
      const key = cellKey(cell);
      const kind = cellKind(cell);
      const selected = popup?.kind === "cell" && popup.id === key;
      if (cellMoving(cell)) {
        const path = [L.latLng(cell.lat, cell.lng), ...FORECAST_MINUTES.map((minutes) => {
          const point = projectCell(cell, minutes);
          return L.latLng(point.lat, point.lng);
        })];
        L.polyline(path, { pane: "cells", color: "#ffffff", weight: 1.5, opacity: 0.7, dashArray: "4 5", interactive: false }).addTo(group);
        for (const minutes of FORECAST_MINUTES) {
          const point = projectCell(cell, minutes);
          const at = formatChicagoShortClock(new Date(Date.parse(cell.valid) + minutes * 60_000).toISOString());
          const near = nearestTown(towns, point.lat, point.lng);
          const dot = L.circleMarker([point.lat, point.lng], {
            pane: "cells",
            radius: 4,
            color: "#ffffff",
            weight: 1.5,
            fillColor: "#171a21",
            fillOpacity: 1,
          });
          dot.bindTooltip(
            `<span class="storm-forecast-line">${escapeHtml(cell.id)} · +${minutes} min · ${escapeHtml(at)}</span><span class="storm-forecast-sub">${near ? `Near ${escapeHtml(near)} · ` : ""}cone ±3 mi</span>`,
            { direction: "top", offset: [0, -6], className: "storm-forecast-tip", opacity: 1 },
          );
          dot.on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            ignoreUntil.current = Date.now() + 450;
            dot.openTooltip();
          });
          dot.addTo(group);
        }
      }
      const icon = L.divIcon({
        className: "storm-cell",
        iconSize: [34, 22],
        iconAnchor: [17, 11],
        html: `<button type="button" class="storm-cell-tag${kind === "supercell" ? " is-rotating" : kind === "multicell" ? " is-hail" : ""}${selected ? " is-selected" : ""}" aria-label="${escapeAttr(`Storm cell ${cell.id}`)}">${escapeHtml(cell.id)}</button>`,
      });
      const marker = L.marker([cell.lat, cell.lng], { icon, zIndexOffset: selected ? 700 : 500 });
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        ignoreUntil.current = Date.now() + 450;
        setPopup({ kind: "cell", id: key });
      });
      marker.addTo(group);
    }
    return () => {
      map.removeLayer(group);
    };
  }, [cells, pins, popup, showCells]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showWarnings) return;
    const group = L.layerGroup().addTo(map);
    const features = alerts
      .flatMap((alert) => (alert.geometry ? [{ type: "Feature" as const, properties: alert, geometry: alert.geometry }] : []))
      .sort((a, b) => alertDrawRank(a.properties) - alertDrawRank(b.properties));
    if (features.length) {
      const warnings: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
      L.geoJSON(warnings, {
        pane: "alerts",
        interactive: false,
        style: (feature) => {
          const alert = feature?.properties as WeatherAlert | undefined;
          const paint = alertPaint(alert ?? { event: "" });
          const selected = popup?.kind === "warning" && popup.id === alert?.id;
          return {
            color: paint.stroke,
            weight: selected ? paint.weight + 1.5 : paint.weight,
            opacity: 0.95,
            fillColor: paint.fill,
            fillOpacity: selected ? Math.min(0.6, paint.fillOpacity + 0.12) : paint.fillOpacity,
            dashArray: paint.dash,
          };
        },
      }).addTo(group);
    }
    return () => {
      map.removeLayer(group);
    };
  }, [alerts, popup, showWarnings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showCrew || !crew.length) return;
    const group = L.layerGroup().addTo(map);
    for (const person of crew) {
      const selected = person.staffId === selectedStaffId;
      const live = person.freshness === "live";
      const label = crewMapLabel(person.name);
      const width = Math.min(168, Math.max(72, label.length * 8 + 28));
      const icon = L.divIcon({
        className: "project-map-crew",
        iconSize: [width, 28],
        iconAnchor: [width / 2, 14],
        html: `<button type="button" class="project-map-crew-pill${live ? " is-live" : ""}${selected ? " is-selected" : ""}" aria-label="${escapeAttr(person.name)}">${escapeHtml(label)}</button>`,
      });
      const marker = L.marker([person.lat, person.lng], { icon, zIndexOffset: selected ? 800 : 600 });
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        ignoreUntil.current = Date.now() + 450;
        onSelectCrewRef.current?.(person.staffId);
      });
      marker.bindTooltip(`${person.name} · ${person.updatedLabel}`, { direction: "top", offset: [0, -14] });
      marker.addTo(group);
    }
    return () => {
      map.removeLayer(group);
    };
  }, [crew, selectedStaffId, showCrew]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitTo !== "pins") return;
    if (fitKeyRef.current === fitKey) return;
    fitKeyRef.current = fitKey;
    const points: L.LatLngTuple[] = [];
    if (showPins) {
      for (const pin of pins) points.push([pin.lat, pin.lng]);
    }
    if (showCrew) {
      for (const person of crew) points.push([person.lat, person.lng]);
    }
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 12, animate: false });
    else map.setView([PROJECT_MAP_CENTER.lat, PROJECT_MAP_CENTER.lng], 8, { animate: false });
  }, [crew, fitKey, fitTo, pins, showCrew, showPins]);

  const radarLayers = useRef<L.TileLayer[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showRadar) return;
    const layers = radarFramesMemo.map((frame, index) => {
      const layer = L.tileLayer(frame.url, {
        pane: "radar",
        opacity: 0,
        maxZoom: 19,
        maxNativeZoom: RADAR_MAX_NATIVE_ZOOM,
        errorTileUrl: RADAR_EMPTY_TILE,
        ...(index === radarFramesMemo.length - 1 ? { attribution: RADAR_ATTRIBUTION } : {}),
      });
      layer.addTo(map);
      return layer;
    });
    radarLayers.current = layers;
    const shown = Math.min(frameIndexRef.current, layers.length - 1);
    layers[shown]?.setOpacity(RADAR_OPACITY);
    return () => {
      radarLayers.current = [];
      for (const layer of layers) map.removeLayer(layer);
    };
  }, [radarFramesMemo, showRadar]);

  useEffect(() => {
    const layers = radarLayers.current;
    if (!showRadar || !layers.length) return;
    const shown = Math.min(frameIndex, layers.length - 1);
    layers.forEach((layer, index) => layer.setOpacity(index === shown ? RADAR_OPACITY : 0));
  }, [frameIndex, showRadar]);

  useEffect(() => {
    if (!showRadar || !radarPlaying) return;
    const hold = radarFramesMemo[frameIndex]?.holdMs ?? 800;
    const timer = window.setTimeout(() => {
      setFrameIndex((current) => (current + 1) % radarFramesMemo.length);
    }, hold);
    return () => window.clearTimeout(timer);
  }, [frameIndex, radarFramesMemo, radarPlaying, showRadar]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = window.setTimeout(() => map.invalidateSize(), 60);
    return () => window.clearTimeout(timer);
  }, [fullscreen]);

  useLayoutEffect(() => {
    const map = mapRef.current;
    const node = popupRef.current;
    const current = anchorRef.current;
    const key = popup && current ? `${popup.kind}:${anchorKey}` : "";
    if (!map || !node || !current || !key) return;
    if (pannedKey.current !== key && popup?.kind !== "loading") {
      pannedKey.current = key;
      const point = map.latLngToContainerPoint([current.lat, current.lng]);
      const size = map.getSize();
      const delta = popupPanDelta({
        x: point.x,
        y: point.y,
        mapWidth: size.x,
        mapHeight: size.y,
        popupWidth: node.offsetWidth,
        popupHeight: node.offsetHeight,
        padTop: PAD_TOP,
        padBottom: PAD_BOTTOM,
        padX: 16,
      });
      if (delta.x || delta.y) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        map.panBy([delta.x, delta.y], { animate: !reduce });
      }
    }
    placeRef.current();
    const observer = new ResizeObserver(() => placeRef.current());
    observer.observe(node);
    return () => observer.disconnect();
  }, [popup, anchorKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPopup(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!focusId) {
      fittedFocus.current = null;
      return;
    }
    const pin = pins.find((item) => item.id === focusId);
    if (!map || !pin || fittedFocus.current === focusId) return;
    fittedFocus.current = focusId;
    map.flyTo([pin.lat, pin.lng], Math.max(map.getZoom(), fitTo === "pins" ? 14 : 12), { duration: 0.45 });
  }, [fitTo, focusId, pins]);

  useEffect(() => {
    const saved = watchedRef.current;
    const keys = Object.keys(saved);
    if (!keys.length || !cells.length) return;
    let changed = false;
    const next = { ...saved };
    for (const key of keys) {
      const cell = cells.find((item) => cellKey(item) === key);
      const before = saved[key];
      if (!cell || !before) continue;
      const note = cellGrowthNote(before, cell);
      if (note) {
        toast.warning(note);
        next[key] = snapshotCell(cell);
        changed = true;
      }
    }
    if (changed) setWatched(next);
  }, [cells]);

  const toggleWatch = useCallback((cell: StormCell | null) => {
    if (!cell) {
      toast.message("No storm cell is tracked near this point yet.");
      return;
    }
    const key = cellKey(cell);
    setWatched((current) => {
      if (current[key]) {
        const { [key]: _gone, ...rest } = current;
        void _gone;
        return rest;
      }
      return { ...current, [key]: snapshotCell(cell) };
    });
    if (!watchedRef.current[key]) toast.message(`Watching cell ${cell.id}. You'll get a note here if it grows.`);
  }, []);

  const alertCards = useMemo(() => {
    const cards: RadarAlertCard[] = [];
    for (const alert of alerts) {
      if (!alert.geometry) continue;
      const kind = alert.kind ?? alertKind(alert.event);
      if (kind === "statement") continue;
      const jobs = pins
        .filter((pin) => pointInGeometry(pin.lng, pin.lat, alert.geometry))
        .map((pin) => pin.customer || pin.name);
      cards.push({ id: alert.id, event: alert.event, until: alert.until, area: alert.areaDesc, jobs });
    }
    cards.sort((a, b) => alertDrawRank({ event: a.event }) - alertDrawRank({ event: b.event }));
    return cards;
  }, [alerts, pins]);

  const focusAlert = useCallback((id: string) => {
    const map = mapRef.current;
    const alert = alerts.find((item) => item.id === id);
    if (!map || !alert?.geometry) return;
    const box = geometryBBox(alert.geometry);
    if (!box) return;
    map.fitBounds(
      [
        [box.south, box.west],
        [box.north, box.east],
      ],
      { padding: [48, 48], maxZoom: 10 },
    );
  }, [alerts]);

  const run = useCallback((task: () => Promise<void>, then?: () => void) => {
    setBusy(true);
    void task()
      .then(() => then?.())
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }, []);

  const job = popup?.kind === "job" ? pins.find((pin) => pin.id === popup.id) : undefined;
  const openCell = popup?.kind === "cell" ? cells.find((cell) => cellKey(cell) === popup.id) : undefined;
  const openWarning = popup?.kind === "warning" ? alerts.find((alert) => alert.id === popup.id) : undefined;
  const openReport = popup?.kind === "report" ? reports.find((report) => report.id === popup.id) : undefined;
  const ordered = [...storms].sort((a, b) => b.stormDate.localeCompare(a.stormDate));
  const outlookRows = outlookLegend(outlooks);
  const desk = embedded || fullscreen;
  const hailDock = fullscreen ? "top-16 left-48" : "top-[22rem] left-3 lg:top-3 lg:left-48";
  const crewJobIds = useMemo(() => new Set(Object.keys(crewSites)), [crewSites]);
  const arrow = pos?.arrow ?? null;

  return (
    <div className={`relative h-full min-h-0 w-full ${embedded && !fullscreen ? "" : "bg-[#0e1116] text-white"}`}>
      <div ref={el} className={`project-map-leaflet h-full min-h-0 w-full ${embedded && !fullscreen ? "" : "storm-map-leaflet"}`} />
      {desk && onToggleFullscreen && onLayer ? (
        <RadarDeskChrome
          fullscreen={fullscreen}
          onToggleFullscreen={onToggleFullscreen}
          showRadar={showRadar}
          showWarnings={showWarnings}
          showHail={showHail}
          showPins={showPins}
          showOutlook={showOutlook}
          showCells={showCells}
          cellCount={cells.length}
          onLayer={onLayer}
          frames={radarFramesMemo}
          frameIndex={frameIndex}
          playing={radarPlaying}
          onSelectFrame={(index) => {
            setRadarPlaying(false);
            setFrameIndex(index);
          }}
          onTogglePlaying={() => setRadarPlaying((current) => !current)}
          radarSite={radarSite}
          alertCards={alertCards}
          onSelectAlert={focusAlert}
        />
      ) : null}
      {showHail || (showOutlook && outlookRows.length) ? (
        <div className={`pointer-events-none absolute z-20 max-w-[16rem] ${desk ? hailDock : "top-3 left-3"}`}>
          {embedded ? null : (
            <>
              <p className="text-sm font-semibold">Storm Map</p>
              <p className="text-[10px] tracking-wide text-white/60 uppercase">Hail · last 90 days</p>
            </>
          )}
          <div className={`rounded-lg px-3 py-2 text-xs shadow-lg ${desk ? "bg-[#121826]/95 text-white" : "mt-3 bg-[#1a1d24]/95 text-white"}`}>
            {showHail ? (
              <>
                <p className="font-medium">Hail swath · last 24 hours</p>
                <ul className="mt-1.5 space-y-1 text-white/75">
                  {HAIL_BINS.map((bin) => (
                    <li key={bin.label} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-sm" style={{ background: bin.color }} />
                      <span>
                        {bin.label} {formatHailInches(bin.inches)}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2">
                    <span className="storm-report-tri is-legend" />
                    <span>Spotter hail report</span>
                  </li>
                </ul>
                {swathNote ? <p className="mt-2 text-white/45">{swathNote}</p> : null}
              </>
            ) : null}
            {showOutlook && outlookRows.length ? (
              <>
                <p className="mt-2 font-medium">SPC outlook</p>
                <ul className="mt-1.5 space-y-1 text-white/75">
                  {outlookRows.map((area) => (
                    <li key={`${area.day}-${area.product}`} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-sm border border-black/20" style={{ background: area.fill }} />
                      <span>
                        Day {area.day} {OUTLOOK_NAME[area.product]}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {showHail ? (
      <div className={`pointer-events-auto absolute left-1/2 z-20 flex -translate-x-1/2 gap-1.5 overflow-x-auto ${desk ? "top-44 max-w-[calc(100%-2rem)] lg:top-14 lg:max-w-[calc(100%-28rem)]" : "top-3 max-w-[calc(100%-12rem)]"}`}>
        {ordered.map((storm) => {
          const bin = hailBin(storm.stormMaxIn);
          const off = hidden.includes(storm.id);
          return (
            <button
              key={storm.id}
              type="button"
              aria-pressed={!off}
              onClick={() => setHidden((current) => (current.includes(storm.id) ? current.filter((id) => id !== storm.id) : [...current, storm.id]))}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              style={{ background: bin?.color ?? "#52525b", opacity: off ? 0.4 : 1 }}
            >
              {storm.source === "mesh"
                ? `${formatHailInches(storm.stormMaxIn)} 24h max`
                : `${formatHailInches(storm.stormMaxIn)} ${formatChipDate(storm.stormDate)} ${bin?.label}`}
            </button>
          );
        })}
      </div>
      ) : null}
      {embedded || !showHail ? null : (
        <div className="pointer-events-none absolute top-14 right-14 z-20 hidden text-right text-xs text-white/70 sm:block">
          <p>Click anywhere inside a swath</p>
          {swathNote ? <p className="mt-1 text-white/45">{swathNote}</p> : null}
        </div>
      )}
      {showHail ? (
      <div className={`pointer-events-none absolute z-20 max-w-[calc(100%-1.5rem)] rounded-full bg-[#121826]/95 px-3 py-1.5 text-xs text-white shadow-lg ${desk ? (fullscreen ? "bottom-16 left-48" : "bottom-[16.5rem] left-3 lg:bottom-16 lg:left-48") : "bottom-3 left-3"}`} aria-live="polite">
        <span className="text-white/85">{hover?.text ?? "No hail here"}</span>
        {hover ? <span className="ml-2 text-white/50">{hover.coords}</span> : null}
      </div>
      ) : null}
      {embedded ? null : (
      <ul className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-3 rounded-full bg-[#1a1d24]/95 px-3 py-1.5 text-[11px] text-white/80">
        {STAGE_LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="size-2 rounded-full" style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
      )}
      {flash ? (
        <div className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 ${desk ? (fullscreen ? "bottom-24" : "bottom-[18.5rem] lg:bottom-24") : "bottom-14"}`}>
          <PopupPill live icon={flash.tone === "clear" ? <Check className="size-3.5" /> : undefined}>
            <span className="font-medium">{flash.text}</span>
            <span className="ml-2 font-mono text-white/55">{flash.coords}</span>
          </PopupPill>
        </div>
      ) : null}
      {popup && anchor ? (
        <div ref={popupRef} className="absolute z-30" style={{ left: pos?.left ?? 16, top: pos?.top ?? 120, visibility: pos ? "visible" : "hidden" }}>
          {popup.kind === "loading" ? (
            <PopupPill spinning live>
              Looking up radar & hail…
            </PopupPill>
          ) : null}
          {popup.kind === "job" && job ? (
            <JobPinPopup
              key={job.id}
              pin={job}
              warnings={showWarnings ? warningsHere(job.lat, job.lng) : []}
              cells={showCells ? cells : NO_CELLS}
              hits={lookupHail(job.lat, job.lng)}
              crewOnSite={crewSites[job.id] ?? null}
              arrow={arrow}
              busy={busy}
              onClose={() => setPopup(null)}
              onInteract={arm}
              onOpenJob={() => onOpenJob(job.id)}
              onWarnCrew={() => run(onWarnCrew)}
              onAttachHail={(hit) => run(() => onAttachHail(job.id, hit), () => setPopup(null))}
            />
          ) : null}
          {popup.kind === "cell" && openCell ? (
            <StormCellPopup
              key={popup.id}
              cell={openCell}
              jobs={pins}
              crewJobIds={crewJobIds}
              watching={Boolean(watched[popup.id])}
              arrow={arrow}
              busy={busy}
              onClose={() => setPopup(null)}
              onInteract={arm}
              onWarnCrew={() => run(onWarnCrew)}
              onWatch={() => toggleWatch(openCell)}
            />
          ) : null}
          {popup.kind === "warning" && openWarning ? (
            <WarningPopup
              key={popup.id}
              alert={openWarning}
              jobsInside={pins.filter((pin) => pointInGeometry(pin.lng, pin.lat, openWarning.geometry))}
              canNotify={canNotify}
              arrow={arrow}
              busy={busy}
              onClose={() => setPopup(null)}
              onInteract={arm}
              onNotify={() => run(() => onNotifyWarning(openWarning.id))}
              onOpenJob={(id) => setPopup({ kind: "job", id })}
            />
          ) : null}
          {popup.kind === "report" && openReport ? (
            <StormReportPopup key={popup.id} report={openReport} arrow={arrow} onClose={() => setPopup(null)} onInteract={arm} />
          ) : null}
          {popup.kind === "radar" ? (
            <RadarCellPopup
              lat={popup.lat}
              lng={popup.lng}
              dbz={popup.dbz}
              radarSite={popup.site}
              scanAt={popup.scanAt}
              cells={showCells ? cells : NO_CELLS}
              hits={showHail ? lookupHail(popup.lat, popup.lng) : []}
              warnings={showWarnings ? warningsHere(popup.lat, popup.lng) : []}
              watching={Boolean(nearestWatched(cells, popup.lat, popup.lng, watched))}
              dropping={dropping}
              arrow={arrow}
              onClose={() => setPopup(null)}
              onInteract={arm}
              onWatch={toggleWatch}
              onDropLead={() => {
                setDropping(true);
                void onDropLead(popup.lat, popup.lng)
                  .then(() => setPopup(null))
                  .catch(() => undefined)
                  .finally(() => setDropping(false));
              }}
            />
          ) : null}
          {popup.kind === "error" || popup.kind === "hail" ? (
            <HailPointPopup
              lat={popup.lat}
              lng={popup.lng}
              status={popup.kind === "hail" ? "ready" : "error"}
              message={popup.kind === "error" ? popup.message : ""}
              hits={popup.kind === "hail" ? popup.hits : []}
              hiddenIds={hiddenSet}
              nearestReportMi={nearestReportMiles(reports, storms, popup.lat, popup.lng)}
              nearbyPins={canvassPins(pins, popup.lat, popup.lng)}
              dropping={dropping}
              arrow={arrow}
              onRetry={() => void lookup(popup.lat, popup.lng)}
              onClose={() => setPopup(null)}
              onInteract={arm}
              onDropLead={() => {
                setDropping(true);
                void onDropLead(popup.lat, popup.lng)
                  .then(() => setPopup(null))
                  .catch(() => undefined)
                  .finally(() => setDropping(false));
              }}
              onOpenJob={(id) => setPopup({ kind: "job", id })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function cellKey(cell: StormCell) {
  return `${cell.radarSite}:${cell.id}`;
}

function pinPoint(pins: StormJobPin[], id: string) {
  const pin = pins.find((item) => item.id === id);
  return pin ? { lat: pin.lat, lng: pin.lng } : null;
}

function nearestWatched(cells: StormCell[], lat: number, lng: number, watched: Record<string, CellSnapshot>) {
  let best: { key: string; miles: number } | null = null;
  for (const cell of cells) {
    const miles = milesBetween(cell, { lat, lng });
    if (!best || miles < best.miles) best = { key: cellKey(cell), miles };
  }
  return best ? watched[best.key] ?? null : null;
}

function nearestTown(pins: StormJobPin[], lat: number, lng: number) {
  let best: { city: string; miles: number } | null = null;
  for (const pin of pins) {
    const miles = milesBetween(pin, { lat, lng });
    if (miles <= 10 && (!best || miles < best.miles)) best = { city: pin.city.trim(), miles };
  }
  return best?.city ?? "";
}

/** Closest spotter hail report: the LSR feed first, then the report pinned on a swath. */
function nearestReportMiles(reports: StormReport[], storms: HailStorm[], lat: number, lng: number) {
  let best = nearestReportTo(reports, lat, lng)?.miles ?? null;
  for (const storm of storms) {
    if (!storm.report) continue;
    const miles = milesBetween({ lat, lng }, storm.report);
    if (best == null || miles < best) best = miles;
  }
  return best;
}

function canvassPins(pins: StormJobPin[], lat: number, lng: number): CanvassPin[] {
  return jobsWithin(pins, lat, lng, 1).map(({ job, miles }) => ({
    id: job.id,
    code: job.code,
    name: job.customer || job.name,
    address: job.address,
    color: job.color,
    miles,
  }));
}

function outlookLegend(areas: OutlookArea[]) {
  const seen = new Map<string, OutlookArea>();
  for (const area of areas) {
    const key = `${area.day}-${area.product}`;
    if (!seen.has(key)) seen.set(key, area);
  }
  return [...seen.values()];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function escapeAttr(value: string) {
  return escapeHtml(value);
}
