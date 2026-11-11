import type { CompanySettings } from "@/lib/types";
import { formatCompanyAddress, initials } from "@/lib/format";
import { loadLogoForPdf } from "@/lib/letterhead-pdf";
import { downloadBlob } from "@/lib/share";
import {
  laborWarrantyContactLine,
  laborWarrantyDateLabel,
  laborWarrantyFilename,
  laborWarrantyFooterLine,
  laborWarrantySections,
  type LaborWarranty,
  type LaborWarrantySection,
} from "@/lib/labor-warranty";

type RGB = [number, number, number];

const RED: RGB = [215, 28, 39];
const INK: RGB = [20, 20, 20];
const MUTED: RGB = [90, 90, 90];
const RULE: RGB = [28, 28, 28];
const CARD: RGB = [242, 242, 242];

const OUTER = 16;
const INNER = 21;
const INSET = 36;

type Doc = {
  setFont: (face: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  setFillColor: (r: number, g?: number, b?: number) => void;
  setDrawColor: (r: number, g?: number, b?: number) => void;
  setLineWidth: (width: number) => void;
  text: (text: string | string[], x: number, y: number, options?: { align?: "left" | "right" | "center" }) => void;
  splitTextToSize: (text: string, width: number) => string[];
  getTextWidth: (text: string) => number;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string) => void;
  addPage: () => void;
  setPage: (page: number) => void;
  getNumberOfPages: () => number;
  addImage: (imageData: string, format: string, x: number, y: number, w: number, h: number) => void;
  output: (type: "blob") => Blob;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
};

function pdfSafe(value: string) {
  return String(value ?? "")
    .replace(/\u2022/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\u0000-\u00FF]/g, "");
}

async function createDoc() {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const rawText = doc.text.bind(doc);
  const rawWidth = doc.getTextWidth.bind(doc);
  const rawSplit = doc.splitTextToSize.bind(doc);
  doc.text = ((text: string | string[], x: number, y: number, options?: { align?: "left" | "right" | "center" }) => {
    if (Array.isArray(text)) return rawText(text.map((line) => pdfSafe(line)), x, y, options);
    return rawText(pdfSafe(text), x, y, options);
  }) as typeof doc.text;
  doc.getTextWidth = ((text: string) => rawWidth(pdfSafe(text))) as typeof doc.getTextWidth;
  doc.splitTextToSize = ((text: string, size: number) => rawSplit(pdfSafe(text), size)) as typeof doc.splitTextToSize;
  return doc as unknown as Doc;
}

function paint(doc: Doc, color: RGB) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function fill(doc: Doc, color: RGB) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function stroke(doc: Doc, color: RGB) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function pageWidth(doc: Doc) {
  return doc.internal.pageSize.getWidth();
}

function pageHeight(doc: Doc) {
  return doc.internal.pageSize.getHeight();
}

function contentBottom(doc: Doc) {
  return pageHeight(doc) - 58;
}

function linesOf(doc: Doc, value: string, width: number) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const lines = doc.splitTextToSize(trimmed, width);
  return (Array.isArray(lines) ? lines : [lines]).map((line) => String(line)).filter((line) => line.trim());
}

function drawFrame(doc: Doc) {
  const width = pageWidth(doc);
  const height = pageHeight(doc);
  stroke(doc, [0, 0, 0]);
  doc.setLineWidth(2.6);
  doc.rect(OUTER, OUTER, width - OUTER * 2, height - OUTER * 2);
  doc.setLineWidth(0.6);
  doc.rect(INNER, INNER, width - INNER * 2, height - INNER * 2);
  stroke(doc, RED);
  doc.setLineWidth(3.2);
  doc.line(OUTER, OUTER, width - OUTER, OUTER);
}

function ensure(doc: Doc, y: number, needed: number) {
  if (y + needed <= contentBottom(doc)) return y;
  doc.addPage();
  drawFrame(doc);
  return 48;
}

function writeLines(doc: Doc, lines: string[], x: number, y: number, step: number) {
  for (const line of lines) {
    doc.text(line, x, y);
    y += step;
  }
  return y;
}

