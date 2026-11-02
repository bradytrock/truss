"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { HailPointPopup, type CanvassPin } from "@/components/storm-popup/hail-point-popup";
import { JobPinPopup, type StormJobPin } from "@/components/storm-popup/job-pin-popup";
import { RadarCellPopup } from "@/components/storm-popup/radar-popup";
import { clusterJobPins, crewMapLabel, PROJECT_MAP_CENTER, type CrewFreshness } from "@/lib/project-map";
import { loadRadarCell } from "@/lib/weather/client";
import { alertDrawRank, alertKind, alertPaint } from "@/lib/weather/alerts";
import { geometryBBox, pointInGeometry } from "@/lib/weather/geometry";
import { HAIL_BINS, hailBin } from "@/lib/weather/hail";
import type { OutlookArea, OutlookProduct, StormReport, WeatherAlert } from "@/lib/weather/types";
import { RadarDeskChrome, type RadarAlertCard } from "@/components/radar-desk-chrome";
import {
  formatChipDate,
  formatHailInches,
  hailAtPoint,
  hoverReadout,
  outerBand,
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
const NO_CREW: MapCrewMarker[] = [];

type OpenPopup =
  | { kind: "loading"; lat: number; lng: number }
  | { kind: "error"; lat: number; lng: number; message: string }
  | { kind: "hail"; lat: number; lng: number; hits: HailPopupHit[] }
  | { kind: "job"; id: string }
  | { kind: "radar"; lat: number; lng: number; dbz: number; site: string; hailChance: string };

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
  onLogVisit,
  outlooks = NO_OUTLOOKS,
  alerts = NO_ALERTS,
  reports = NO_REPORTS,
  showHail = true,
  showOutlook = false,
  showWarnings = true,
  showPins = true,
  crew = NO_CREW,
  showCrew = false,
  selectedStaffId = null,
  onSelectCrew,
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
  onLogVisit: (jobId: string) => Promise<void>;
  outlooks?: OutlookArea[];
  alerts?: WeatherAlert[];
  reports?: StormReport[];
  showHail?: boolean;
  showOutlook?: boolean;
  /** County watches and warning polygons. Independent of the SPC outlook. */
  showWarnings?: boolean;
  showPins?: boolean;
  crew?: MapCrewMarker[];
  showCrew?: boolean;
  selectedStaffId?: string | null;
  onSelectCrew?: (id: string) => void;
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
  onLayer?: (layer: "radar" | "warnings" | "hail" | "pins" | "outlook", next: boolean) => void;
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
  const fitToRef = useRef(fitTo);
  const embeddedRef = useRef(embedded);
  const onSelectCrewRef = useRef(onSelectCrew);
  const hiddenRef = useRef<string[]>([]);
  const stormsRef = useRef<HailStorm[]>([]);
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
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [logging, setLogging] = useState(false);
  const storms = liveStorms ?? NO_STORMS;
  const hiddenSet = new Set(hidden);
  const anchor = useMemo(() => {
    if (!popup) return null;
    if (popup.kind === "job") return pinPoint(pins, popup.id);
    return { lat: popup.lat, lng: popup.lng };
  }, [pins, popup]);
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

  const lookup = useCallback(async (lat: number, lng: number) => {
    if (!showHailRef.current) return;
    if (!swathReadyRef.current) {
      setPopup({ kind: "error", lat, lng, message: "The NOAA hail grid is still loading." });
      return;
    }
    setPopup({ kind: "loading", lat, lng });
    const zoomNow = mapRef.current?.getZoom() ?? 8;
    const hits = lookupHail(lat, lng);
    const radar = showRadarRef.current ? await loadRadarCell(lat, lng, zoomNow).catch(() => null) : null;
    const hiddenNow = new Set(hiddenRef.current);
    const visible = hits.some((hit) => !hiddenNow.has(hit.stormId));
    const covered = hits.some((hit) => hiddenNow.has(hit.stormId));
    if (visible || covered || !radar?.active || radar.dbz == null) {
      setPopup({ kind: "hail", lat, lng, hits });
      return;
    }
    setPopup({
      kind: "radar",
      lat,
      lng,
      dbz: radar.dbz,
      site: radar.radarSite || "KFWS",
      hailChance: radar.hailChance || "Low",
    });
  }, [lookupHail]);

  useLayoutEffect(() => {
    showRadarRef.current = showRadar;
    showHailRef.current = showHail;
    fitToRef.current = fitTo;
    embeddedRef.current = embedded;
    onSelectCrewRef.current = onSelectCrew;
    onPopupChangeRef.current = onPopupChange;
    frameIndexRef.current = frameIndex;
    hiddenRef.current = hidden;
    stormsRef.current = storms;
    pinsRef.current = pins;
    swathReadyRef.current = swathReady;
    anchorRef.current = anchor;
    lookupRef.current = lookup;
    placeRef.current = () => {
      const map = mapRef.current;
      const node = popupRef.current;
      const current = anchorRef.current;
      if (!map || !current) return;
      const point = map.latLngToContainerPoint([current.lat, current.lng]);
      const size = map.getSize();
      const width = node?.offsetWidth ?? Math.min(320, size.x - 48);
      const height = node?.offsetHeight ?? 420;
      let left = point.x - width / 2;
      let top = point.y - height - 14;
      if (top < PAD_TOP) top = point.y + 14;
      left = Math.max(12, Math.min(left, size.x - width - 12));
      const next = { left: Math.round(left), top: Math.round(top) };
      setPos((currentPos) => (currentPos && currentPos.left === next.left && currentPos.top === next.top ? currentPos : next));
    };
  }, [anchor, embedded, fitTo, frameIndex, hidden, lookup, onPopupChange, onSelectCrew, pins, showHail, showRadar, storms, swathReady]);

  useEffect(() => {
    onPopupChangeRef.current?.(Boolean(popup));
  }, [popup]);

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
        const icon = L.divIcon({
          className: "project-map-cluster",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          html: `<button type="button" class="project-map-cluster-btn" aria-label="${members.length} jobs">${members.length}</button>`,
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
      const icon = L.divIcon({
        className: "project-map-pin",
        iconSize: [18, 18],
        iconAnchor: [9, 9],
          html: `<button type="button" aria-label="${escapeAttr(pin.code || pin.name)}" style="width:18px;height:18px;border-radius:999px;border:${selected ? `3px solid ${pinBorder}` : "2px solid #fff"};background:${pin.color};box-shadow:0 1px 4px rgba(0,0,0,.45);cursor:pointer"></button>`,
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
  }, [pins, popup, showPins, zoom]);

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
      const hail = report.kind === "hail";
      L.circleMarker([report.lat, report.lng], {
        radius: hail ? 5 : 4,
        color: "#181818",
        weight: 1,
        fillColor: hail ? "#7e22ce" : report.kind === "tornado" ? "#7f1d1d" : "#2563eb",
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
          return {
            color: paint.stroke,
            weight: paint.weight,
            opacity: 0.95,
            fillColor: paint.fill,
            fillOpacity: paint.fillOpacity,
            dashArray: paint.dash,
          };
        },
      }).addTo(group);
    }
    return () => {
      map.removeLayer(group);
    };
  }, [alerts, showWarnings]);

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
    if (pannedKey.current !== key) {
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

  const job = popup?.kind === "job" ? pins.find((pin) => pin.id === popup.id) : undefined;
  const ordered = [...storms].sort((a, b) => b.stormDate.localeCompare(a.stormDate));
  const outlookRows = outlookLegend(outlooks);
  const desk = embedded || fullscreen;
  const hailDock = fullscreen ? "top-16 left-48" : "top-[22rem] left-3 lg:top-3 lg:left-48";

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
      {popup && anchor ? (
        <div ref={popupRef} className="absolute z-30" style={{ left: pos?.left ?? 16, top: pos?.top ?? 120 }}>
          {popup.kind === "job" && job ? (
            <JobPinPopup
              key={job.id}
              pin={job}
              logging={logging}
              onClose={() => setPopup(null)}
              onInteract={arm}
              onLogVisit={() => {
                setLogging(true);
                void onLogVisit(job.id)
                  .catch(() => undefined)
                  .finally(() => setLogging(false));
              }}
              lookupHail={lookupHail}
            />
          ) : null}
          {popup.kind === "radar" ? (
            <RadarCellPopup
              lat={popup.lat}
              lng={popup.lng}
              dbz={popup.dbz}
              radarSite={popup.site}
              hailChance={popup.hailChance}
              onClose={() => setPopup(null)}
              onInteract={arm}
              onAlert={() => toast.message("We'll watch this cell once radar volumes are wired.")}
            />
          ) : null}
          {popup.kind === "loading" || popup.kind === "error" || popup.kind === "hail" ? (
            <HailPointPopup
              lat={popup.lat}
              lng={popup.lng}
              status={popup.kind === "hail" ? "ready" : popup.kind}
              message={popup.kind === "error" ? popup.message : ""}
              hits={popup.kind === "hail" ? popup.hits : []}
              hiddenIds={hiddenSet}
              dropping={dropping}
              pinsForStorm={(stormId) => canvassPins(storms, pins, stormId)}
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

function pinPoint(pins: StormJobPin[], id: string) {
  const pin = pins.find((item) => item.id === id);
  return pin ? { lat: pin.lat, lng: pin.lng } : null;
}

function canvassPins(storms: HailStorm[], pins: StormJobPin[], stormId: string): CanvassPin[] {
  const storm = storms.find((item) => item.id === stormId);
  if (!storm) return [];
  const outer = outerBand(storm);
  return pins
    .filter((pin) => pointInGeometry(pin.lng, pin.lat, outer.geometry))
    .map((pin) => ({ id: pin.id, code: pin.code, name: pin.name, address: pin.address, color: pin.color }));
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
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}
