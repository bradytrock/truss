import {
  EDGE_COLORS,
  edgeLengthFeet,
  polygonCentroid,
  type EdgeKind,
  type RoofDrawing,
  type RoofPoint,
} from "./roof-measure.ts";
import {
  buildRoofReport,
  complexityLabel,
  complexityNote,
  formatThirdSquares,
  pitchText,
  type ReportFacet,
  type RoofReportModel,
} from "./roof-report.ts";

export type RoofMeasurePdfInput = {
  companyName: string;
  companyPhone: string;
  companyWebsite: string;
  companyAddress: string;
  jobCode: string;
  street: string;
  cityLine: string;
  fullAddress: string;
  repName: string;
  repPhone: string;
  carrier: string;
  claimNumber: string;
  dateOfLoss: string;
  lat: number | null;
  lng: number | null;
  drawing: RoofDrawing;
  imageWidth: number;
  imageHeight: number;
  imageDataUrl?: string | null;
  logo?: { dataUrl: string; width: number; height: number } | null;
};

type RGB = [number, number, number];

type Pdf = {
  setFont: (face: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  setDrawColor: (r: number, g?: number, b?: number) => void;
  setFillColor: (r: number, g?: number, b?: number) => void;
  setLineWidth: (width: number) => void;
  setLineDashPattern: (dash: number[], phase: number) => void;
  text: (
    text: string | string[],
    x: number,
    y: number,
    options?: { align?: "left" | "center" | "right"; angle?: number },
  ) => void;
  splitTextToSize: (text: string, width: number) => string[];
  getTextWidth: (text: string) => number;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  circle: (x: number, y: number, r: number, style?: string) => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  close: () => void;
  fill: () => void;
  stroke: () => void;
  clip: () => void;
  saveGraphicsState: () => void;
  restoreGraphicsState: () => void;
  addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void;
  addPage: () => void;
  textWithLink: (text: string, x: number, y: number, options: { url: string }) => number;
  output: (type: "arraybuffer") => ArrayBuffer;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
};

const RED: RGB = [204, 0, 0];
const INK: RGB = [28, 28, 28];
const MUTED: RGB = [120, 120, 120];
const HAIR: RGB = [210, 210, 210];
const PINK: RGB = [246, 217, 214];
const PAPER: RGB = [255, 255, 255];
const LEFT = 36;
const RIGHT = 576;
const PAGE_COUNT = 9;

const COVER_KINDS: EdgeKind[] = ["ridge", "hip", "valley", "rake", "eave", "step_flashing", "flashing"];

function commas(value: number, digits = 0) {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function paint(doc: Pdf, color: RGB) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function fill(doc: Pdf, color: RGB) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function stroke(doc: Pdf, color: RGB) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function hexToRgb(hex: string): RGB {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rule(doc: Pdf, x1: number, x2: number, y: number, color: RGB = INK, width = 1.25) {
  stroke(doc, color);
  doc.setLineWidth(width);
  doc.line(x1, y, x2, y);
}

function imageFormat(dataUrl: string) {
  return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
}

function websiteLabel(website: string) {
  return website.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function contactLine(input: RoofMeasurePdfInput) {
  return [websiteLabel(input.companyWebsite), input.companyPhone].filter(Boolean).join(" · ");
}

function drawWordmark(doc: Pdf, input: RoofMeasurePdfInput) {
  if (input.logo?.dataUrl && input.logo.width > 0 && input.logo.height > 0) {
    const scale = Math.min(150 / input.logo.width, 30 / input.logo.height);
    doc.addImage(
      input.logo.dataUrl,
      imageFormat(input.logo.dataUrl),
      LEFT,
      24,
      input.logo.width * scale,
      input.logo.height * scale,
    );
    return;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(input.companyName.length > 26 ? 11 : 14);
  paint(doc, INK);
  doc.text(input.companyName || "Roof measurement", LEFT, 44);
}

function drawHeader(doc: Pdf, input: RoofMeasurePdfInput) {
  fill(doc, [214, 214, 214]);
  doc.rect(0, 0, 8, 792, "F");
  drawWordmark(doc, input);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, MUTED);
  doc.text("ROOF MEASUREMENT REPORT", RIGHT, 32, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  paint(doc, INK);
  doc.text(input.jobCode || "Roof", RIGHT, 48, { align: "right" });
  rule(doc, LEFT, RIGHT, 62);
}

function drawFooter(doc: Pdf, input: RoofMeasurePdfInput, page: number) {
  rule(doc, LEFT, RIGHT, 748, INK, 0.8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, MUTED);
  const address = input.fullAddress || input.street || "";
  doc.text(address, LEFT, 764);
  const contact = contactLine(input);
  if (contact) doc.text(contact, 306, 764, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  paint(doc, RED);
  doc.text(`${String(page).padStart(2, "0")} / ${String(PAGE_COUNT).padStart(2, "0")}`, RIGHT, 766, { align: "right" });
}

function drawSection(doc: Pdf, number: string, title: string, kicker: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  paint(doc, [168, 168, 168]);
  doc.text(number, LEFT, 88);
  doc.setFontSize(16);
  doc.text(title, LEFT + 28, 88);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(kicker, RIGHT, 86, { align: "right" });
  rule(doc, LEFT, RIGHT, 98);
  return 116;
}

type Box = { x: number; y: number; w: number; h: number };
type Mapped = { x: number; y: number };

function fitMap(drawing: RoofDrawing, box: Box) {
  const xs = drawing.points.map((point) => point.x);
  const ys = drawing.points.map((point) => point.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const spanX = Math.max(1, (xs.length ? Math.max(...xs) : 1) - minX);
  const spanY = Math.max(1, (ys.length ? Math.max(...ys) : 1) - minY);
  const pad = 18;
  const scale = Math.min((box.w - pad * 2) / spanX, (box.h - pad * 2) / spanY);
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const ox = box.x + (box.w - drawnW) / 2;
  const oy = box.y + pad;
  return {
    x: (value: number) => ox + (value - minX) * scale,
    y: (value: number) => oy + (value - minY) * scale,
    north: {
      x: Math.min(box.x + box.w - 14, ox + drawnW - 6),
      y: Math.min(box.y + box.h - 14, oy + drawnH + 26),
    },
  };
}

function mapPoints(points: RoofPoint[], map: ReturnType<typeof fitMap>): Mapped[] {
  return points.map((point) => ({ x: map.x(point.x), y: map.y(point.y) }));
}

function trace(doc: Pdf, points: Mapped[]) {
  if (points.length < 2) return;
  doc.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) doc.lineTo(points[index].x, points[index].y);
  doc.close();
}

function fillPolygon(doc: Pdf, points: Mapped[], color: RGB) {
  if (points.length < 3) return;
  fill(doc, color);
  trace(doc, points);
  doc.fill();
}

function hatchPolygon(doc: Pdf, points: Mapped[]) {
  if (points.length < 3) return;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  doc.saveGraphicsState();
  trace(doc, points);
  doc.clip();
  stroke(doc, [150, 150, 150]);
  doc.setLineWidth(0.5);
  const rise = maxY - minY;
  for (let x = minX - rise; x < maxX + 4; x += 5) {
    doc.line(x, minY, x + rise, maxY);
  }
  doc.restoreGraphicsState();
}

function drawNorth(doc: Pdf, at: { x: number; y: number }) {
  stroke(doc, INK);
  doc.setLineWidth(0.8);
  doc.circle(at.x, at.y, 9, "S");
  fill(doc, RED);
  doc.moveTo(at.x, at.y - 6);
  doc.lineTo(at.x - 3.2, at.y + 2);
  doc.lineTo(at.x + 3.2, at.y + 2);
  doc.close();
  doc.fill();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  paint(doc, INK);
  doc.text("N", at.x, at.y - 12, { align: "center" });
}

function facetById(report: RoofReportModel, id: string) {
  return report.facets.find((facet) => facet.id === id) ?? null;
}

function drawPlan(
  doc: Pdf,
  input: RoofMeasurePdfInput,
  report: RoofReportModel,
  box: Box,
  mode: "letters" | "lengths" | "areas" | "index",
) {
  const drawing = input.drawing;
  if (drawing.facets.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    paint(doc, MUTED);
    doc.text("No roof planes on this report.", box.x + 8, box.y + 24);
    return;
  }
  const map = fitMap(drawing, box);
  const pointOf = (id: string) => drawing.points.find((point) => point.id === id) ?? null;

  for (const facet of drawing.facets) {
    const info = facetById(report, facet.id);
    const pts = mapPoints(
      facet.pointIds.map(pointOf).filter((point): point is RoofPoint => point != null),
      map,
    );
    const low = (info?.pitchRise ?? facet.pitchRise) < 3;
    if (mode === "lengths") fillPolygon(doc, pts, PAPER);
    else if (mode === "index") fillPolygon(doc, pts, low ? [226, 226, 226] : [244, 244, 244]);
    else fillPolygon(doc, pts, low ? [226, 226, 226] : PINK);
    if (low && mode !== "lengths") hatchPolygon(doc, pts);
  }

  stroke(doc, PAPER);
  doc.setLineWidth(mode === "lengths" ? 2.2 : 1.3);
  doc.setLineDashPattern([], 0);
  for (const edge of drawing.edges) {
    const a = pointOf(edge.a);
    const b = pointOf(edge.b);
    if (!a || !b) continue;
    doc.line(map.x(a.x), map.y(a.y), map.x(b.x), map.y(b.y));
  }

  if (mode === "lengths") {
    for (const edge of drawing.edges) {
      const a = pointOf(edge.a);
      const b = pointOf(edge.b);
      if (!a || !b) continue;
      const color = hexToRgb(EDGE_COLORS[edge.kind]);
      stroke(doc, color);
      doc.setLineWidth(1.35);
      if (edge.kind === "valley") doc.setLineDashPattern([3, 2], 0);
      else doc.setLineDashPattern([], 0);
      doc.line(map.x(a.x), map.y(a.y), map.x(b.x), map.y(b.y));
    }
    doc.setLineDashPattern([], 0);
  }

  doc.setFont("helvetica", "bold");
  for (const facet of drawing.facets) {
    const info = facetById(report, facet.id);
    const raw = facet.pointIds.map(pointOf).filter((point): point is RoofPoint => point != null);
    if (raw.length < 3 || !info) continue;
    const center = polygonCentroid(raw);
    const x = map.x(center.x);
    const y = map.y(center.y);
    if (mode === "areas") {
      paint(doc, INK);
      doc.setFontSize(8);
      doc.text(report.calibrated ? commas(Math.round(info.surfaceSqFt)) : "—", x, y - 1, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      paint(doc, RED);
      doc.text(pitchText(info.pitchRise), x, y + 8, { align: "center" });
      doc.setFont("helvetica", "bold");
    } else {
      paint(doc, mode === "index" ? [90, 90, 90] : INK);
      doc.setFontSize(8);
      doc.text(info.letter, x, y + 3, { align: "center" });
    }
  }

  if (mode === "lengths" && report.calibrated) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    for (const edge of drawing.edges) {
      const feet = Math.round(edgeLengthFeet(drawing, edge));
      if (feet < 5) continue;
      const a = pointOf(edge.a);
      const b = pointOf(edge.b);
      if (!a || !b) continue;
      paint(doc, hexToRgb(EDGE_COLORS[edge.kind]));
      const mx = (map.x(a.x) + map.x(b.x)) / 2;
      const my = (map.y(a.y) + map.y(b.y)) / 2;
      const shown = feet < 10 ? `+${feet}` : String(feet);
      const width = doc.getTextWidth(shown);
      fill(doc, PAPER);
      doc.rect(mx - width / 2 - 1.5, my - 8, width + 3, 9, "F");
      doc.text(shown, mx, my - 1, { align: "center" });
    }
  }

  drawNorth(doc, map.north);
}

function statBand(doc: Pdf, report: RoofReportModel, y: number) {
  const stats = [
    {
      label: "TOTAL ROOF AREA",
      value: report.calibrated ? commas(Math.round(report.totalSqFt)) : "—",
      note: "sq ft · all pitches",
    },
    {
      label: "ORDER",
      value: report.calibrated ? formatThirdSquares(report.orderThirds) : "—",
      note: `squares @ ${Math.round(report.wastePercent)}% waste`,
    },
    {
      label: "MAIN PITCH",
      value: pitchText(report.mainPitchRise),
      note: report.calibrated && report.mainPitchRise != null ? `${Math.round(report.mainPitchShare * 100)}% of roof` : "",
    },
    {
      label: "FACETS",
      value: String(report.facets.length),
      note: complexityLabel(report.complexity),
    },
  ];
  const width = (RIGHT - LEFT) / stats.length;
  stats.forEach((stat, index) => {
    const x = LEFT + index * width;
    if (index > 0) {
      stroke(doc, HAIR);
      doc.setLineWidth(0.6);
      doc.line(x, y, x, y + 48);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    paint(doc, MUTED);
    doc.text(stat.label, x + 10, y + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    paint(doc, [90, 90, 90]);
    doc.text(stat.value, x + 10, y + 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    paint(doc, MUTED);
    doc.text(stat.note, x + 10, y + 44);
  });
  return y + 62;
}

function lineRow(doc: Pdf, x: number, right: number, y: number, label: string, value: string, sub = "") {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  paint(doc, INK);
  doc.text(label, x, y);
  if (sub) {
    doc.setFontSize(7);
    paint(doc, MUTED);
    doc.text(sub, x, y + 9);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  paint(doc, INK);
  doc.text(value, right, y, { align: "right" });
  rule(doc, x, right, y + (sub ? 14 : 6), HAIR, 0.4);
  return y + (sub ? 24 : 16);
}

function coverPage(doc: Pdf, input: RoofMeasurePdfInput, report: RoofReportModel) {
  drawHeader(doc, input);
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, RED);
  doc.text(`ROOF MEASUREMENT REPORT  ·  ${today}`, LEFT, 82);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  paint(doc, INK);
  const street = (input.street || input.fullAddress || "Roof").toUpperCase();
  doc.text(doc.splitTextToSize(street, RIGHT - LEFT)[0] ?? street, LEFT, 108);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text((input.cityLine || "").toUpperCase(), LEFT, 126);
  const afterStats = statBand(doc, report, 142);
  if (!report.calibrated) {
    doc.setFontSize(8);
    paint(doc, MUTED);
    doc.text("Set a scale before ordering from these numbers.", LEFT, afterStats - 6);
  }

  const diagram: Box = { x: LEFT, y: afterStats + 8, w: 318, h: 748 - (afterStats + 24) };
  drawPlan(doc, input, report, diagram, "letters");

  let y = afterStats + 12;
  const col = 368;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, RED);
  doc.text("LINE TOTALS", col, y);
  y += 16;
  for (const kind of COVER_KINDS) {
    const line = report.lines.find((item) => item.kind === kind);
    y = lineRow(doc, col, RIGHT, y, line?.label ?? kind, report.calibrated ? `${commas(line?.feet ?? 0)} ft` : "—");
  }
  y += 4;
  y = lineRow(doc, col, RIGHT, y, "Drip edge", report.calibrated ? `${commas(report.dripFeet)} ft` : "—", "eaves + rakes");

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, RED);
  doc.text("CLAIM", col, y);
  y += 16;
  for (const [label, value] of [
    ["Carrier", input.carrier],
    ["Claim #", input.claimNumber],
    ["Date of loss", input.dateOfLoss],
  ] as const) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, MUTED);
    doc.text(label, col, y);
    paint(doc, INK);
    doc.text(value || "", RIGHT, y, { align: "right" });
    rule(doc, col + 52, RIGHT, y + 3, HAIR, 0.5);
    y += 16;
  }

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, RED);
  doc.text("PREPARED BY", col, y);
  y += 16;
  const office = doc.splitTextToSize(input.companyAddress || "—", 120);
  const prepared: Array<[string, string]> = [
    ["Rep", input.repName || "—"],
    ["Phone", input.repPhone || input.companyPhone || "—"],
    ["Office", office[0] ?? "—"],
  ];
  prepared.forEach(([label, value], index) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, MUTED);
    doc.text(label, col, y);
    paint(doc, INK);
    doc.text(value, RIGHT, y, { align: "right" });
    y += 14;
    if (index === 2) {
      for (const extra of office.slice(1, 3)) {
        doc.text(extra, RIGHT, y, { align: "right" });
        y += 11;
      }
    }
  });
  drawFooter(doc, input, 1);
}

function placeholder(doc: Pdf, box: Box, caption: string, filled = false) {
  if (!filled) {
    stroke(doc, [190, 190, 190]);
    doc.setLineDashPattern([2, 2], 0);
    doc.setLineWidth(0.7);
    doc.rect(box.x, box.y, box.w, box.h, "S");
    doc.setLineDashPattern([], 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, [170, 170, 170]);
    doc.text(caption, box.x + box.w / 2, box.y + box.h / 2, { align: "center" });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  paint(doc, MUTED);
  doc.text(caption, box.x, box.y + box.h + 12);
}

function aerialPage(doc: Pdf, input: RoofMeasurePdfInput) {
  doc.addPage();
  drawHeader(doc, input);
  let y = drawSection(doc, "02", "AERIAL VIEWS", "IMAGERY");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  paint(doc, INK);
  const note = input.imageDataUrl
    ? "Overhead photo used for this measurement. Side views are not included."
    : "No aerial photo was attached to this measurement.";
  doc.text(note, LEFT, y);
  y += 14;
  const top: Box = { x: LEFT, y, w: RIGHT - LEFT, h: 210 };
  if (input.imageDataUrl) {
    const spanX = Math.max(1, input.imageWidth || 1);
    const spanY = Math.max(1, input.imageHeight || 1);
    const scale = Math.min(top.w / spanX, top.h / spanY);
    const w = spanX * scale;
    const h = spanY * scale;
    doc.addImage(input.imageDataUrl, imageFormat(input.imageDataUrl), top.x + (top.w - w) / 2, top.y + (top.h - h) / 2, w, h);
    placeholder(doc, top, "TOP VIEW", true);
  } else {
    placeholder(doc, top, "TOP VIEW");
  }
  y = top.y + top.h + 28;
  const gap = 12;
  const cellW = (RIGHT - LEFT - gap) / 2;
  const cellH = 130;
  const sides = ["NORTH SIDE", "SOUTH SIDE", "EAST SIDE", "WEST SIDE"];
  sides.forEach((label, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    placeholder(doc, { x: LEFT + col * (cellW + gap), y: y + row * (cellH + 26), w: cellW, h: cellH }, label);
  });
  drawFooter(doc, input, 2);
}

function lengthPage(doc: Pdf, input: RoofMeasurePdfInput, report: RoofReportModel) {
  doc.addPage();
  drawHeader(doc, input);
  drawSection(doc, "03", "LINE MEASUREMENTS", "LENGTHS IN FEET");
  drawPlan(doc, input, report, { x: LEFT, y: 112, w: 330, h: 600 }, "lengths");
  let y = 124;
  const col = 380;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, RED);
  doc.text("TOTALS", col, y);
  y += 16;
  const rows: Array<[string, string, string]> = [
    ...COVER_KINDS.map((kind) => {
      const line = report.lines.find((item) => item.kind === kind);
      return [line?.label ?? kind, report.calibrated ? `${commas(line?.feet ?? 0)} ft` : "—", `${line?.count ?? 0} runs`] as [string, string, string];
    }),
    ["Parapets", report.calibrated ? `${commas(report.lines.find((line) => line.kind === "parapet")?.feet ?? 0)} ft` : "—", `${report.lines.find((line) => line.kind === "parapet")?.count ?? 0} runs`],
    ["Hips + ridges", report.calibrated ? `${commas(report.hipsPlusRidges)} ft` : "—", ""],
    ["Drip edge", report.calibrated ? `${commas(report.dripFeet)} ft` : "—", "eaves + rakes"],
  ];
  for (const [label, value, sub] of rows) y = lineRow(doc, col, RIGHT, y, label, value, sub);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, MUTED);
  const note = doc.splitTextToSize(
    "Segments over 5 ft are labeled, rounded to the foot. “+” marks a short number that could be misread when the drawing is rotated.",
    RIGHT - col,
  );
  doc.text(note, col, y);
  drawFooter(doc, input, 3);
}

function areaPage(doc: Pdf, input: RoofMeasurePdfInput, report: RoofReportModel) {
  doc.addPage();
  drawHeader(doc, input);
  drawSection(doc, "04", "SLOPE & AREA", "SQUARE FEET · RISE PER 12 IN");
  drawPlan(doc, input, report, { x: LEFT, y: 112, w: 340, h: 600 }, "areas");
  let y = 124;
  const col = 390;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, RED);
  doc.text("AREA BY PITCH", col, y);
  y += 16;
  if (report.pitchBands.length === 0) {
    y = lineRow(doc, col, RIGHT, y, "Total", "—", "0 facets");
  }
  for (const band of report.pitchBands) {
    y = lineRow(
      doc,
      col,
      RIGHT,
      y,
      pitchText(band.pitchRise),
      report.calibrated ? `${commas(band.surfaceSqFt, 1)} sf` : "—",
      `${(band.share * 100).toFixed(1)}%`,
    );
  }
  y = lineRow(
    doc,
    col,
    RIGHT,
    y,
    "Total",
    report.calibrated ? `${commas(Math.round(report.totalSqFt))} sf` : "—",
    `${report.facets.length} facets`,
  );
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, MUTED);
  const note = doc.splitTextToSize(
    "Each facet shows its area in square feet with its pitch underneath. Hatched facets are low slope (under 3/12) and take a membrane, not shingles. Facet areas are rounded. The total uses unrounded values, so the labels can add up a square foot apart.",
    RIGHT - col,
  );
  doc.text(note, col, y);
  drawFooter(doc, input, 4);
}

