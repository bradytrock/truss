"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fieldMapCenter, type FieldOrigin } from "@/lib/field-home";
import { GEO_WATCH_COARSE, GEO_WATCH_PRECISE } from "@/lib/project-map-logic";

/**
 * Map for the current-job card. The camera is the device location only.
 * Job coordinates are not accepted, so a site across town cannot fill this frame.
 */
export function FieldHereMap({ onPosition }: { onPosition: (origin: FieldOrigin | null) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const movedRef = useRef(false);
  const [status, setStatus] = useState<"pending" | "ready" | "denied" | "unavailable">(() => {
    if (typeof window === "undefined") return "pending";
    if (!window.matchMedia("(max-width: 767px)").matches) return "unavailable";
    if (!navigator.geolocation) return "unavailable";
    return "pending";
  });
  const [here, setHere] = useState<FieldOrigin | null>(null);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    if (!navigator.geolocation) return;
    let watchId: number | null = null;
    let stopped = false;
    const start = (options: PositionOptions, fallback: PositionOptions | null) => {
      if (stopped) return;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const next = { lat: position.coords.latitude, lng: position.coords.longitude };
          const center = fieldMapCenter(next);
          if (!center) return;
          setHere(center);
          setStatus("ready");
          onPosition(center);
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            setStatus("denied");
            onPosition(null);
            return;
          }
          if (fallback) {
            start(fallback, null);
            return;
          }
          setStatus("unavailable");
          onPosition(null);
        },
        options,
      );
    };
    start(GEO_WATCH_PRECISE, GEO_WATCH_COARSE);
    return () => {
      stopped = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, [onPosition]);

  useEffect(() => {
    const center = fieldMapCenter(here);
    if (!center || !el.current) return;
    if (!mapRef.current) {
      const map = L.map(el.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
      }).setView([center.lat, center.lng], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      map.on("dragstart", () => {
        movedRef.current = true;
      });
      markerRef.current = L.circleMarker([center.lat, center.lng], {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: "#2f6fed",
        fillOpacity: 1,
      }).addTo(map);
      mapRef.current = map;
      const timer = window.setTimeout(() => map.invalidateSize(), 80);
      return () => window.clearTimeout(timer);
    }
    markerRef.current?.setLatLng([center.lat, center.lng]);
    if (!movedRef.current) mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom());
    return undefined;
  }, [here]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  const center = fieldMapCenter(here);
  return (
    <div className="absolute inset-0" data-field-center={center ? `${center.lat},${center.lng}` : ""}>
      <div ref={el} className={center ? "field-here-map h-full w-full" : "hidden"} />
      {status !== "ready" ? (
        <p className="absolute inset-0 grid place-items-center bg-[#141416] px-6 text-center text-sm text-white/70">
          {status === "pending"
            ? "Finding where you are…"
            : status === "denied"
              ? "Location is off. Allow it to see where you are, not a job site."
              : "This phone has no location, so the map is not using a job address."}
        </p>
      ) : null}
    </div>
  );
}
