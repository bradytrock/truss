"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowUpRight,
  Circle,
  Crop,
  Highlighter,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  PHOTO_ANNOTATE_COLORS,
  arrowHead,
  cropFromPoints,
  defaultStrokeWidth,
  ellipseFromPoints,
  exportAnnotatedPhoto,
  hasAnnotations,
  loadAnnotateImage,
  normalizeCrop,
  pointFromRect,
  type PhotoAnnotateTool,
  type PhotoAnnotation,
  type PhotoCrop,
  type PhotoPoint,
  type PhotoShape,
  type PhotoStroke,
} from "@/lib/photo-annotate";
import { cn } from "@/lib/utils";

type Draft =
  | { kind: "draw"; mark: PhotoStroke }
  | { kind: "highlight"; mark: PhotoStroke }
  | { kind: "arrow"; a: PhotoPoint; b: PhotoPoint }
  | { kind: "circle"; a: PhotoPoint; b: PhotoPoint }
  | { kind: "rect"; a: PhotoPoint; b: PhotoPoint }
  | { kind: "crop"; a: PhotoPoint; b: PhotoPoint }
  | null;

const TOOLS: { id: PhotoAnnotateTool; label: string; icon: typeof Pencil }[] = [
  { id: "crop", label: "Crop", icon: Crop },
  { id: "draw", label: "Draw", icon: Pencil },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "text", label: "Text", icon: Type },
  { id: "highlight", label: "Highlight", icon: Highlighter },
];

