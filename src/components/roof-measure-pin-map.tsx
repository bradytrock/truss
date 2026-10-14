"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const PIN_HTML = `<svg width="28" height="36" viewBox="0 0 28 36" aria-hidden="true">
  <path d="M14 34C14 34 3 21.2 3 13a11 11 0 1 1 22 0C25 21.2 14 34 14 34z" fill="#7f1d1d" stroke="#fff" stroke-width="2"/>
  <circle cx="14" cy="13" r="4" fill="#fff"/>
</svg>`;

export function RoofMeasurePinMap({
  lat,
  lng,
  onMove,
}: {
  lat: number;
  lng: number;
  onMove: (next: { lat: number; lng: number }) => void;
}) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const map = L.map(node, {
      zoomControl: true,
      attributionControl: true,
    }).setView([lat, lng], 18);
    L.tileLayer(IMAGERY, {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19,
      maxNativeZoom: 19,
    }).addTo(map);
    const marker = L.marker([lat, lng], {
      draggable: true,
      zIndexOffset: 500,
      icon: L.divIcon({
        className: "roof-measure-pin",
        iconSize: [28, 36],
        iconAnchor: [14, 34],
        html: PIN_HTML,
      }),
    }).addTo(map);

    const publish = (next: L.LatLng) => {
      onMove({ lat: next.lat, lng: next.lng });
    };
    marker.on("dragend", () => publish(marker.getLatLng()));
    map.on("click", (event: L.LeafletMouseEvent) => {
      marker.setLatLng(event.latlng);
      publish(event.latlng);
    });

    const resize = () => map.invalidateSize();
    const timer = window.setTimeout(resize, 60);
    const later = window.setTimeout(resize, 280);
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(later);
      observer.disconnect();
      map.remove();
    };
  }, [lat, lng, onMove]);

  return (
    <div
      ref={el}
      className="project-map-leaflet h-full min-h-72 w-full cursor-crosshair"
      role="application"
      aria-label="Satellite photo. Click the roof or drag the pin onto the house."
    />
  );
}