async function drawHeader(doc: Doc, company: CompanySettings) {
  const width = pageWidth(doc);
  const right = width - INSET;
  const titleWidth = 158;
  const logo = company.logoUrl?.trim() ? await loadLogoForPdf(company.logoUrl) : null;
  let textX = INSET;
  let blockBottom = 46;

  if (logo) {
    const max = 40;
    const scale = Math.min(max / logo.width, max / logo.height, 46 / logo.width);
    const w = logo.width * scale;
    const h = logo.height * scale;
    doc.addImage(logo.data, logo.format, INSET, 40, w, h);
    textX = INSET + w + 10;
    blockBottom = 40 + h;
  } else {
    const mark = initials(company.name) || "TR";
    fill(doc, RED);
    doc.roundedRect(INSET, 40, 36, 36, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mark.length > 2 ? 8 : 12);
    paint(doc, [255, 255, 255]);
    doc.text(mark, INSET + 18, 62, { align: "center" });
    textX = INSET + 46;
    blockBottom = 76;
  }

  const nameWidth = Math.max(120, right - textX - titleWidth - 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  paint(doc, INK);
  const nameLines = linesOf(doc, company.name || "Company", nameWidth);
  let y = 52;
  y = writeLines(doc, nameLines.length ? nameLines : ["Company"], textX, y, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  paint(doc, MUTED);
  const address = formatCompanyAddress(company);
  const contact = laborWarrantyContactLine(company);
  for (const line of [address, contact].filter(Boolean)) {
    const wrapped = linesOf(doc, line, nameWidth);
    y = writeLines(doc, wrapped, textX, y + 1, 11);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  paint(doc, INK);
  doc.text("LIFETIME LABOR &", right, 52, { align: "right" });
  doc.text("MATERIAL WARRANTY", right, 68, { align: "right" });

  const ruleY = Math.max(y + 8, blockBottom + 8, 84);
  stroke(doc, RULE);
  doc.setLineWidth(0.9);
  doc.line(INSET, ruleY, right, ruleY);
  return ruleY + 12;
}

function measureValue(doc: Doc, value: string, width: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const lines = linesOf(doc, value, width);
  return { lines, height: 11 + Math.max(1, lines.length) * 13 + 8 };
}

function drawValue(doc: Doc, label: string, value: string, x: number, y: number, width: number, rowHeight: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  paint(doc, MUTED);
  doc.text(label, x, y);
  const measured = measureValue(doc, value, width);
  const lineY = y + rowHeight - 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  paint(doc, INK);
  let textY = lineY - 8 - Math.max(0, measured.lines.length - 1) * 13;
  for (const line of measured.lines) {
    doc.text(line, x, textY);
    textY += 13;
  }
  stroke(doc, RULE);
  doc.setLineWidth(0.7);
  doc.line(x, lineY, x + width, lineY);
}

function drawFields(doc: Doc, y: number, warranty: LaborWarranty) {
  const width = pageWidth(doc) - INSET * 2;
  const gap = 18;
  const col = (width - 24 - gap) / 2;
  const leftX = INSET + 12;
  const rightX = leftX + col + gap;
  const install = laborWarrantyDateLabel(warranty.installDate);
  const rowOne = Math.max(
    measureValue(doc, warranty.ownerName, col).height,
    measureValue(doc, warranty.shingle, col).height,
  );
  const rowTwo = Math.max(measureValue(doc, install, col).height, measureValue(doc, warranty.projectManager, col).height);
  const boxHeight = 14 + rowOne + 12 + rowTwo + 10;
  fill(doc, CARD);
  doc.roundedRect(INSET, y, width, boxHeight, 5, 5, "F");
  const firstY = y + 18;
  drawValue(doc, "PROPERTY OWNER", warranty.ownerName, leftX, firstY, col, rowOne);
  drawValue(doc, "SHINGLE TYPE & COLOR", warranty.shingle, rightX, firstY, col, rowOne);
  const secondY = firstY + rowOne + 12;
  drawValue(doc, "INSTALL DATE", install, leftX, secondY, col, rowTwo);
  drawValue(doc, "PROJECT MANAGER", warranty.projectManager, rightX, secondY, col, rowTwo);
  return y + boxHeight + 14;
}

function writeClause(doc: Doc, y: number, x: number, width: number, prefix: string, body: string) {
  const size = 8.5;
  const leading = 11;
  const prefixText = prefix ? `${prefix}  ` : "";
  doc.setFontSize(size);
  doc.setFont("helvetica", "bold");
  const prefixWidth = prefixText ? doc.getTextWidth(prefixText) : 0;
  doc.setFont("helvetica", "normal");
  const lines = linesOf(doc, body, Math.max(40, width - prefixWidth));
  const drawn = lines.length ? lines : [""];
  for (let index = 0; index < drawn.length; index++) {
    y = ensure(doc, y, leading);
    paint(doc, INK);
    if (index === 0 && prefixText) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      doc.text(prefixText, x, y);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    if (drawn[index]) doc.text(drawn[index], x + prefixWidth, y);
    y += leading;
  }
  return y;
}

function drawClauses(doc: Doc, y: number, sections: LaborWarrantySection[]) {
  const width = pageWidth(doc) - INSET * 2;
  for (const section of sections) {
    y = writeClause(doc, y, INSET, width, `${section.number}.`, section.text);
    y += 1;
    for (const item of section.items) {
      y = writeClause(doc, y, INSET + 14, width - 14, `${item.letter}.`, item.text);
    }
    y += 5;
  }
  return y;
}

function drawSignature(doc: Doc, x: number, y: number, width: number, name: string, captions: string[]) {
  const signed = name.trim();
  let cursor = y;
  if (signed) {
    doc.setFont("times", "italic");
    doc.setFontSize(14);
    paint(doc, INK);
    const lines = linesOf(doc, signed, width);
    for (const line of lines) {
      doc.text(line, x, cursor);
      cursor += 15;
    }
  } else {
    cursor += 16;
  }
  stroke(doc, RULE);
  doc.setLineWidth(0.7);
  doc.line(x, cursor, x + width, cursor);
  cursor += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, MUTED);
  for (const caption of captions) {
    const wrapped = linesOf(doc, caption, width);
    for (const line of wrapped) {
      doc.text(line, x, cursor);
      cursor += 10;
    }
  }
}

function stampFooter(doc: Doc, company: CompanySettings) {
  const pages = doc.getNumberOfPages();
  const width = pageWidth(doc);
  const height = pageHeight(doc);
  const left = laborWarrantyFooterLine(company);
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const y = height - 36;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, MUTED);
    if (left) doc.text(left, INSET, y);
    doc.text("Lifetime Labor & Material Warranty", width - INSET, y, { align: "right" });
  }
}