export function PhotoAnnotateEditor({
  src,
  alt,
  onClose,
  onSave,
}: {
  src: string;
  alt: string;
  onClose: () => void;
  onSave: (file: File) => Promise<void> | void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = useState<PhotoAnnotateTool>("draw");
  const [color, setColor] = useState<string>(PHOTO_ANNOTATE_COLORS[0]);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [marks, setMarks] = useState<PhotoAnnotation[]>([]);
  const [past, setPast] = useState<PhotoAnnotation[][]>([]);
  const [future, setFuture] = useState<PhotoAnnotation[][]>([]);
  const [crop, setCrop] = useState<PhotoCrop | null>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [textDraft, setTextDraft] = useState<{ point: PhotoPoint; value: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (textDraft) {
          commitText();
          return;
        }
        onClose();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dirty = hasAnnotations(marks, crop) || Boolean(draft) || Boolean(textDraft);
  const displayCrop = normalizeCrop(crop);

  const preview = useMemo(() => {
    if (!draft) return null;
    if (draft.kind === "draw" || draft.kind === "highlight") return draft.mark;
    if (draft.kind === "crop") return null;
    const shape = draft;
    return {
      kind: shape.kind,
      color,
      width: defaultStrokeWidth(shape.kind),
      a: shape.a,
      b: shape.b,
    } satisfies PhotoShape;
  }, [color, draft]);

  function pushMarks(next: PhotoAnnotation[]) {
    setPast((prev) => [...prev, marks]);
    setFuture([]);
    setMarks(next);
  }

  function undo() {
    setPast((prev) => {
      const last = prev.at(-1);
      if (!last) return prev;
      setFuture((ahead) => [marks, ...ahead]);
      setMarks(last);
      return prev.slice(0, -1);
    });
  }

  function redo() {
    setFuture((prev) => {
      const next = prev[0];
      if (!next) return prev;
      setPast((behind) => [...behind, marks]);
      setMarks(next);
      return prev.slice(1);
    });
  }

  function localPoint(event: { clientX: number; clientY: number }) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return pointFromRect(event.clientX, event.clientY, rect);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const point = localPoint(event);
    if (!point) return;
    if (tool === "text") {
      commitText();
      setTextDraft({ point, value: "" });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "draw" || tool === "highlight") {
      setDraft({
        kind: tool,
        mark: {
          kind: tool,
          color,
          width: defaultStrokeWidth(tool),
          points: [point],
        },
      });
      return;
    }
    setDraft({ kind: tool, a: point, b: point });
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draft) return;
    const point = localPoint(event);
    if (!point) return;
    if (draft.kind === "draw" || draft.kind === "highlight") {
      setDraft({
        kind: draft.kind,
        mark: { ...draft.mark, points: [...draft.mark.points, point] },
      });
      return;
    }
    setDraft({ kind: draft.kind, a: draft.a, b: point });
  }

  function onPointerUp() {
    if (!draft) return;
    if (draft.kind === "draw" || draft.kind === "highlight") {
      if (draft.mark.points.length > 1) pushMarks([...marks, draft.mark]);
      setDraft(null);
      return;
    }
    if (draft.kind === "crop") {
      setCrop(cropFromPoints(draft.a, draft.b));
      setDraft(null);
      return;
    }
    const shape = draft;
    if (Math.hypot(shape.b.x - shape.a.x, shape.b.y - shape.a.y) > 0.008) {
      pushMarks([
        ...marks,
        {
          kind: shape.kind,
          color,
          width: defaultStrokeWidth(shape.kind),
          a: shape.a,
          b: shape.b,
        },
      ]);
    }
    setDraft(null);
  }

  function commitText() {
    setTextDraft((current) => {
      const value = current?.value.trim() ?? "";
      if (current && value) {
        pushMarks([
          ...marks,
          {
            kind: "text",
            color,
            point: current.point,
            text: value,
            size: 0.036,
          },
        ]);
      }
      return null;
    });
  }

  async function save() {
    commitText();
    if (!dirty && !crop) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const image = await loadAnnotateImage(src);
      const blob = await exportAnnotatedPhoto({
        image,
        marks,
        crop,
      });
      const file = new File([blob], "annotated.jpg", { type: "image/jpeg" });
      await onSave(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the annotated photo.");
    } finally {
      setSaving(false);
    }
  }

  const cropDraft = draft?.kind === "crop" ? cropFromPoints(draft.a, draft.b) : null;

  return (
    <div className="fixed inset-0 z-[80] flex bg-neutral-950 text-white">
      <div className="flex w-14 shrink-0 flex-col items-center gap-2 py-4">
        {TOOLS.map((item) => {
          const Icon = item.icon;
          const active = tool === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => {
                setTool(item.id);
                setColorsOpen(false);
                commitText();
              }}
              className={cn(
                "flex size-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors",
                active ? "bg-white text-neutral-950" : "hover:bg-white/10",
              )}
            >
              <Icon className="size-4" />
            </button>
          );
        })}
        <div className="relative">
          <button
            type="button"
            title="Color"
            aria-label="Color"
            aria-expanded={colorsOpen}
            onClick={() => setColorsOpen((open) => !open)}
            className="flex size-9 items-center justify-center rounded-full border border-white/20 hover:bg-white/10"
          >
            <span className="size-3.5 rounded-full border border-black/20" style={{ background: color }} />
          </button>
          {colorsOpen ? (
            <div className="absolute top-0 left-12 flex flex-col gap-2 rounded-full border border-white/15 bg-neutral-900/95 p-2">
              {PHOTO_ANNOTATE_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Use ${swatch}`}
                  onClick={() => {
                    setColor(swatch);
                    setColorsOpen(false);
                  }}
                  className={cn(
                    "size-5 rounded-full border border-white/20",
                    color === swatch && "ring-2 ring-white",
                  )}
                  style={{ background: swatch }}
                />
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          title="Undo"
          aria-label="Undo"
          disabled={past.length === 0}
          onClick={undo}
          className="flex size-9 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-30"
        >
          <Undo2 className="size-4" />
        </button>
        <button
          type="button"
          title="Redo"
          aria-label="Redo"
          disabled={future.length === 0}
          onClick={redo}
          className="flex size-9 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-30"
        >
          <Redo2 className="size-4" />
        </button>
      </div>

      <div className="relative min-w-0 flex-1">
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="h-9 rounded-full bg-white px-4 text-sm font-medium text-neutral-950 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            aria-label="Close editor"
            onClick={() => {
              if (dirty && !window.confirm("Discard markup on this photo?")) return;
              onClose();
            }}
            className="flex size-9 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex size-full items-center justify-center p-6 sm:p-10">
          <div
            ref={stageRef}
            className="relative w-fit max-h-full max-w-full touch-none select-none overflow-hidden"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              draggable={false}
              className="block max-h-[calc(100dvh-5rem)] max-w-full object-contain"
            />
            <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none">
              {crop || cropDraft ? (
                <path
                  d={cropMaskPath(cropDraft ?? displayCrop)}
                  fill="black"
                  fillOpacity={0.45}
                  fillRule="evenodd"
                />
              ) : null}
              {marks.map((mark, index) => (
                <AnnotationSvg key={index} mark={mark} />
              ))}
              {preview ? <AnnotationSvg mark={preview} /> : null}
              {cropDraft || crop ? (
                <rect
                  x={(cropDraft ?? displayCrop).x}
                  y={(cropDraft ?? displayCrop).y}
                  width={(cropDraft ?? displayCrop).w}
                  height={(cropDraft ?? displayCrop).h}
                  fill="none"
                  stroke="white"
                  strokeWidth={0.006}
                  strokeDasharray="0.02 0.015"
                />
              ) : null}
            </svg>
            {textDraft ? (
              <input
                autoFocus
                value={textDraft.value}
                onChange={(event) => setTextDraft({ ...textDraft, value: event.target.value })}
                onBlur={commitText}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitText();
                  }
                }}
                placeholder="Type…"
                className="absolute min-w-32 -translate-y-1 bg-black/50 px-1 text-sm font-semibold outline-none"
                style={{
                  left: `${textDraft.point.x * 100}%`,
                  top: `${textDraft.point.y * 100}%`,
                  color,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function cropMaskPath(box: PhotoCrop) {
  return `M0,0H1V1H0Z M${box.x},${box.y}h${box.w}v${box.h}h-${box.w}Z`;
}

function AnnotationSvg({ mark }: { mark: PhotoAnnotation }) {
  if (mark.kind === "draw" || mark.kind === "highlight") {
    if (mark.points.length < 2) return null;
    return (
      <polyline
        fill="none"
        points={mark.points.map((point) => `${point.x},${point.y}`).join(" ")}
        stroke={mark.color}
        strokeWidth={mark.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={mark.kind === "highlight" ? 0.4 : 1}
      />
    );
  }
  if (mark.kind === "text") {
    return (
      <text
        x={mark.point.x}
        y={mark.point.y}
        fill={mark.color}
        fontSize={mark.size}
        fontWeight={600}
        style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
      >
        {mark.text}
      </text>
    );
  }
  if (mark.kind === "rect") {
    return (
      <rect
        x={Math.min(mark.a.x, mark.b.x)}
        y={Math.min(mark.a.y, mark.b.y)}
        width={Math.abs(mark.b.x - mark.a.x)}
        height={Math.abs(mark.b.y - mark.a.y)}
        fill="none"
        stroke={mark.color}
        strokeWidth={mark.width}
      />
    );
  }
  if (mark.kind === "circle") {
    const oval = ellipseFromPoints(mark.a, mark.b);
    return (
      <ellipse
        cx={oval.cx}
        cy={oval.cy}
        rx={Math.max(oval.rx, 0.001)}
        ry={Math.max(oval.ry, 0.001)}
        fill="none"
        stroke={mark.color}
        strokeWidth={mark.width}
      />
    );
  }
  if (mark.kind !== "arrow") return null;
  const head = arrowHead(mark.a, mark.b);
  return (
    <g stroke={mark.color} fill={mark.color} strokeWidth={mark.width} strokeLinecap="round">
      <line x1={mark.a.x} y1={mark.a.y} x2={mark.b.x} y2={mark.b.y} />
      <polygon points={`${mark.b.x},${mark.b.y} ${head.left.x},${head.left.y} ${head.right.x},${head.right.y}`} />
    </g>
  );
}