function facetTable(doc: Pdf, report: RoofReportModel, facets: ReportFacet[], x: number, y: number, width: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  paint(doc, MUTED);
  doc.text("FACET", x, y);
  doc.text("AREA", x + 28, y);
  doc.text("PITCH", x + 78, y);
  doc.text("SHARE", x + width, y, { align: "right" });
  y += 6;
  rule(doc, x, x + width, y, INK, 0.6);
  y += 12;
  for (const facet of facets) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    paint(doc, RED);
    doc.text(facet.letter, x, y);
    doc.setFont("helvetica", "normal");
    paint(doc, INK);
    doc.text(report.calibrated ? `${commas(Math.round(facet.surfaceSqFt))} sf` : "—", x + 28, y);
    doc.text(pitchText(facet.pitchRise), x + 78, y);
    doc.text(report.calibrated ? `${(facet.share * 100).toFixed(1)}%` : "—", x + width, y, { align: "right" });
    y += 13;
  }
}

function indexPage(doc: Pdf, input: RoofMeasurePdfInput, report: RoofReportModel) {
  doc.addPage();
  drawHeader(doc, input);
  const last = report.facets[report.facets.length - 1]?.letter ?? "—";
  drawSection(doc, "05", "FACET INDEX", `A = SMALLEST · ${last} = LARGEST`);
  drawPlan(doc, input, report, { x: LEFT, y: 112, w: 230, h: 520 }, "index");
  const mid = Math.ceil(report.facets.length / 2);
  facetTable(doc, report, report.facets.slice(0, mid), 280, 124, 140);
  facetTable(doc, report, report.facets.slice(mid), 436, 124, 140);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, MUTED);
  const note = doc.splitTextToSize(
    "Facets are lettered from smallest (A) to largest so a crew lead or adjuster can call out one slope by letter.",
    RIGHT - LEFT,
  );
  doc.text(note, LEFT, 700);
  drawFooter(doc, input, 5);
}