export async function buildLaborWarrantyPdf(input: { warranty: LaborWarranty; company: CompanySettings }) {
  const warranty = input.warranty;
  const company: CompanySettings = {
    ...input.company,
    name: warranty.companyName.trim() || input.company.name,
  };
  const doc = await createDoc();
  drawFrame(doc);
  let y = await drawHeader(doc, company);
  y = drawFields(doc, y, warranty);
  y = drawClauses(doc, y, laborWarrantySections(company.name));
  y += 22;
  y = ensure(doc, y, 64);
  const col = (pageWidth(doc) - INSET * 2 - 28) / 2;
  const companyCaption = company.name.trim() ? `· ${company.name.trim()}` : "";
  drawSignature(doc, INSET, y, col, "", companyCaption ? [companyCaption] : []);
  drawSignature(doc, INSET + col + 28, y, col, warranty.signedBy, [
    "Signed by the company representative",
    "(project manager or office).",
  ]);
  stampFooter(doc, company);
  return doc.output("blob");
}

export async function downloadLaborWarrantyPdf(input: { warranty: LaborWarranty; company: CompanySettings }) {
  const blob = await buildLaborWarrantyPdf(input);
  const name = laborWarrantyFilename(input.warranty.jobName);
  downloadBlob(blob, name);
  return { blob, name };
}
