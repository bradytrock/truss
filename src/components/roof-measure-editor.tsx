"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MousePointer2,
  Pentagon,
  Redo2,
  Ruler,
  Satellite,
  Undo2,
  Upload,
} from "lucide-react";
import { JobEagleviewPanel } from "@/components/job-eagleview";
import { RoofMeasureVerifyDialog } from "@/components/roof-measure-verify";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCrm } from "@/lib/crm-store";
import { isDeletedJob, jobAddress, jobRecordHref } from "@/lib/job-record";
import { isValidLatLng, jobSiteQuery } from "@/lib/project-map-logic";
import { uploadViaApi } from "@/lib/storage/client-upload";
import { formatCompanyAddress, formatDate } from "@/lib/format";
import { loadLogoForPdf } from "@/lib/letterhead-pdf";
import { downloadRoofMeasurePdf } from "@/lib/roof-measure-pdf";
import {
  loadRemoteRoofReport,
  missingRoofReportsMessage,
  preferRoofReport,
  readLocalRoofReport,
  roofImageSrc,
  saveRemoteRoofReport,
  writeLocalRoofReport,
  type RoofReportStatus,
  type StoredRoofReport,
} from "@/lib/roof-measure-store";
import {
  EDGE_COLORS,
  EDGE_KIND_LABELS,
  EDGE_KINDS,
  PITCH_RISES,
  commitFacet,
  emptyDrawing,
  parseRoofDrawing,
  facetPoints,
  formatFeet,
  formatSquares,
  hitTest,
  measureRoof,
  movePoint,
  nearestPoint,
  pitchLabel,
  polygonCentroid,
  removeFacet,
  setEdgeKind,
  setFacetPitch,
  setFeetPerPixel,
  setWastePercent,
  suggestedWastePercent,
  type EdgeKind,
  type RoofDrawing,
  type RoofHit,
} from "@/lib/roof-measure";
import { cn } from "@/lib/utils";

type Tool = "select" | "facet" | "scale";
type DraftPoint = { x: number; y: number; id?: string };

const TOOLS: Array<{ id: Tool; label: string; icon: typeof MousePointer2 }> = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "facet", label: "Draw facet", icon: Pentagon },
  { id: "scale", label: "Set scale", icon: Ruler },
];

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

function pointerTolerance(svg: SVGSVGElement) {
  const rect = svg.getBoundingClientRect();
  const box = svg.viewBox.baseVal;
  const width = box?.width || rect.width || 1;
  return (14 / Math.max(rect.width, 1)) * width;
}