function wastePage(doc: Pdf, input: RoofMeasurePdfInput, report: RoofReportModel) {
  doc.addPage();
  drawHeader(doc, input);
  const y0 = drawSection(doc, "06", "TAKEOFF SUMMARY", "NUMBERS FOR THE ESTIMATE");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, RED);
  doc.text("SHINGLE SQUARES BY WASTE FACTOR", LEFT, y0);
  const columns = report.wasteColumns;
  const colW = (RIGHT - LEFT) / Math.max(1, columns.length);
  columns.forEach((column, index) => {
    const x = LEFT + index * colW + colW / 2;
    const y = y0 + 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    paint(doc, MUTED);
    doc.text(`${column.percent}%`, x, y, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(column.recommended ? 12 : 10);
    paint(doc, column.recommended ? INK : [70, 70, 70]);
    doc.text(report.calibrated ? formatThirdSquares(column.thirds) : "—", x, y + 16, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    paint(doc, MUTED);
    doc.text(report.calibrated ? `${commas(column.areaSqFt)} sf` : "", x, y + 28, { align: "center" });
    if (column.measured || column.recommended) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      paint(doc, column.recommended ? RED : MUTED);
      doc.text(column.recommended ? "RECOMMENDED" : "MEASURED", x, y + 38, { align: "center" });
    }
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, MUTED);
  const wasteNote = [
    "Counts only roof at 3/12 or steeper. Squares are rounded up to the next 1/3 square.",
    "Ridge, hip and starter are ordered separately.",
  ];
  doc.text(wasteNote, LEFT, y0 + 78);

  let y = y0 + 108;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, RED);
  doc.text("ROOF COMPLEXITY", LEFT, y);
  y += 18;
  (["simple", "normal", "complex"] as const).forEach((name, index) => {
    const x = LEFT + index * 70;
    doc.setFont("helvetica", name === report.complexity ? "bold" : "normal");
    doc.setFontSize(8);
    paint(doc, name === report.complexity ? INK : MUTED);
    doc.text(name.toUpperCase(), x, y);
    if (name === report.complexity) rule(doc, x, x + doc.getTextWidth(name.toUpperCase()), y + 3, RED, 1.4);
  });
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, INK);
  doc.text(doc.splitTextToSize(complexityNote(report), 250), LEFT, y);

  y += 48;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, RED);
  doc.text("LOCATION", LEFT, y);
  y += 14;
  const location: Array<[string, string]> = [
    ["Latitude", input.lat == null ? "" : input.lat.toFixed(7)],
    ["Longitude", input.lng == null ? "" : input.lng.toFixed(7)],
  ];
  for (const [label, value] of location) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, MUTED);
    doc.text(label, LEFT, y);
    paint(doc, INK);
    doc.text(value || "—", LEFT + 160, y, { align: "right" });
    y += 13;
  }

  y = y0 + 108;
  const col = 310;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, RED);
  doc.text("ALL STRUCTURES", col, y);
  y += 14;
  doc.setFontSize(7);
  paint(doc, MUTED);
  doc.text("ITEM", col, y);
  doc.text("LENGTH", col + 150, y);
  doc.text("COUNT", RIGHT, y, { align: "right" });
  y += 6;
  rule(doc, col, RIGHT, y, INK, 0.6);
  y += 14;
  const structure: Array<[string, string, string]> = [
    ["Ridges", "ridge"],
    ["Hips", "hip"],
    ["Valleys", "valley"],
    ["Rakes (sloped edges)", "rake"],
    ["Eaves / starter (level edges)", "eave"],
    ["Drip edge", "drip-order"],
    ["Flashing", "flashing"],
    ["Step flashing", "step_flashing"],
    ["Parapet walls", "parapet"],
  ].map(([label, kind]) => {
    if (kind === "drip-order") {
      return [label, report.calibrated ? `${commas(report.dripFeet)} ft` : "—", String(report.dripCount)];
    }
    const line = report.lines.find((item) => item.kind === (kind as EdgeKind));
    return [label, report.calibrated ? `${commas(line?.feet ?? 0)} ft` : "—", String(line?.count ?? 0)];
  });
  for (const [label, length, count] of structure) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, INK);
    doc.text(label, col, y);
    doc.text(length, col + 150, y);
    doc.text(count, RIGHT, y, { align: "right" });
    y += 14;
  }
  rule(doc, col, RIGHT, y - 8, INK, 0.7);
  doc.setFont("helvetica", "bold");
  doc.text("Total area", col, y + 4);
  doc.text(report.calibrated ? `${commas(Math.round(report.totalSqFt))} sf` : "—", RIGHT, y + 4, { align: "right" });
  drawFooter(doc, input, 6);
}

