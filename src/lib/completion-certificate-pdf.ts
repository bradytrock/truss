import type { CompanySettings } from "@/lib/types";
import { writePdfLetterhead } from "@/lib/letterhead-pdf";
import { downloadBlob } from "@/lib/share";
import {
  completionCertificateDateLabel,
  completionCertificateFilename,
  completionCertificateStatement,
  type CompletionCertificate,
} from "@/lib/completion-certificate";

type Doc = {
  setFont: (face: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  setDrawColor: (r: number, g?: number, b?: number) => void;
  setLineWidth: (width: number) => void;
  text: (text: string | string[], x: number, y: number, options?: { align?: "left" | "right" | "center" }) => void;
  splitTextToSize: (text: string, width: number) => string[];
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  addPage: () => void;
  setPage: (page: number) => void;
  getNumberOfPages: () => number;
  addImage: (
    imageData: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => void;
  output: (type: "blob") => Blob;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
};

const INSET = 48;
const RED = { r: 196, g: 18, b: 28 };
const INK = { r: 28, g: 28, b: 28 };
const MUTED = { r: 110, g: 110, b: 110 };

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

function pageWidth(doc: Doc) {
  return doc.internal.pageSize.getWidth();
}

function pageHeight(doc: Doc) {
  return doc.internal.pageSize.getHeight();
}

function contentBottom(doc: Doc) {
  return pageHeight(doc) - 58;
}

function drawFrame(doc: Doc) {
  const width = pageWidth(doc);
  const height = pageHeight(doc);
  doc.setDrawColor(RED.r, RED.g, RED.b);
  doc.setLineWidth(2);
  doc.rect(18, 18, width - 36, height - 36);
  doc.setDrawColor(INK.r, INK.g, INK.b);
  doc.setLineWidth(0.6);
  doc.rect(24, 24, width - 48, height - 48);
}

function ensure(doc: Doc, y: number, needed: number) {
  if (y + needed <= contentBottom(doc)) return y;
  doc.addPage();
  drawFrame(doc);
  return 52;
}

function writeWrapped(doc: Doc, text: string, x: number, y: number, width: number, step: number) {
  const lines = doc.splitTextToSize(text.trim() || " ", width);
  const pieces = (Array.isArray(lines) ? lines : [lines]).flatMap((piece) => String(piece).split("\n"));
  for (const line of pieces) {
    y = ensure(doc, y, step);
    if (line.trim()) doc.text(line, x, y);
    y += step;
  }
  return y;
}

function fieldBlockHeight(doc: Doc, value: string, width: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(value.trim() || " ", width);
  const count = Math.max(1, (Array.isArray(lines) ? lines : [lines]).length);
  return 12 + count * 14;
}

function drawField(doc: Doc, label: string, value: string, x: number, y: number, width: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(INK.r, INK.g, INK.b);
  return writeWrapped(doc, value.trim(), x, y + 14, width, 14);
}

function drawPair(
  doc: Doc,
  y: number,
  left: { label: string; value: string },
  right: { label: string; value: string },
) {
  const width = pageWidth(doc);
  const col = (width - INSET * 2 - 24) / 2;
  const height = Math.max(fieldBlockHeight(doc, left.value, col), fieldBlockHeight(doc, right.value, col));
  y = ensure(doc, y, height + 12);
  drawField(doc, left.label, left.value, INSET, y, col);
  drawField(doc, right.label, right.value, INSET + col + 24, y, col);
  return y + height + 8;
}

function writeSection(doc: Doc, y: number, label: string, body: string) {
  const width = pageWidth(doc) - INSET * 2;
  y = ensure(doc, y, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(label, INSET, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(INK.r, INK.g, INK.b);
  y = writeWrapped(doc, body.trim(), INSET, y, width, 14);
  return y + 10;
}

function drawSignature(doc: Doc, x: number, y: number, width: number, label: string, name: string, caption: string) {
  const signed = name.trim();
  if (signed) {
    doc.setFont("times", "italic");
    doc.setFontSize(16);
    doc.setTextColor(INK.r, INK.g, INK.b);
    const lines = doc.splitTextToSize(signed, width);
    doc.text(lines, x, y);
    y += (Array.isArray(lines) ? lines.length : 1) * 16;
  } else {
    y += 18;
  }
  doc.setDrawColor(INK.r, INK.g, INK.b);
  doc.setLineWidth(0.7);
  doc.line(x, y, x + width, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(label, x, y + 12);
  if (caption.trim()) doc.text(caption, x, y + 24);
}

function stampFooter(doc: Doc, companyName: string) {
  const pages = doc.getNumberOfPages();
  const width = pageWidth(doc);
  const height = pageHeight(doc);
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    const y = height - 36;
    doc.text(companyName.trim() || "Certificate of completion", INSET, y);
    doc.text("Certificate of completion", width / 2, y, { align: "center" });
    doc.text(`${page} / ${pages}`, width - INSET, y, { align: "right" });
  }
}

export async function buildCompletionCertificatePdf(input: {
  certificate: CompletionCertificate;
  company: CompanySettings;
}) {
  const certificate = input.certificate;
  const company: CompanySettings = {
    ...input.company,
    name: certificate.companyName.trim() || input.company.name,
    licenseNumber: certificate.licenseNumber.trim(),
    phone: certificate.phone.trim(),
  };
  const doc = await createDoc();
  drawFrame(doc);
  const width = pageWidth(doc);
  const contentWidth = width - INSET * 2;
  let y = await writePdfLetterhead(doc, company, 52, INSET, { showContact: true });

  y = ensure(doc, y, 36);
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.setTextColor(RED.r, RED.g, RED.b);
  doc.text("CERTIFICATE OF COMPLETION", width / 2, y, { align: "center" });
  y += 8;
  doc.setDrawColor(RED.r, RED.g, RED.b);
  doc.setLineWidth(0.8);
  doc.line(INSET, y, width - INSET, y);
  y += 22;

  y = drawPair(
    doc,
    y,
    { label: "PROPERTY OWNER", value: certificate.ownerName },
    { label: "JOB", value: [certificate.jobName, certificate.jobCode].filter(Boolean).join(" · ") },
  );
  y = ensure(doc, y, fieldBlockHeight(doc, certificate.propertyAddress, contentWidth) + 8);
  y = drawField(doc, "PROPERTY", certificate.propertyAddress, INSET, y, contentWidth) + 8;
  y = drawPair(
    doc,
    y,
    { label: "START", value: completionCertificateDateLabel(certificate.startDate) },
    { label: "COMPLETION", value: completionCertificateDateLabel(certificate.completionDate) },
  );
  y = drawPair(
    doc,
    y,
    { label: "PERMIT", value: certificate.permitNumber },
    { label: "CONTRACT AMOUNT", value: certificate.contractAmount },
  );

  y = writeSection(doc, y, "SCOPE OF WORK", certificate.scope);
  if (certificate.materials.trim()) y = writeSection(doc, y, "MATERIALS", certificate.materials);
  if (certificate.warranty.trim()) y = writeSection(doc, y, "WARRANTY", certificate.warranty);
  if (certificate.notes.trim()) y = writeSection(doc, y, "NOTES", certificate.notes);

  const statement = completionCertificateStatement(certificate);
  y = ensure(doc, y, 48);
  doc.setFont("times", "italic");
  doc.setFontSize(11);
  doc.setTextColor(INK.r, INK.g, INK.b);
  y = writeWrapped(doc, statement, INSET, y, contentWidth, 15);
  y += 18;

  const col = (contentWidth - 28) / 2;
  y = ensure(doc, y, 78);
  const completion = completionCertificateDateLabel(certificate.completionDate);
  drawSignature(
    doc,
    INSET,
    y,
    col,
    "Property owner",
    certificate.ownerSignature,
    completion ? `Date ${completion}` : "Date",
  );
  const prepared = certificate.preparedBy.trim();
  const contractor = certificate.contractorSignature.trim();
  const dateCaption = completion ? `Date ${completion}` : "Date";
  drawSignature(
    doc,
    INSET + col + 28,
    y,
    col,
    "Contractor",
    contractor,
    prepared && prepared !== contractor ? `Prepared by ${prepared}` : dateCaption,
  );

  stampFooter(doc, company.name);
  return doc.output("blob");
}

export async function downloadCompletionCertificatePdf(input: {
  certificate: CompletionCertificate;
  company: CompanySettings;
}) {
  const blob = await buildCompletionCertificatePdf(input);
  const name = completionCertificateFilename(input.certificate.jobName);
  downloadBlob(blob, name);
  return { blob, name };
}
