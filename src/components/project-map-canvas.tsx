"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { initials } from "@/lib/format";
import {
  PROJECT_MAP_CENTER,
  type CrewFreshness,
} from "@/lib/project-map";

export type ProjectMapJobPin = {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
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
  fitKey,
  onSelectJob,
  onSelectCrew,
}: {
  jobs: ProjectMapJobPin[];
  crew: ProjectMapCrewPin[];
  selectedJobId?: string | null;
  selectedStaffId?: string | null;
  showProjects: boolean;
  showCrew: boolean;
  fitKey: string;
  onSelectJob: (id: string) => void;
  onSelectCrew: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const onJob = useRef(onSelectJob);
  const onCrew = useRef(onSelectCrew);
  onJob.current = onSelectJob;
  onCrew.current = onSelectCrew;

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
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const resize = () => map.invalidateSize();
    const timer = window.setTimeout(resize, 80);
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
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

    if (showProjects) {
      for (const job of jobs) {
        const selected = job.id === selectedJobId;
        const icon = L.divIcon({
          className: "project-map-pin",
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          html: `<button type="button" aria-label="${escapeAttr(job.code || job.name)}" style="width:18px;height:18px;border-radius:999px;border:${selected ? "3px solid #181818" : "2px solid #fff"};background:${job.color};box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer"></button>`,
        });
        const marker = L.marker([job.lat, job.lng], { icon, zIndexOffset: selected ? 400 : 100 });
        marker.on("click", () => onJob.current(job.id));
        marker.bindTooltip(`${job.code || "Job"} · ${job.label}`, { direction: "top", offset: [0, -8] });
        marker.addTo(group);
        points.push([job.lat, job.lng]);
      }
    }

    if (showCrew) {
      for (const person of crew) {
        const selected = person.staffId === selectedStaffId;
        const live = person.freshness === "live";
        const icon = L.divIcon({
          className: "project-map-crew",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          html: `<button type="button" aria-label="${escapeAttr(person.name)}" style="width:32px;height:32px;border-radius:999px;border:${selected ? "3px solid #181818" : "2px solid #fff"};background:${live ? "#111" : "#6b7280"};color:#fff;font:600 11px/1 'IBM Plex Sans',sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 6px rgba(0,0,0,.4);cursor:pointer">${escapeHtml(initials(person.name) || "?")}</button>`,
        });
        const marker = L.marker([person.lat, person.lng], { icon, zIndexOffset: selected ? 800 : 600 });
        marker.on("click", () => onCrew.current(person.staffId));
        marker.bindTooltip(`${person.name} · ${person.updatedLabel}`, { direction: "top", offset: [0, -12] });
        marker.addTo(group);
        points.push([person.lat, person.lng]);
      }
    }

    if (points.length) {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 12, animate: false });
    } else {
      map.setView([PROJECT_MAP_CENTER.lat, PROJECT_MAP_CENTER.lng], 8, { animate: false });
    }
  }, [jobs, crew, showProjects, showCrew, selectedJobId, selectedStaffId, fitKey]);

  return <div ref={el} className="project-map-leaflet h-full min-h-[420px] w-full" />;
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