function materialPage(doc: Pdf, input: RoofMeasurePdfInput, report: RoofReportModel) {
  doc.addPage();
  drawHeader(doc, input);
  let y = drawSection(doc, "07", "MATERIAL ORDER", "FOR THE SUPPLIER");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  paint(doc, MUTED);
  doc.text("MATERIAL", LEFT, y);
  doc.text("QTY", 330, y, { align: "right" });
  doc.text("UNIT", 346, y);
  doc.text("BASED ON", 430, y);
  y += 6;
  rule(doc, LEFT, RIGHT, y, INK, 0.8);
  y += 16;
  for (const line of report.materials) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    paint(doc, INK);
    doc.text(line.name, LEFT, y);
    doc.setFont("helvetica", "bold");
    paint(doc, RED);
    doc.text(report.calibrated ? commas(line.qty) : "—", 330, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    paint(doc, INK);
    doc.text(line.unit, 346, y);
    paint(doc, MUTED);
    doc.text(line.basedOn, 430, y);
    rule(doc, LEFT, RIGHT, y + 6, HAIR, 0.4);
    y += 20;
  }
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, MUTED);
  const note = doc.splitTextToSize(
    `Based on the recommended ${Math.round(report.wastePercent)}% waste. Confirm bundle coverage on the manufacturer spec sheet for the shingle line. Vents, pipe boots and fasteners are not included.`,
    RIGHT - LEFT,
  );
  doc.text(note, LEFT, y);
  y += note.length * 11 + 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, RED);
  doc.text("GETTING THERE", LEFT, y);
  y += 8;
  rule(doc, LEFT, RIGHT, y, HAIR, 0.4);
  y += 16;
  const query = encodeURIComponent(input.fullAddress || `${input.street} ${input.cityLine}`);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  paint(doc, RED);
  if (query.trim()) {
    doc.textWithLink(`Map of ${input.fullAddress || input.street}`, LEFT, y, {
      url: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    if (input.companyAddress) {
      const width = doc.getTextWidth(`Map of ${input.fullAddress || input.street}`);
      doc.textWithLink("Directions from the office", LEFT + width + 14, y, {
        url: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(input.companyAddress)}&destination=${query}`,
      });
    }
  }
  drawFooter(doc, input, 7);
}

const FIELD_CHECKS = [
  "Pitch checked with a gauge on the main roof",
  "Overhang depth at eaves and rakes",
  "Facet count and valley count match the diagram",
  "Layers of existing roofing",
  "Decking condition",
  "Pipe boots, vents and penetrations counted",
  "Low-slope section measured for membrane",
];

function fieldPage(doc: Pdf, input: RoofMeasurePdfInput) {
  doc.addPage();
  drawHeader(doc, input);
  let y = drawSection(doc, "08", "FIELD VERIFICATION", "ON THE ROOF");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  paint(doc, INK);
  doc.text("Fill in on site before material is ordered.", LEFT, y);
  y += 22;
  for (const item of FIELD_CHECKS) {
    stroke(doc, INK);
    doc.setLineWidth(0.8);
    doc.rect(LEFT, y - 8, 9, 9, "S");
    doc.text(item, LEFT + 18, y);
    y += 20;
  }
  y = 640;
  const fields = [
    ["INSPECTOR", LEFT],
    ["DATE", 320],
    ["FIELD PITCH", LEFT],
    ["LAYERS", 320],
  ] as const;
  fields.forEach(([label, x], index) => {
    const row = index < 2 ? y : y + 36;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    paint(doc, MUTED);
    doc.text(label, x, row);
    rule(doc, x, x + 220, row + 16, INK, 0.6);
  });
  drawFooter(doc, input, 8);
}

function termsPage(doc: Pdf, input: RoofMeasurePdfInput) {
  doc.addPage();
  drawHeader(doc, input);
  const y = drawSection(doc, "09", "TERMS", "");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  paint(doc, INK);
  const company = input.companyName || "The contractor";
  const body = `${company} provides this report for estimating and claim documentation. ${company} makes no warranty of any kind, express or implied, as to the accuracy, completeness or fitness for a particular purpose of the measurements in this report. Measurements are derived from aerial imagery and the drawing on this report. Verify them on site before material is ordered or work begins.`;
  doc.text(doc.splitTextToSize(body, RIGHT - LEFT), LEFT, y);
  doc.setFontSize(9);
  paint(doc, MUTED);
  const office = [company, input.companyAddress, websiteLabel(input.companyWebsite)].filter(Boolean).join(" · ");
  doc.text(doc.splitTextToSize(office, RIGHT - LEFT), LEFT, y + 78);
  drawFooter(doc, input, 9);
}

export async function renderRoofMeasurePdf(input: RoofMeasurePdfInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" }) as unknown as Pdf;
  const report = buildRoofReport(input.drawing);
  coverPage(doc, input, report);
  aerialPage(doc, input);
  lengthPage(doc, input, report);
  areaPage(doc, input, report);
  indexPage(doc, input, report);
  wastePage(doc, input, report);
  materialPage(doc, input, report);
  fieldPage(doc, input);
  termsPage(doc, input);
  return doc.output("arraybuffer");
}

export async function downloadRoofMeasurePdf(input: RoofMeasurePdfInput) {
  const bytes = await renderRoofMeasurePdf(input);
  const { downloadBlob } = await import("@/lib/share");
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(new Uint8Array(bytes));
  const slug = (input.jobCode || input.street || "roof").replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "roof";
  downloadBlob(new Blob([copy], { type: "application/pdf" }), `${slug}-roof-measurement.pdf`);
}
