"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  PROJECT_MAP_CENTER,
  clusterJobPins,
  crewMapLabel,
  type CrewFreshness,
} from "@/lib/project-map";
import {
  RADAR_ATTRIBUTION,
  RADAR_EMPTY_TILE,
  RADAR_LEGEND,
  RADAR_MAX_NATIVE_ZOOM,
  RADAR_OPACITY,
  radarFrames,
} from "@/lib/weather-radar";

export type ProjectMapJobPin = {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
  address: string;
  homeowner: string;
  projectManager: string;
};

export type ProjectMapCrewPin = {
  staffId: string;
  name: string;
  lat: number;
  lng: number;
  freshness: CrewFreshness;
  updatedLabel: string;
};

export function ProjectMapCanvas({
  jobs,
  crew,
  selectedJobId,
  selectedStaffId,
  showProjects,
  showCrew,
  showWeather,
  fitKey,
  onSelectJob,
  onOpenJob,
  onSelectCrew,
}: {
  jobs: ProjectMapJobPin[];
  crew: ProjectMapCrewPin[];
  selectedJobId?: string | null;
  selectedStaffId?: string | null;
  showProjects: boolean;
  showCrew: boolean;
  showWeather: boolean;
  fitKey: string;
  onSelectJob: (id: string) => void;
  onOpenJob: (id: string) => void;
  onSelectCrew: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const fitKeyRef = useRef<string | null>(null);
  const focusRef = useRef<string | null>(null);
  const onJob = useRef(onSelectJob);
  const onOpen = useRef(onOpenJob);
  const onCrew = useRef(onSelectCrew);
  onJob.current = onSelectJob;
  onOpen.current = onOpenJob;
  onCrew.current = onSelectCrew;
  const [zoom, setZoom] = useState(8);
  const [radarLabel, setRadarLabel] = useState("Now");
  const [radarSession, setRadarSession] = useState(showWeather);
  if (radarSession !== showWeather) {
    setRadarSession(showWeather);
    setRadarLabel("Now");
  }

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = L.map(el.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([PROJECT_MAP_CENTER.lat, PROJECT_MAP_CENTER.lng], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    const radarPane = map.createPane("radar");
    radarPane.style.zIndex = "350";
    radarPane.style.pointerEvents = "none";
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);
    const resize = () => map.invalidateSize();
    const timer = window.setTimeout(resize, 80);
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
      map.off("zoomend", onZoom);
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layersRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const points: L.LatLngExpression[] = [];
    const selectedPin = selectedJobId ? jobs.find((job) => job.id === selectedJobId) : undefined;

    if (showProjects) {
      const clusters = clusterJobPins(jobs, zoom);
      for (const cluster of clusters) {
        const members = jobs.filter((job) => cluster.jobIds.includes(job.id));
        const count = members.length;
        if (count > 1) {
          const selected = Boolean(selectedJobId && cluster.jobIds.includes(selectedJobId));
          const icon = L.divIcon({
            className: "project-map-cluster",
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            html: `<button type="button" class="project-map-cluster-btn${selected ? " is-selected" : ""}" aria-label="${count} jobs">${count}</button>`,
          });
          const marker = L.marker([cluster.lat, cluster.lng], { icon, zIndexOffset: selected ? 500 : 200 });
          marker.on("click", () => {
            const bounds = L.latLngBounds(members.map((job) => [job.lat, job.lng] as L.LatLngTuple));
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
          });
          marker.addTo(group);
          points.push([cluster.lat, cluster.lng]);
          continue;
        }
        const job = members[0];
        if (!job) continue;
        const selected = job.id === selectedJobId;
        const icon = L.divIcon({
          className: "project-map-pin",
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          html: `<button type="button" aria-label="${escapeAttr(job.code || job.name)}" style="width:18px;height:18px;border-radius:999px;border:${selected ? "3px solid #181818" : "2px solid #fff"};background:${job.color};box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer"></button>`,
        });
        const marker = L.marker([job.lat, job.lng], { icon, zIndexOffset: selected ? 400 : 100 });
        const popup = jobPopup(job, () => onOpen.current(job.id));
        marker.bindPopup(popup, {
          closeButton: true,
          maxWidth: 280,
          className: "project-map-popup-wrap",
          offset: [0, -4],
        });
        marker.on("click", () => onJob.current(job.id));
        marker.addTo(group);
        if (selected) marker.openPopup();
        points.push([job.lat, job.lng]);
      }
    }

    if (showCrew) {
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
        marker.on("click", () => onCrew.current(person.staffId));
        marker.bindTooltip(`${person.name} · ${person.updatedLabel}`, { direction: "top", offset: [0, -14] });
        marker.addTo(group);
        points.push([person.lat, person.lng]);
      }
    }

    if (fitKeyRef.current !== fitKey) {
      fitKeyRef.current = fitKey;
      if (points.length) {
        map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 12, animate: false });
      } else {
        map.setView([PROJECT_MAP_CENTER.lat, PROJECT_MAP_CENTER.lng], 8, { animate: false });
      }
    } else if (selectedPin && focusRef.current !== selectedPin.id) {
      focusRef.current = selectedPin.id;
      map.flyTo([selectedPin.lat, selectedPin.lng], Math.max(map.getZoom(), 14), { duration: 0.4 });
    }
    if (!selectedJobId) focusRef.current = null;
  }, [jobs, crew, showProjects, showCrew, selectedJobId, selectedStaffId, fitKey, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showWeather) return;
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frames = motionOk ? radarFrames() : radarFrames().slice(-1);
    const layers = frames.map((frame, index) => {
      const layer = L.tileLayer(frame.url, {
        pane: "radar",
        opacity: index === frames.length - 1 ? RADAR_OPACITY : 0,
        maxZoom: 19,
        maxNativeZoom: RADAR_MAX_NATIVE_ZOOM,
        errorTileUrl: RADAR_EMPTY_TILE,
        ...(index === frames.length - 1 ? { attribution: RADAR_ATTRIBUTION } : {}),
      });
      layer.addTo(map);
      return layer;
    });
    let index = frames.length - 1;
    let timer = 0;
    const tick = () => {
      const hold = frames[index]?.holdMs ?? 800;
      timer = window.setTimeout(() => {
        const next = (index + 1) % frames.length;
        layers[index]?.setOpacity(0);
        layers[next]?.setOpacity(RADAR_OPACITY);
        index = next;
        setRadarLabel(frames[index]?.label ?? "Now");
        tick();
      }, hold);
    };
    if (frames.length > 1) tick();
    return () => {
      window.clearTimeout(timer);
      for (const layer of layers) map.removeLayer(layer);
    };
  }, [showWeather]);

  return (
    <div className="relative h-full min-h-[280px] w-full">
      <div ref={el} className="project-map-leaflet h-full min-h-[280px] w-full" />
      {showWeather ? (
        <div className="pointer-events-none absolute bottom-36 left-3 z-10 rounded-lg border border-[#c9c9c9] bg-background/95 px-3 py-2 text-xs shadow-sm lg:bottom-3">
          <p className="font-medium text-[#181818]">Radar · {radarLabel ?? "Loading"}</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[#706e6b]">
            {RADAR_LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-1">
                <span className="size-2.5 rounded-sm border border-black/15" style={{ background: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function jobPopup(job: ProjectMapJobPin, onOpen: () => void) {
  const root = document.createElement("div");
  root.className = "project-map-popup";
  const row = (label: string, value: string) =>
    `<div class="project-map-popup-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`;
  root.innerHTML = `
    <p class="project-map-popup-code">${escapeHtml(job.code || "Job")}</p>
    <p class="project-map-popup-title">${escapeHtml(job.name || job.address || "Untitled")}</p>
    ${row("Address", job.address || "No site yet")}
    ${row("Homeowner", job.homeowner || "No homeowner")}
    ${row("Project manager", job.projectManager || "Unassigned")}
    <button type="button" class="project-map-popup-open">Open job</button>
  `;
  const button = root.querySelector("button");
  button?.addEventListener("click", (event) => {
    L.DomEvent.stop(event);
    onOpen();
  });
  L.DomEvent.disableClickPropagation(root);
  return root;
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
  return escapeHtml(value).replace(/\n/g, " ");
}
