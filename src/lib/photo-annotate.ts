export const PHOTO_ANNOTATE_COLORS = [
  "#f5d76e",
  "#ef4444",
  "#ffffff",
  "#111111",
  "#3b82f6",
  "#22c55e",
] as const;

export const PHOTO_ANNOTATE_TOOLS = [
  "crop",
  "draw",
  "arrow",
  "circle",
  "rect",
  "text",
  "highlight",
] as const;

export type PhotoAnnotateTool = (typeof PHOTO_ANNOTATE_TOOLS)[number];
export type PhotoAnnotateColor = (typeof PHOTO_ANNOTATE_COLORS)[number] | string;

export type PhotoPoint = { x: number; y: number };

export type PhotoStroke = {
  kind: "draw" | "highlight";
  color: string;
  width: number;
  points: PhotoPoint[];
};

export type PhotoShape = {
  kind: "arrow" | "circle" | "rect";
  color: string;
  width: number;
  a: PhotoPoint;
  b: PhotoPoint;
};

export type PhotoTextMark = {
  kind: "text";
  color: string;
  point: PhotoPoint;
  text: string;
  size: number;
};

export type PhotoAnnotation = PhotoStroke | PhotoShape | PhotoTextMark;

export type PhotoCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function pointFromRect(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): PhotoPoint | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export function cropFromPoints(a: PhotoPoint, b: PhotoPoint): PhotoCrop {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return {
    x: clamp01(x),
    y: clamp01(y),
    w: clamp01(Math.max(w, 0.04)),
    h: clamp01(Math.max(h, 0.04)),
  };
}

export function normalizeCrop(crop: PhotoCrop | null | undefined): PhotoCrop {
  if (!crop) return { x: 0, y: 0, w: 1, h: 1 };
  const w = clamp01(Math.max(crop.w, 0.04));
  const h = clamp01(Math.max(crop.h, 0.04));
  return {
    x: clamp01(Math.min(crop.x, 1 - w)),
    y: clamp01(Math.min(crop.y, 1 - h)),
    w,
    h,
  };
}

export function mapPointThroughCrop(point: PhotoPoint, crop: PhotoCrop): PhotoPoint {
  const box = normalizeCrop(crop);
  return {
    x: box.x + point.x * box.w,
    y: box.y + point.y * box.h,
  };
}

export function arrowHead(a: PhotoPoint, b: PhotoPoint, size = 0.028) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  return {
    left: { x: b.x - ux * size + px * size * 0.45, y: b.y - uy * size + py * size * 0.45 },
    right: { x: b.x - ux * size - px * size * 0.45, y: b.y - uy * size - py * size * 0.45 },
  };
}

export function ellipseFromPoints(a: PhotoPoint, b: PhotoPoint) {
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    rx: Math.abs(a.x - b.x) / 2,
    ry: Math.abs(a.y - b.y) / 2,
  };
}

export function defaultStrokeWidth(kind: PhotoAnnotation["kind"]) {
  if (kind === "highlight") return 0.028;
  if (kind === "text") return 0.028;
  return 0.008;
}

export function hasAnnotations(marks: PhotoAnnotation[], crop: PhotoCrop | null) {
  if (marks.length > 0) return true;
  if (!crop) return false;
  const box = normalizeCrop(crop);
  return box.x > 0.001 || box.y > 0.001 || box.w < 0.999 || box.h < 0.999;
}

export function strokePath(points: PhotoPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export async function loadAnnotateImage(src: string): Promise<HTMLImageElement> {
  const direct = await decodeImage(src, true).catch(() => null);
  if (direct && canReadPixels(direct)) return direct;
  const res = await fetch(src, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load the photo to edit.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    return await decodeImage(url, false);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function decodeImage(src: string, crossOrigin: boolean) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the photo to edit."));
    image.src = src;
  });
}

function canReadPixels(image: HTMLImageElement) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(image, 0, 0, 1, 1);
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

export async function exportAnnotatedPhoto(input: {
  image: HTMLImageElement;
  marks: PhotoAnnotation[];
  crop?: PhotoCrop | null;
  type?: "image/jpeg" | "image/png";
  quality?: number;
}): Promise<Blob> {
  const crop = normalizeCrop(input.crop);
  const sourceW = input.image.naturalWidth || input.image.width;
  const sourceH = input.image.naturalHeight || input.image.height;
  const width = Math.max(1, Math.round(sourceW * crop.w));
  const height = Math.max(1, Math.round(sourceH * crop.h));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the annotated photo.");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(
    input.image,
    sourceW * crop.x,
    sourceH * crop.y,
    sourceW * crop.w,
    sourceH * crop.h,
    0,
    0,
    width,
    height,
  );
  paintAnnotations(ctx, input.marks, width, height, crop);
  const type = input.type ?? "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, input.quality ?? 0.92),
  );
  if (!blob) throw new Error("Could not export the annotated photo.");
  return blob;
}

export function paintAnnotations(
  ctx: CanvasRenderingContext2D,
  marks: PhotoAnnotation[],
  width: number,
  height: number,
  crop?: PhotoCrop | null,
) {
  const box = normalizeCrop(crop);
  const sx = (point: PhotoPoint) => ((point.x - box.x) / box.w) * width;
  const sy = (point: PhotoPoint) => ((point.y - box.y) / box.h) * height;
  for (const mark of marks) {
    if (mark.kind === "draw" || mark.kind === "highlight") {
      if (mark.points.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = mark.color;
      ctx.lineWidth = Math.max(2, mark.width * Math.min(width, height));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = mark.kind === "highlight" ? 0.38 : 1;
      ctx.beginPath();
      ctx.moveTo(sx(mark.points[0]!), sy(mark.points[0]!));
      for (const point of mark.points.slice(1)) ctx.lineTo(sx(point), sy(point));
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if (mark.kind === "text") {
      ctx.save();
      ctx.fillStyle = mark.color;
      ctx.font = `600 ${Math.max(14, mark.size * Math.min(width, height))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(mark.text, sx(mark.point), sy(mark.point));
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.strokeStyle = mark.color;
    ctx.fillStyle = mark.color;
    ctx.lineWidth = Math.max(2, mark.width * Math.min(width, height));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (mark.kind === "rect") {
      const x = sx({ x: Math.min(mark.a.x, mark.b.x), y: 0 });
      const y = sy({ x: 0, y: Math.min(mark.a.y, mark.b.y) });
      ctx.strokeRect(x, y, Math.abs(sx(mark.b) - sx(mark.a)), Math.abs(sy(mark.b) - sy(mark.a)));
    } else if (mark.kind === "circle") {
      const ellipse = ellipseFromPoints(mark.a, mark.b);
      ctx.beginPath();
      ctx.ellipse(sx({ x: ellipse.cx, y: 0 }), sy({ x: 0, y: ellipse.cy }), ellipse.rx * width / box.w, ellipse.ry * height / box.h, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (mark.kind === "arrow") {
      ctx.beginPath();
      ctx.moveTo(sx(mark.a), sy(mark.a));
      ctx.lineTo(sx(mark.b), sy(mark.b));
      ctx.stroke();
      const head = arrowHead(mark.a, mark.b, 0.03);
      ctx.beginPath();
      ctx.moveTo(sx(mark.b), sy(mark.b));
      ctx.lineTo(sx(head.left), sy(head.left));
      ctx.lineTo(sx(head.right), sy(head.right));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