async function jpegDataUrl(src: string) {
  const response = await fetch(src);
  if (!response.ok) return null;
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const max = 1400;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function RoofMeasureEditor({ jobId }: { jobId: string }) {
  const crm = useCrm();
  const job = crm.getJob(jobId);
  const deleted = job ? isDeletedJob(job) : false;
  const photos = crm.photos.filter((photo) => photo.jobId === jobId && !photo.deletedAt);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawingRef = useRef<RoofDrawing>(emptyDrawing());
  const selectionRef = useRef<RoofHit | null>(null);
  const dragOrigin = useRef<RoofDrawing | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const measureLock = useRef(false);

  const [tool, setTool] = useState<Tool>("facet");
  const [drawing, setDrawing] = useState<RoofDrawing>(emptyDrawing());
  const [past, setPast] = useState<RoofDrawing[]>([]);
  const [future, setFuture] = useState<RoofDrawing[]>([]);
  const [draft, setDraft] = useState<DraftPoint[]>([]);
  const [scaleClicks, setScaleClicks] = useState<Array<{ x: number; y: number }>>([]);
  const [scaleFeet, setScaleFeet] = useState("");
  const [selection, setSelection] = useState<RoofHit | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [status, setStatus] = useState<RoofReportStatus>("draft");
  const [reportId, setReportId] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState("");
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [remoteNote, setRemoteNote] = useState("");
  const [eagleviewOpen, setEagleviewOpen] = useState(false);
  const [wasteInput, setWasteInput] = useState("15");
  const [dirty, setDirty] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifySession, setVerifySession] = useState(0);

  const totals = useMemo(() => measureRoof(drawing), [drawing]);
  const imageSrc = roofImageSrc(imagePath);
  const address = job ? jobAddress(job) : "";
  const lat = Number(job?.lat);
  const lng = Number(job?.lng);
  const canMeasureFromSatellite =
    Boolean(address) || (isValidLatLng(lat, lng) && !(lat === 0 && lng === 0));
  const selectedFacet = selection?.kind === "facet" ? drawing.facets.find((facet) => facet.id === selection.id) : null;
  const selectedEdge = selection?.kind === "edge" ? drawing.edges.find((edge) => edge.id === selection.id) : null;

  function replaceDrawing(next: RoofDrawing, markDirty = false) {
    drawingRef.current = next;
    setDrawing(next);
    if (markDirty) setDirty(true);
  }

  function commit(next: RoofDrawing) {
    if (next === drawingRef.current) return;
    setPast((prev) => [...prev.slice(-49), drawingRef.current]);
    setFuture([]);
    replaceDrawing(next, true);
  }

  function undo() {
    setPast((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      setFuture((items) => [drawingRef.current, ...items]);
      replaceDrawing(last, true);
      setDraft([]);
      setSelection(null);
      return prev.slice(0, -1);
    });
  }

  function redo() {
    setFuture((prev) => {
      const [next, ...rest] = prev;
      if (!next) return prev;
      setPast((items) => [...items.slice(-49), drawingRef.current]);
      replaceDrawing(next, true);
      setDraft([]);
      setSelection(null);
      return rest;
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const local = readLocalRoofReport(jobId);
      const remote = await loadRemoteRoofReport(jobId);
      if (cancelled) return;
      if (!remote.ok && remote.missing) setRemoteNote(missingRoofReportsMessage());
      const picked = preferRoofReport(local, remote.ok ? remote.report : null);
      if (picked) {
        replaceDrawing(picked.drawing);
        setStatus(picked.status);
        setReportId(picked.id);
        setImagePath(picked.imagePath);
        setImageSize({ w: picked.imageWidth, h: picked.imageHeight });
        setWasteInput(String(picked.drawing.wastePercent));
      }
      setLoaded(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    if (!loaded || !dirty) return;
    const report: StoredRoofReport = {
      id: reportId,
      status,
      imagePath,
      imageWidth: imageSize.w,
      imageHeight: imageSize.h,
      drawing,
      updatedAt: new Date().toISOString(),
    };
    writeLocalRoofReport(jobId, report);
  }, [dirty, drawing, imagePath, imageSize.h, imageSize.w, jobId, loaded, reportId, status]);

  const actions = useRef({ undo, redo, commit, deleted });

  useEffect(() => {
    drawingRef.current = drawing;
    selectionRef.current = selection;
    actions.current = { undo, redo, commit, deleted };
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const api = actions.current;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) api.redo();
        else api.undo();
      } else if (event.key === "Escape") {
        setDraft([]);
        setScaleClicks([]);
        setSelection(null);
      } else if ((event.key === "Backspace" || event.key === "Delete") && !api.deleted) {
        const current = drawingRef.current;
        const selected = selectionRef.current;
        if (selected?.kind !== "facet") return;
        event.preventDefault();
        api.commit(removeFacet(current, selected.id));
        setSelection(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function applyImage(path: string) {
    if (drawing.facets.length > 0 && path !== imagePath) {
      const ok = window.confirm("Replace the photo? The drawing stays, but it will sit on the new image.");
      if (!ok) return;
    }
    setImagePath(path);
    setImageSize({ w: 0, h: 0 });
    setDirty(true);
  }

  async function onUpload(file: File | null) {
    if (!file || deleted) return;
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const uploaded = await uploadViaApi("job-files", file, `roof/${jobId}/${crypto.randomUUID()}.${ext}`, file.name);
      applyImage(uploaded.path);
      toast.success("Photo added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload that photo.");
    }
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (deleted || !imageSize.w) return;
    const svg = event.currentTarget;
    const point = svgPoint(svg, event.clientX, event.clientY);
    if (!point) return;
    if (point.x < 0 || point.y < 0 || point.x > imageSize.w || point.y > imageSize.h) return;
    const tolerance = pointerTolerance(svg);
    svg.setPointerCapture(event.pointerId);

    if (tool === "select") {
      const hit = hitTest(drawingRef.current, point.x, point.y, tolerance);
      setSelection(hit);
      if (hit?.kind === "point") {
        dragOrigin.current = drawingRef.current;
        setDraggingId(hit.id);
      }
      return;
    }

    if (tool === "scale") {
      const snapped = nearestPoint(drawingRef.current, point.x, point.y, tolerance);
      const next = snapped ? { x: snapped.x, y: snapped.y } : point;
      setScaleClicks((clicks) => (clicks.length >= 2 ? [next] : [...clicks, next]));
      return;
    }

    const snapped = nearestPoint(drawingRef.current, point.x, point.y, tolerance);
    const draftPoint: DraftPoint = snapped ? { x: snapped.x, y: snapped.y, id: snapped.id } : point;
    if (draft.length >= 3 && Math.hypot(draftPoint.x - draft[0].x, draftPoint.y - draft[0].y) <= tolerance) {
      commit(commitFacet(drawingRef.current, draft));
      setDraft([]);
      setTool("select");
      return;
    }
    if (draft.length > 0) {
      const prev = draft[draft.length - 1];
      if (Math.hypot(draftPoint.x - prev.x, draftPoint.y - prev.y) <= tolerance) return;
    }
    setDraft((points) => [...points, draftPoint]);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!draggingId) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = svgPoint(svg, event.clientX, event.clientY);
    if (!point) return;
    replaceDrawing(movePoint(drawingRef.current, draggingId, point.x, point.y), true);
  }

  function onPointerUp() {
    const origin = dragOrigin.current;
    dragOrigin.current = null;
    setDraggingId(null);
    if (!origin || origin === drawingRef.current) return;
    setPast((prev) => [...prev.slice(-49), origin]);
    setFuture([]);
  }

  function openSatelliteVerify() {
    if (deleted || measuring || measureLock.current) return;
    if (!canMeasureFromSatellite) {
      toast.error("Add the property address on the job before measuring from satellite.");
      return;
    }
    setVerifySession((value) => value + 1);
    setVerifyOpen(true);
  }

  async function measureFromSatellite(coords: { lat: number; lng: number }) {
    if (deleted || measureLock.current) return;
    measureLock.current = true;
    setMeasuring(true);
    if (job) {
      const query = jobSiteQuery(job);
      void crm.updateJob(
        jobId,
        {
          lat: coords.lat,
          lng: coords.lng,
          geocodedAt: new Date().toISOString(),
          ...(query ? { geocodeQuery: query } : {}),
        },
        { skipAudit: true },
      );
    }
    try {
      const response = await fetch("/api/roof-measure/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, lat: coords.lat, lng: coords.lng }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        imagePath?: string;
        imageDataUrl?: string;
        imageWidth?: number;
        imageHeight?: number;
        contentType?: string;
        drawing?: unknown;
        warning?: string;
      };
      if (!response.ok) {
        toast.error(data.error || "Could not measure from satellite.");
        return;
      }
      let path = data.imagePath?.trim() ?? "";
      if (!path && data.imageDataUrl) {
        const blob = await (await fetch(data.imageDataUrl)).blob();
        const ext = data.contentType === "image/png" ? "png" : "jpg";
        const uploaded = await uploadViaApi("job-files", blob, `roof/${jobId}/satellite.${ext}`, `satellite.${ext}`);
        path = uploaded.path;
      }
      if (!path) {
        toast.error("The satellite photo did not save. Try again in a moment.");
        return;
      }
      const next = parseRoofDrawing(data.drawing);
      setImagePath(path);
      if (data.imageWidth && data.imageHeight) {
        setImageSize({ w: data.imageWidth, h: data.imageHeight });
      }
      commit(next);
      setDraft([]);
      setScaleClicks([]);
      setSelection(null);
      setWasteInput(String(next.wastePercent));
      if (next.facets.length > 0) setTool("select");
      if (data.warning) toast.message(data.warning);
      else {
        toast.success(
          `Traced ${next.facets.length} facet${next.facets.length === 1 ? "" : "s"}. Drag a corner if a line is off.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not measure from satellite.");
    } finally {
      measureLock.current = false;
      setMeasuring(false);
    }
  }

  function applyScale() {
    if (scaleClicks.length < 2) return;
    const feet = Number(scaleFeet);
    const pixels = Math.hypot(scaleClicks[1].x - scaleClicks[0].x, scaleClicks[1].y - scaleClicks[0].y);
    if (!Number.isFinite(feet) || feet <= 0 || pixels <= 0) {
      toast.error("Enter the real length of that line, in feet.");
      return;
    }
    commit(setFeetPerPixel(drawingRef.current, feet / pixels));
    setScaleClicks([]);
    setScaleFeet("");
    toast.success("Scale set");
  }

  async function save(nextStatus = status) {
    if (!job || deleted) return;
    const report: StoredRoofReport = {
      id: reportId,
      status: nextStatus,
      imagePath,
      imageWidth: imageSize.w,
      imageHeight: imageSize.h,
      drawing: drawingRef.current,
      updatedAt: new Date().toISOString(),
    };
    writeLocalRoofReport(jobId, report);
    setSaving(true);
    try {
      const result = await saveRemoteRoofReport({
        jobId,
        companyId: crm.user.companyId,
        report,
      });
      if (!result.ok) {
        if (result.missing) {
          setRemoteNote(missingRoofReportsMessage());
          toast.success("Saved in this browser");
        } else {
          toast.error(result.message);
        }
        return;
      }
      setReportId(result.id);
      setRemoteNote("");
      toast.success(nextStatus === "ready" ? "Report marked ready" : "Roof report saved");
    } finally {
      setSaving(false);
    }
  }

  async function download() {
    if (!job) return;
    let imageDataUrl: string | null = null;
    if (imageSrc) {
      try {
        imageDataUrl = await jpegDataUrl(imageSrc);
      } catch {
        imageDataUrl = null;
      }
    }
    const claim = (crm.jobInsurance ?? []).find((item) => item.jobId === jobId);
    const rep =
      crm.staff.find((member) => member.id === job.ownerStaffId) ??
      crm.staff.find((member) => member.name === job.salesRep);
    const logo = await loadLogoForPdf(crm.company.logoUrl || crm.company.cardLogoUrl || "");
    const loss = claim?.dateOfLoss ? formatDate(claim.dateOfLoss) : "";
    await downloadRoofMeasurePdf({
      companyName: crm.company.name,
      companyPhone: crm.company.phone,
      companyWebsite: crm.company.website,
      companyAddress: formatCompanyAddress(crm.company),
      jobCode: job.code || job.name || "Roof",
      street: job.street,
      cityLine: [job.city, job.state, job.postalCode].filter(Boolean).join(" "),
      fullAddress: address,
      repName: job.salesRep || rep?.name || crm.user.name,
      repPhone: rep?.phone || crm.company.phone,
      carrier: claim?.carrier ?? "",
      claimNumber: claim?.claimNumber ?? "",
      dateOfLoss: loss === "—" ? "" : loss,
      lat: typeof job.lat === "number" ? job.lat : null,
      lng: typeof job.lng === "number" ? job.lng : null,
      drawing: drawingRef.current,
      imageWidth: imageSize.w,
      imageHeight: imageSize.h,
      imageDataUrl,
      logo: logo ? { dataUrl: logo.data, width: logo.width, height: logo.height } : null,
    });
  }

  if (!crm.hydrated || !loaded) return <LoadingScreen />;
  if (!job) {
    return (
      <EmptyState
        title="That job is not in this book"
        description="Open the job from the board, then measure the roof from Files."
        action={
          <Button nativeButton={false} render={<Link href="/jobs" />}>
            Back to jobs
          </Button>
        }
      />
    );
  }

  const viewW = imageSize.w || 1000;
  const viewH = imageSize.h || 700;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href={jobRecordHref(job.id, { tab: "files" })} />}>
          Back to job
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{job.code || job.name}</p>
          <p className="truncate text-xs text-muted-foreground">{address || "No address yet"}</p>
        </div>
        <span className="rounded-full border px-2 py-0.5 text-[11px] tracking-wide uppercase">
          {status === "ready" ? "Ready" : "Draft"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button type="button" size="icon" variant="ghost" aria-label="Undo" disabled={!past.length || deleted} onClick={undo}>
            <Undo2 />
          </Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Redo" disabled={!future.length || deleted} onClick={redo}>
            <Redo2 />
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={saving || deleted} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void download()}>
            PDF
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving || deleted}
            onClick={() => {
              const next = status === "ready" ? "draft" : "ready";
              setStatus(next);
              void save(next);
            }}
          >
            {status === "ready" ? "Back to draft" : "Mark ready"}
          </Button>
        </div>
      </header>

      {remoteNote ? (
        <p className="shrink-0 border-b bg-muted/60 px-4 py-2 text-xs text-muted-foreground">{remoteNote}</p>
      ) : null}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[auto_minmax(0,1fr)_20rem]">
        <div className="flex gap-1 border-b p-2 lg:flex-col lg:border-r lg:border-b-0">
          {TOOLS.map((item) => {
            const Icon = item.icon;
            const active = tool === item.id;
            return (
              <Button
                key={item.id}
                type="button"
                size="icon"
                variant={active ? "secondary" : "ghost"}
                aria-pressed={active}
                aria-label={item.label}
                title={item.label}
                disabled={deleted}
                onClick={() => {
                  setTool(item.id);
                  setDraft([]);
                  setScaleClicks([]);
                }}
              >
                <Icon />
              </Button>
            );
          })}
        </div>

        <div className="relative min-h-[280px] bg-[#1c1c1e]">
          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              onLoad={(event) => {
                const img = event.currentTarget;
                setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/70">
              Measure from satellite, or add an aerial, then trace each roof plane.
            </div>
          )}
          <svg
            ref={svgRef}
            className="absolute inset-0 h-full w-full touch-none"
            viewBox={`0 0 ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid meet"
            role="application"
            aria-label="Roof drawing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {drawing.facets.map((facet) => {
              const points = facetPoints(drawing, facet);
              const centroid = polygonCentroid(points);
              const selected = selection?.kind === "facet" && selection.id === facet.id;
              return (
                <g key={facet.id}>
                  <polygon
                    points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill={selected ? "rgba(250, 204, 21, 0.35)" : "rgba(37, 99, 235, 0.22)"}
                    stroke="none"
                  />
                  <text
                    x={centroid.x}
                    y={centroid.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    stroke="#111"
                    strokeWidth={3}
                    paintOrder="stroke"
                    fontSize={Math.max(14, viewW / 55)}
                    style={{ pointerEvents: "none" }}
                  >
                    {pitchLabel(facet.pitchRise)}
                  </text>
                </g>
              );
            })}
            {drawing.edges.map((edge) => {
              const a = drawing.points.find((point) => point.id === edge.a);
              const b = drawing.points.find((point) => point.id === edge.b);
              if (!a || !b) return null;
              const selected = selection?.kind === "edge" && selection.id === edge.id;
              return (
                <g key={edge.id}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="white"
                    strokeWidth={selected ? 6 : 4}
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={EDGE_COLORS[edge.kind]}
                    strokeWidth={selected ? 3 : 2}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
            {draft.length > 0 ? (
              <polyline
                points={draft.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke="#facc15"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {scaleClicks.length === 2 ? (
              <line
                x1={scaleClicks[0].x}
                y1={scaleClicks[0].y}
                x2={scaleClicks[1].x}
                y2={scaleClicks[1].y}
                stroke="#facc15"
                strokeWidth={2}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {drawing.points.map((point) => (
              <circle
                key={point.id}
                cx={point.x}
                cy={point.y}
                r={Math.max(viewW, viewH) / 160}
                fill="white"
                stroke="#111"
                strokeWidth={Math.max(viewW, viewH) / 500}
              />
            ))}
            {draft.map((point, index) => (
              <circle
                key={`draft-${index}`}
                cx={point.x}
                cy={point.y}
                r={Math.max(viewW, viewH) / 180}
                fill="#facc15"
              />
            ))}
          </svg>
        </div>

        <aside className="min-h-0 space-y-4 overflow-y-auto border-t p-4 lg:border-t-0 lg:border-l">
          <div className="space-y-2">
            <Button
              type="button"
              className="w-full"
              disabled={deleted || measuring || !canMeasureFromSatellite}
              title={canMeasureFromSatellite ? "Verify the house, then pull a satellite photo" : "Add an address on the job first"}
              onClick={openSatelliteVerify}
            >
              <Satellite data-icon="inline-start" />
              {measuring ? "Measuring…" : "Measure from satellite"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Verify a pin on the house first. The address lookup can miss it. Squares come from the traced planes, so drag a corner if a line is off.
            </p>
            <Button type="button" variant="outline" className="w-full" onClick={() => setEagleviewOpen(true)}>
              EagleView
            </Button>
            <p className="text-xs text-muted-foreground">
              Use EagleView when a carrier still wants their report. This drawing stays separate.
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Totals</p>
            {totals.calibrated ? (
              <div className="mt-2 space-y-1 text-sm">
                <p className="font-heading text-2xl font-medium">{formatSquares(totals.squares)} sq</p>
                <p className="text-muted-foreground">
                  Suggested {formatSquares(totals.suggestedSquares)} with {drawing.wastePercent}% waste
                </p>
                <p className="text-muted-foreground">
                  {totals.surfaceSqFt.toLocaleString("en-US")} sq ft · {totals.facetCount} facet
                  {totals.facetCount === 1 ? "" : "s"} · {totals.predominantPitch}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Set the scale on a line you know, in feet. Squares stay blank until then.
              </p>
            )}
            <ul className="mt-3 space-y-1 text-sm">
              {EDGE_KINDS.filter((kind) => totals.lengths[kind] > 0).map((kind) => (
                <li key={kind} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 w-4 rounded-full" style={{ background: EDGE_COLORS[kind] }} />
                    {EDGE_KIND_LABELS[kind]}
                  </span>
                  <span>{formatFeet(totals.lengths[kind])}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="roof-waste">Waste %</Label>
            <div className="flex gap-2">
              <Input
                id="roof-waste"
                inputMode="decimal"
                value={wasteInput}
                disabled={deleted}
                onChange={(event) => {
                  setWasteInput(event.target.value);
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) replaceDrawing(setWastePercent(drawingRef.current, value), true);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={deleted || !totals.calibrated}
                onClick={() => {
                  const next = suggestedWastePercent(drawingRef.current);
                  setWasteInput(String(next));
                  commit(setWastePercent(drawingRef.current, next));
                }}
              >
                Suggest
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Squares include pitch. Hip, valley, rake, and step flashing stretch by the steepest adjoining pitch.
            </p>
          </div>

          {scaleClicks.length === 2 ? (
            <div className="space-y-2 rounded-md border p-3">
              <Label htmlFor="roof-scale">Length of the yellow line (feet)</Label>
              <Input
                id="roof-scale"
                inputMode="decimal"
                value={scaleFeet}
                onChange={(event) => setScaleFeet(event.target.value)}
                placeholder="40"
              />
              <Button type="button" size="sm" onClick={applyScale}>
                Apply scale
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {tool === "facet"
                ? "Click each corner. Click the first point to close the plane."
                : tool === "scale"
                  ? "Click the two ends of a line you know, then enter its length."
                  : "Drag a corner. Click a line to rename it, or a plane to set its pitch."}
            </p>
          )}

          {selectedFacet ? (
            <div className="space-y-2">
              <Label htmlFor="roof-pitch">Pitch</Label>
              <select
                id="roof-pitch"
                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                value={selectedFacet.pitchRise}
                disabled={deleted}
                onChange={(event) => {
                  commit(setFacetPitch(drawingRef.current, selectedFacet.id, Number(event.target.value)));
                }}
              >
                {PITCH_RISES.map((rise) => (
                  <option key={rise} value={rise}>
                    {pitchLabel(rise)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleted}
                onClick={() => {
                  commit(removeFacet(drawingRef.current, selectedFacet.id));
                  setSelection(null);
                }}
              >
                Delete facet
              </Button>
            </div>
          ) : null}

          {selectedEdge ? (
            <div className="space-y-2">
              <Label htmlFor="roof-edge">Edge</Label>
              <select
                id="roof-edge"
                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                value={selectedEdge.kind}
                disabled={deleted}
                onChange={(event) => {
                  commit(setEdgeKind(drawingRef.current, selectedEdge.id, event.target.value as EdgeKind));
                }}
              >
                {EDGE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {EDGE_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-2 border-t pt-4">
            <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Photo</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void onUpload(file);
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={deleted} onClick={() => fileRef.current?.click()}>
              <Upload data-icon="inline-start" />
              Upload aerial
            </Button>
            {photos.length > 0 ? (
              <ul className="space-y-1">
                {photos.slice(0, 8).map((photo) => (
                  <li key={photo.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-muted",
                        imagePath === (photo.storagePath || photo.imageUrl) && "bg-muted font-medium",
                      )}
                      disabled={deleted}
                      onClick={() => applyImage(photo.storagePath || photo.imageUrl)}
                    >
                      {photo.caption.trim() || "Job photo"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Job photos show up here once someone has added them.</p>
            )}
            {drawing.facets.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleted}
                onClick={() => {
                  if (!window.confirm("Clear the drawing? The photo and scale stay.")) return;
                  commit({ ...emptyDrawing(), feetPerPixel: drawing.feetPerPixel, wastePercent: drawing.wastePercent });
                  setDraft([]);
                  setSelection(null);
                }}
              >
                Clear drawing
              </Button>
            ) : null}
          </div>
        </aside>
      </div>

      <RoofMeasureVerifyDialog
        key={verifySession}
        open={verifyOpen}
        jobId={jobId}
        address={address}
        onOpenChange={setVerifyOpen}
        onConfirm={(pin) => {
          if (drawingRef.current.facets.length > 0) {
            const ok = window.confirm("Replace the drawing with a satellite trace? You can still move the corners.");
            if (!ok) return;
          }
          setVerifyOpen(false);
          void measureFromSatellite(pin);
        }}
      />

      <Sheet open={eagleviewOpen} onOpenChange={setEagleviewOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg" side="right">
          <SheetHeader>
            <SheetTitle>EagleView</SheetTitle>
            <SheetDescription>Order or pull a vendor report for this job. It does not replace this drawing.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <JobEagleviewPanel jobId={job.id} disabled={deleted} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
