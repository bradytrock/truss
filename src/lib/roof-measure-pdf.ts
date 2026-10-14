import { downloadBlob } from "@/lib/share";
import {
  EDGE_COLORS,
  EDGE_KIND_LABELS,
  EDGE_KINDS,
  formatFeet,
  formatSquares,
  measureRoof,
  pitchLabel,
  type RoofDrawing,
} from "@/lib/roof-measure";

type Doc = {
  setFont: (face: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  setDrawColor: (r: number, g?: number, b?: number) => void;
  setLineWidth: (width: number) => void;
  text: (text: string, x: number, y: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void;
  output: (type: "blob") => Blob;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
};

function hexToRgb(hex: string) {
  const raw = hex.replace("#", "");
  const value = Number.parseInt(raw, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export async function downloadRoofMeasurePdf(input: {
  jobLabel: string;
  address: string;
  companyName: string;
  drawing: RoofDrawing;
  imageWidth: number;
  imageHeight: number;
  imageDataUrl?: string | null;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" }) as unknown as Doc;
  const totals = measureRoof(input.drawing);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(input.companyName || "Roof measurement", 48, 46);
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text("Roof measurement", 48, 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  doc.text(input.jobLabel, 48, 88);
  if (input.address) doc.text(input.address, 48, 102);

  const box = { x: 48, y: 122, w: 280, h: 220 };
  if (!input.imageDataUrl) {
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(1);
    doc.line(box.x, box.y, box.x + box.w, box.y);
  }

  const spanX = Math.max(1, input.imageWidth || 0);
  const spanY = Math.max(1, input.imageHeight || 0);
  const fitted = spanX > 1 && spanY > 1;
  const xs = input.drawing.points.map((point) => point.x);
  const ys = input.drawing.points.map((point) => point.y);
  const minX = fitted ? 0 : xs.length ? Math.min(...xs) : 0;
  const minY = fitted ? 0 : ys.length ? Math.min(...ys) : 0;
  const widthSpan = fitted ? spanX : Math.max(1, (xs.length ? Math.max(...xs) : 1) - minX);
  const heightSpan = fitted ? spanY : Math.max(1, (ys.length ? Math.max(...ys) : 1) - minY);
  if (input.drawing.points.length > 0 || (fitted && input.imageDataUrl)) {
    const scale = Math.min(box.w / widthSpan, box.h / heightSpan);
    const drawnW = widthSpan * scale;
    const drawnH = heightSpan * scale;
    const offsetX = box.x + (box.w - drawnW) / 2;
    const offsetY = box.y + (box.h - drawnH) / 2;
    if (input.imageDataUrl && fitted) {
      doc.addImage(input.imageDataUrl, "JPEG", offsetX, offsetY, drawnW, drawnH);
    }
    const mapX = (x: number) => offsetX + (x - minX) * scale;
    const mapY = (y: number) => offsetY + (y - minY) * scale;
    doc.setLineWidth(1.4);
    for (const edge of input.drawing.edges) {
      const a = input.drawing.points.find((point) => point.id === edge.a);
      const b = input.drawing.points.find((point) => point.id === edge.b);
      if (!a || !b) continue;
      const color = hexToRgb(EDGE_COLORS[edge.kind]);
      doc.setDrawColor(color.r, color.g, color.b);
      doc.line(mapX(a.x), mapY(a.y), mapX(b.x), mapY(b.y));
    }
  }

  let y = 122;
  const col = 348;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(totals.calibrated ? `${formatSquares(totals.squares)} squares` : "Scale not set", col, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  if (totals.calibrated) {
    doc.text(`Suggested ${formatSquares(totals.suggestedSquares)} sq with ${input.drawing.wastePercent}% waste`, col, y);
    y += 14;
    doc.text(`${totals.surfaceSqFt.toLocaleString("en-US")} sq ft on the slope`, col, y);
    y += 14;
  }
  doc.text(`${totals.facetCount} facet${totals.facetCount === 1 ? "" : "s"} · pitch ${totals.predominantPitch}`, col, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("LENGTHS", col, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  for (const kind of EDGE_KINDS) {
    const length = totals.lengths[kind];
    if (!length) continue;
    doc.text(`${EDGE_KIND_LABELS[kind]}  ${formatFeet(length)}`, col, y);
    y += 14;
  }
  if (EDGE_KINDS.every((kind) => !totals.lengths[kind])) {
    doc.setTextColor(120, 120, 120);
    doc.text(totals.calibrated ? "No edges yet." : "Set a scale to turn the drawing into feet.", col, y);
    y += 14;
  }

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("FACETS", col, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  input.drawing.facets.forEach((facet, index) => {
    doc.text(`Facet ${index + 1}  ${pitchLabel(facet.pitchRise)}`, col, y);
    y += 14;
  });

  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  const noteY = doc.internal.pageSize.getHeight() - 48;
  doc.text("Squares include pitch. Hip, valley, rake, and step flashing use the steepest adjoining pitch.", 48, noteY);
  doc.text("Ridge and eave stay the length you drew.", 48, noteY + 11);

  const slug = input.jobLabel.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "roof";
  downloadBlob(doc.output("blob"), `${slug}-roof-measurement.pdf`);
}
