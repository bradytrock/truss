import type { CompanySettings, Estimate, EstimateLine, EstimateSignatureEvent, Invoice, InvoiceLine, JobPhoto, Payment } from "@/lib/types";
import { companyEstimateTermsFor } from "@/lib/contract-types";
import { estimateTotals, groupEstimateLines, lineAmount, lineIncluded, toClientFacingProposal, totalsForPackage } from "@/lib/estimate-totals";
import {
  gbbPrintSections,
  isGbbEstimate,
  listEstimateOptions,
  scopedEstimateLines,
} from "@/lib/estimate-packages";
import { formatDate, formatMoney, formatDateTimeUtc } from "@/lib/format";
import { formatJobSite } from "@/lib/leads";
import { photosForEstimateLine } from "@/lib/estimate-line-photos";
import { writePdfLetterhead, loadLogoForPdf } from "@/lib/letterhead-pdf";
import { invoiceBalance, invoiceTotal, lineAmount as invoiceLineAmount, paidOnInvoice } from "@/lib/money";
import { downloadBlob } from "@/lib/share";
import { isSignaturePng } from "@/lib/estimate-signature";
import { estimateSignatureLines } from "@/lib/estimate-signers";
import {
  signatureEventLabel,
  signerRoleLabel,
} from "@/lib/estimate-signature-audit";
import {
  filledEstimateTerms,
  filledInvoiceTerms,
  liveEstimateTerms,
  liveInvoiceTerms,
  parseTermsSections,
} from "@/lib/document-terms";
import type { ProjectManagerContact } from "@/lib/document-owner";
import {
  parseLineFormat,
  lineHeading,
  shouldShowLineDescription,
  type FormatBlock,
  type InlineRun,
} from "@/lib/line-format";
import {
  PAPER_CARD,
  PAPER_INK,
  PAPER_INSET,
  PAPER_LINE,
  PAPER_MUTED,
  PAPER_RED,
  paperAuthorizationCopy,
  paperCompanyLines,
  paperEstimateMeta,
  paperFooterLeft,
  paperInvoiceMeta,
  paperIssuedAt,
  paperKindLabel,
  paperQtyLabel,
  paperRescissionCopy,
  paperSiteTitle,
  type PaperKind,
  type PaperMetaItem,
} from "@/lib/document-paper";

type Doc = {
  setFont: (face: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  setFillColor: (r: number, g?: number, b?: number) => void;
  text: (text: string | string[], x: number, y: number, options?: { align?: "left" | "right" | "center" }) => void;
  splitTextToSize: (text: string, width: number) => string[];
  getTextWidth: (text: string) => number;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string) => void;
  setDrawColor: (r: number, g?: number, b?: number) => void;
  setLineWidth: (width: number) => void;
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

type EnsureFn = (y: number, needed: number) => number;
type PdfInk = Awaited<ReturnType<typeof loadLogoForPdf>>;
type AuthLine = ReturnType<typeof estimateSignatureLines>[number];

const TERMS_BODY_SIZE = 8.5;
const TERMS_LINE = 11;

function pdfSafe(value: string) {
  return String(value ?? "")
    .replace(/\u2192/g, "->")
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

function contentRight(doc: Doc) {
  return pageWidth(doc) - PAPER_INSET;
}

function contentBottom(doc: Doc) {
  return pageHeight(doc) - 56;
}

function ink(doc: Doc, color: { r: number; g: number; b: number }) {
  doc.setTextColor(color.r, color.g, color.b);
}

function draw(doc: Doc, color: { r: number; g: number; b: number }) {
  doc.setDrawColor(color.r, color.g, color.b);
}

function fill(doc: Doc, color: { r: number; g: number; b: number }) {
  doc.setFillColor(color.r, color.g, color.b);
}

function writeRedRule(doc: Doc) {
  fill(doc, PAPER_RED);
  doc.rect(0, 0, pageWidth(doc), 5, "F");
}

function wrapText(doc: Doc, text: string, width: number, fontSize = 10, style: "normal" | "bold" = "normal") {
  doc.setFont("helvetica", style);
  doc.setFontSize(fontSize);
  const paragraphs = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const wrapped = doc.splitTextToSize(paragraph, width);
    const pieces = (Array.isArray(wrapped) ? wrapped : [wrapped]).flatMap((piece) =>
      String(piece).split("\n"),
    );
    lines.push(...pieces);
  }
  return lines;
}

function writeParagraph(
  doc: Doc,
  text: string,
  y: number,
  width: number,
  fontSize: number,
  ensure: EnsureFn,
) {
  const lines = wrapText(doc, text, width, fontSize);
  const lineHeight = fontSize <= 8 ? 9.5 : 13;
  const blankHeight = fontSize <= 8 ? 6 : 8;
  const color = { r: 40, g: 40, b: 40 };
  for (const line of lines) {
    y = ensure(y, line ? lineHeight + 2 : 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    ink(doc, color);
    if (line) doc.text(line, PAPER_INSET, y);
    y += line ? lineHeight : blankHeight;
  }
  return y + (fontSize <= 8 ? 6 : 8);
}

type PdfWord = { text: string; bold: boolean; spaceAfter: boolean; newline: boolean };

function flattenRuns(runs: InlineRun[]): PdfWord[] {
  const words: PdfWord[] = [];
  for (const run of runs) {
    const pieces = run.text.split(/(\n+)/);
    for (const piece of pieces) {
      if (!piece) continue;
      if (/^\n+$/.test(piece)) {
        words.push({ text: "", bold: Boolean(run.bold), spaceAfter: false, newline: true });
        continue;
      }
      const tokens = piece.split(/(\s+)/);
      for (const token of tokens) {
        if (!token) continue;
        if (/^\s+$/.test(token)) {
          if (words.length) words[words.length - 1].spaceAfter = true;
          continue;
        }
        words.push({ text: token, bold: Boolean(run.bold), spaceAfter: false, newline: false });
      }
    }
  }
  return words;
}

function piecesThatFit(doc: Doc, text: string, maxWidth: number) {
  if (maxWidth <= 0 || doc.getTextWidth(text) <= maxWidth) return [text];
  const parts: string[] = [];
  let chunk = "";
  for (const char of text) {
    const next = chunk + char;
    if (chunk && doc.getTextWidth(next) > maxWidth) {
      parts.push(chunk);
      chunk = char;
    } else {
      chunk = next;
    }
  }
  if (chunk) parts.push(chunk);
  return parts.length ? parts : [text];
}

function writeFormattedRuns(
  doc: Doc,
  runs: InlineRun[],
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  fontSize: number,
  ensure: EnsureFn,
) {
  const words = flattenRuns(runs);
  if (!words.length) return startY + lineHeight;
  let y = startY;
  let cx = x;
  let spacePending = false;
  const paintFont = (bold: boolean) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
  };
  for (const word of words) {
    if (word.newline) {
      y = ensure(y + lineHeight, lineHeight);
      cx = x;
      spacePending = false;
      continue;
    }
    paintFont(word.bold);
    const parts = piecesThatFit(doc, word.text, maxWidth);
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index] ?? "";
      const gap = index === 0 && spacePending ? doc.getTextWidth(" ") : 0;
      const width = doc.getTextWidth(part);
      if ((cx > x && cx + gap + width > x + maxWidth) || index > 0) {
        y = ensure(y + lineHeight, lineHeight);
        cx = x;
        spacePending = false;
        paintFont(word.bold);
      } else if (gap) {
        cx += gap;
      }
      doc.text(part, cx, y);
      cx += width;
    }
    spacePending = word.spaceAfter;
  }
  return y + lineHeight;
}

function writeFormattedText(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options?: {
    fontSize?: number;
    lineHeight?: number;
    firstParagraphBold?: boolean;
    color?: { r: number; g: number; b: number };
    ensure?: EnsureFn;
  },
) {
  const blocks = parseLineFormat(text);
  if (!blocks.length) return y;
  const fontSize = options?.fontSize ?? 9;
  const lineHeight = options?.lineHeight ?? (fontSize <= 9 ? 11 : 12);
  const baseEnsure = options?.ensure ?? ((next: number) => next);
  const color = options?.color;
  const ensure: EnsureFn = (next, needed) => {
    const yAfter = baseEnsure(next, needed);
    if (color) ink(doc, color);
    doc.setFontSize(fontSize);
    return yAfter;
  };
  let ordered = 0;
  doc.setFontSize(fontSize);
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index] as FormatBlock;
    y = ensure(y, lineHeight + 2);
    if (block.type === "li") {
      if (block.ordered) ordered += 1;
      else ordered = 0;
      const marker = block.ordered ? `${ordered}.` : "-";
      const indent = block.ordered ? 16 : 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      doc.text(marker, x, y);
      y = writeFormattedRuns(doc, block.runs, x + indent, y, maxWidth - indent, lineHeight, fontSize, ensure);
      continue;
    }
    ordered = 0;
    const runs =
      options?.firstParagraphBold && index === 0
        ? block.runs.map((run) => ({ ...run, bold: true }))
        : block.runs;
    y = writeFormattedRuns(doc, runs, x, y, maxWidth, lineHeight, fontSize, ensure);
  }
  return y;
}

function writeCheckbox(doc: Doc, x: number, y: number) {
  draw(doc, PAPER_LINE);
  doc.setLineWidth(0.9);
  doc.rect(x, y - 8, 10, 10, "S");
}

function writeSignatureCertificate(
  doc: Doc,
  estimateNumber: string,
  events: EstimateSignatureEvent[],
  startY: number,
) {
  const trail = events.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!trail.length) return startY;
  let y = startY;
  const right = contentRight(doc);
  const fallbackEnsure: EnsureFn = (next, needed) => {
    if (next + needed < contentBottom(doc)) return next;
    doc.addPage();
    return 54;
  };
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("SIGNATURE RECORD", 54, y);
  y += 16;
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor(28, 28, 28);
  doc.text(`Certificate of completion — ${estimateNumber}`, 54, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  y = writeParagraph(
    doc,
    "This is the office audit trail for the electronic signatures on this proposal. Each homeowner received a unique link. The IP address, device, time, consent, and SHA-256 hash of the proposal at sign time are stored with the drawing. Do not send this page to the homeowner.",
    y,
    504,
    9,
    fallbackEnsure,
  );
  y += 8;
  for (const event of trail) {
    y = fallbackEnsure(y, 88);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(28, 28, 28);
    const who = [signatureEventLabel(event.kind), event.signerName, event.signerRole ? signerRoleLabel(event.signerRole) : ""]
      .filter(Boolean)
      .join(" · ");
    doc.text(who, 54, y);
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(70, 70, 70);
    const rows = [
      formatDateTimeUtc(event.createdAt),
      event.capturedInOffice ? "Collected in the office" : "",
      event.ipAddress ? `IP ${event.ipAddress}` : "",
      event.timeZone ? `Time zone ${event.timeZone}` : "",
      event.deliveryChannel === "sms" && event.deliveryTo ? `Texted to ${event.deliveryTo}` : "",
      event.tokenSuffix ? `Link …${event.tokenSuffix}` : "",
      event.documentSha256 ? `SHA-256 ${event.documentSha256}` : "",
      event.userAgent ? event.userAgent : "",
      event.consentText ? event.consentText : "",
    ].filter(Boolean);
    for (const row of rows) {
      const wrapped = wrapText(doc, row, right - 54, 8);
      y = fallbackEnsure(y, wrapped.length * 11 + 2);
      doc.text(wrapped, 54, y);
      y += wrapped.length * 11;
    }
    y += 10;
  }
  return y;
}

type PaperHeader = {
  kind: PaperKind;
  number: string;
  title: string;
};

function writeSlimHeader(doc: Doc, header: PaperHeader) {
  writeRedRule(doc);
  const right = contentRight(doc);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  ink(doc, PAPER_RED);
  doc.text(`${paperKindLabel(header.kind)}  ${header.number}`, PAPER_INSET, 28);
  doc.setFont("helvetica", "normal");
  ink(doc, PAPER_MUTED);
  doc.text(header.title, right, 28, { align: "right" });
  draw(doc, PAPER_LINE);
  doc.setLineWidth(0.6);
  doc.line(PAPER_INSET, 36, right, 36);
  return 54;
}

function createPager(doc: Doc, header: PaperHeader) {
  const startContinue = () => writeSlimHeader(doc, header);
  const ensure: EnsureFn = (y, needed) => {
    if (y + needed < contentBottom(doc)) return y;
    doc.addPage();
    return startContinue();
  };
  return {
    ensure,
    addPage() {
      doc.addPage();
      return startContinue();
    },
  };
}

async function writeCoverHeader(
  doc: Doc,
  company: CompanySettings,
  kind: PaperKind,
  number: string,
) {
  writeRedRule(doc);
  const right = contentRight(doc);
  const lines = paperCompanyLines(company);
  const logo = company.logoUrl?.trim() ? await loadLogoForPdf(company.logoUrl) : null;
  let textX = PAPER_INSET;
  let logoBottom = 20;
  if (logo) {
    const maxH = 32;
    const maxW = 56;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    doc.addImage(logo.data, logo.format, PAPER_INSET, 16, w, h);
    textX = PAPER_INSET + w + 10;
    logoBottom = 16 + h;
  }
  const kindLabel = paperKindLabel(kind);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const kindW = Math.max(doc.getTextWidth(kindLabel), 88);
  const textMax = Math.max(180, right - kindW - 16 - textX);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  ink(doc, PAPER_INK);
  doc.text(lines.name, textX, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  ink(doc, PAPER_MUTED);
  let next = 38;
  const detail = [...lines.address, lines.contact, lines.license].filter(Boolean);
  for (const line of detail) {
    const wrapped = doc.splitTextToSize(line, textMax);
    doc.text(wrapped, textX, next);
    next += (Array.isArray(wrapped) ? wrapped.length : 1) * 10;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  ink(doc, PAPER_INK);
  doc.text(kindLabel, right, 28, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  ink(doc, PAPER_RED);
  doc.text(number, right, 42, { align: "right" });
  const y = Math.max(next, logoBottom) + 12;
  draw(doc, PAPER_LINE);
  doc.setLineWidth(0.8);
  doc.line(PAPER_INSET, y - 6, right, y - 6);
  return y;
}

function writeSiteBlock(
  doc: Doc,
  site: ReturnType<typeof paperSiteTitle>,
  y: number,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  ink(doc, PAPER_INK);
  const title = doc.splitTextToSize(site.title, contentRight(doc) - PAPER_INSET);
  doc.text(title, PAPER_INSET, y);
  y += (Array.isArray(title) ? title.length : 1) * 16;
  if (site.locality) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    ink(doc, PAPER_MUTED);
    doc.text(site.locality, PAPER_INSET, y);
    y += 12;
  }
  return y + 8;
}

function writeMetaRow(doc: Doc, items: PaperMetaItem[], y: number) {
  const width = contentRight(doc) - PAPER_INSET;
  const col = width / Math.max(items.length, 1);
  items.forEach((item, index) => {
    const x = PAPER_INSET + index * col;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    ink(doc, PAPER_MUTED);
    doc.text(item.label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    ink(doc, PAPER_INK);
    doc.text(item.value, x, y + 12);
  });
  return y + 22;
}

function writePartyCards(
  doc: Doc,
  left: { label: string; name: string; lines: string[] },
  right: { label: string; name: string; lines: string[] } | null,
  y: number,
) {
  const rightEdge = contentRight(doc);
  const gap = 16;
  const colW = right
    ? (rightEdge - PAPER_INSET - gap) / 2
    : rightEdge - PAPER_INSET;
  const cards = right ? [left, right] : [left];
  const inner = colW - 4;
  let bottom = y;
  cards.forEach((card, index) => {
    const x = PAPER_INSET + index * (colW + gap);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    ink(doc, PAPER_MUTED);
    doc.text(card.label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    ink(doc, PAPER_INK);
    const name = doc.splitTextToSize(card.name || "—", inner);
    doc.text(name, x, y + 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    ink(doc, PAPER_MUTED);
    let cy = y + 13 + (Array.isArray(name) ? name.length : 1) * 11;
    for (const line of card.lines.filter(Boolean).slice(0, 2)) {
      const wrapped = doc.splitTextToSize(line, inner);
      doc.text(wrapped, x, cy);
      cy += (Array.isArray(wrapped) ? wrapped.length : 1) * 10;
    }
    bottom = Math.max(bottom, cy);
  });
  draw(doc, { r: 220, g: 220, b: 220 });
  doc.setLineWidth(0.5);
  doc.line(PAPER_INSET, bottom + 6, rightEdge, bottom + 6);
  return bottom + 16;
}

type TableCols = {
  descX: number;
  descW: number;
  qtyX: number;
  unitX: number;
  rateX: number;
  amountX: number;
  hidePrices: boolean;
};

function tableCols(doc: Doc, hidePrices: boolean): TableCols {
  const right = contentRight(doc);
  if (hidePrices) {
    return {
      descX: PAPER_INSET,
      descW: right - PAPER_INSET - 92,
      qtyX: right - 48,
      unitX: right,
      rateX: right,
      amountX: right,
      hidePrices: true,
    };
  }
  return {
    descX: PAPER_INSET,
    descW: right - PAPER_INSET - 236,
    qtyX: right - 210,
    unitX: right - 164,
    rateX: right - 86,
    amountX: right - 6,
    hidePrices: false,
  };
}

function writeTableHeader(doc: Doc, cols: TableCols, y: number) {
  const right = contentRight(doc);
  fill(doc, PAPER_CARD);
  doc.rect(PAPER_INSET, y - 11, right - PAPER_INSET, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  ink(doc, PAPER_MUTED);
  doc.text("DESCRIPTION", cols.descX + 6, y);
  doc.text("QTY", cols.qtyX, y, { align: "right" });
  doc.text("UNIT", cols.unitX, y, { align: "right" });
  if (!cols.hidePrices) {
    doc.text("RATE", cols.rateX, y, { align: "right" });
    doc.text("AMOUNT", cols.amountX, y, { align: "right" });
  }
  return y + 16;
}

function writeMoneyCols(
  doc: Doc,
  cols: TableCols,
  y: number,
  qty: string,
  unit: string,
  rate: string,
  amount: string,
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  ink(doc, PAPER_INK);
  doc.text(qty, cols.qtyX, y, { align: "right" });
  doc.text(unit, cols.unitX, y, { align: "right" });
  if (!cols.hidePrices) {
    doc.text(rate, cols.rateX, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(amount, cols.amountX, y, { align: "right" });
  }
}

function writeTotalsStack(
  doc: Doc,
  rows: Array<[string, string]>,
  pill: { label: string; amount: string },
  y: number,
  ensure: EnsureFn,
) {
  const right = contentRight(doc);
  const boxLeft = right - 200;
  y = ensure(y, rows.length * 13 + 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  ink(doc, PAPER_MUTED);
  for (const [label, value] of rows) {
    doc.text(label, boxLeft, y);
    doc.text(value, right, y, { align: "right" });
    y += 13;
  }
  y += 4;
  fill(doc, PAPER_INK);
  doc.roundedRect(boxLeft, y - 14, 200, 24, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(pill.label, boxLeft + 10, y + 2);
  doc.text(pill.amount, right - 10, y + 2, { align: "right" });
  return y + 18;
}

function writeSignCta(doc: Doc, y: number, page: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  ink(doc, PAPER_RED);
  doc.text(`Sign on page ${page} ->`, contentRight(doc), y, { align: "right" });
}

function repeatingTableEnsure(doc: Doc, ensure: EnsureFn, cols: TableCols): EnsureFn {
  return (y, needed) => {
    const before = doc.getNumberOfPages();
    const next = ensure(y, needed);
    if (doc.getNumberOfPages() === before) return next;
    return writeTableHeader(doc, cols, next);
  };
}

function stampFooters(doc: Doc, company: CompanySettings) {
  const left = paperFooterLeft(company);
  const pages = doc.getNumberOfPages();
  const y = pageHeight(doc) - 28;
  const right = contentRight(doc);
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    draw(doc, { r: 220, g: 220, b: 220 });
    doc.setLineWidth(0.5);
    doc.line(PAPER_INSET, y - 10, right, y - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    ink(doc, PAPER_MUTED);
    doc.text(left, PAPER_INSET, y);
    doc.text(`Page ${page} of ${pages}`, right, y, { align: "right" });
  }
}

type TermPiece = { kind: "heading" | "line" | "gap"; text: string };

function termPieces(doc: Doc, terms: string, colW: number): TermPiece[] {
  const sections = parseTermsSections(terms);
  const source = sections.length
    ? sections
    : [{ heading: "", body: terms, key: "all", payment: false, marked: false }];
  const pieces: TermPiece[] = [];
  for (const section of source) {
    if (section.heading.trim()) {
      for (const headLine of wrapText(doc, section.heading.trim(), colW, 8.5, "bold")) {
        if (headLine) pieces.push({ kind: "heading", text: headLine });
      }
    }
    for (const line of wrapText(doc, section.body, colW, TERMS_BODY_SIZE)) {
      pieces.push(line ? { kind: "line", text: line } : { kind: "gap", text: "" });
    }
    pieces.push({ kind: "gap", text: "" });
  }
  while (pieces.length && pieces[pieces.length - 1]?.kind === "gap") pieces.pop();
  return pieces;
}

function pieceHeight(piece: TermPiece) {
  if (piece.kind === "heading") return 13;
  if (piece.kind === "gap") return 6;
  return TERMS_LINE;
}

function writeTermPiece(doc: Doc, piece: TermPiece, x: number, y: number) {
  if (piece.kind === "heading") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    ink(doc, PAPER_INK);
    doc.text(piece.text, x, y);
    return;
  }
  if (piece.kind === "line") {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(TERMS_BODY_SIZE);
    ink(doc, { r: 45, g: 45, b: 45 });
    doc.text(piece.text, x, y);
  }
}

function writeTermsSections(
  doc: Doc,
  terms: string,
  startY: number,
  pager: ReturnType<typeof createPager>,
) {
  const gap = 20;
  const colW = (contentRight(doc) - PAPER_INSET - gap) / 2;
  const leftX = PAPER_INSET;
  const rightX = PAPER_INSET + colW + gap;
  const pieces = termPieces(doc, terms, colW);
  let col = 0;
  let y = startY;
  let colTop = startY;
  let leftBottom = startY;
  let rightBottom = startY;

  const xOf = () => (col === 0 ? leftX : rightX);
  const nextColumn = () => {
    if (col === 0) {
      leftBottom = y;
      col = 1;
      y = colTop;
      return;
    }
    rightBottom = y;
    colTop = pager.addPage();
    col = 0;
    y = colTop;
    leftBottom = colTop;
    rightBottom = colTop;
  };

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i] as TermPiece;
    const next = pieces[i + 1];
    const needed =
      piece.kind === "heading" && next ? pieceHeight(piece) + pieceHeight(next) : pieceHeight(piece);
    if (y + needed > contentBottom(doc)) nextColumn();
    writeTermPiece(doc, piece, xOf(), y);
    y += pieceHeight(piece);
  }
  if (col === 0) leftBottom = y;
  else rightBottom = y;
  return Math.max(leftBottom, rightBottom);
}

function writeInitials(doc: Doc, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  ink(doc, PAPER_MUTED);
  doc.text("INITIALS", PAPER_INSET, y);
  draw(doc, PAPER_LINE);
  doc.setLineWidth(0.7);
  doc.line(PAPER_INSET + 56, y + 1, PAPER_INSET + 140, y + 1);
  doc.line(PAPER_INSET + 156, y + 1, PAPER_INSET + 240, y + 1);
  return y + 20;
}

function signatureInkHeight(inkImage: PdfInk, colWidth: number) {
  if (!inkImage) return 48;
  return Math.min(44, (inkImage.height / Math.max(inkImage.width, 1)) * Math.min(200, colWidth));
}

function drawHomeownerLine(
  doc: Doc,
  line: AuthLine,
  image: PdfInk,
  x: number,
  y: number,
  width: number,
) {
  const dateW = 90;
  const sigW = width - dateW - 16;
  if (image) {
    const h = signatureInkHeight(image, sigW);
    doc.addImage(image.data, image.format, x, y, Math.min(200, sigW), h);
    y += h + 6;
  } else {
    y += 28;
  }
  draw(doc, { r: 200, g: 200, b: 200 });
  doc.line(x, y, x + sigW, y);
  doc.line(x + sigW + 16, y, x + width, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  ink(doc, PAPER_MUTED);
  doc.text(line.signedAt ? `Homeowner signature · ${formatDate(line.signedAt)}` : "Homeowner signature", x, y);
  doc.text("Date", x + sigW + 16, y);
  y += 18;
  draw(doc, { r: 200, g: 200, b: 200 });
  doc.line(x, y, x + sigW, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  ink(doc, PAPER_MUTED);
  doc.text(line.name || "Printed name", x, y);
  return y + 18;
}

async function writePaperAuthorization(
  doc: Doc,
  estimate: Parameters<typeof estimateSignatureLines>[0],
  names: {
    contractor?: string | null;
    primary: string;
    second?: string | null;
  },
  manager: ProjectManagerContact | null | undefined,
  companyName: string,
  totalLabel: string,
  y: number,
  ensure: EnsureFn,
) {
  const right = contentRight(doc);
  y = ensure(y, 220);
  const page = doc.getNumberOfPages();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  ink(doc, PAPER_INK);
  doc.text("AUTHORIZATION", PAPER_INSET, y);
  y += 18;
  fill(doc, PAPER_CARD);
  doc.roundedRect(PAPER_INSET, y, right - PAPER_INSET, 36, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  ink(doc, PAPER_MUTED);
  doc.text("CONTRACT TOTAL", PAPER_INSET + 12, y + 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  ink(doc, PAPER_INK);
  doc.text(totalLabel, right - 12, y + 24, { align: "right" });
  y += 50;
  y = writeParagraph(doc, paperAuthorizationCopy(companyName), y, right - PAPER_INSET, 9, ensure);
  y = writeParagraph(doc, paperRescissionCopy(), y, right - PAPER_INSET, 8, ensure);
  const secondName = names.second?.trim() || estimate.secondSignatureName.trim() || null;
  const lines = estimateSignatureLines(estimate, {
    contractor: names.contractor,
    primary: names.primary,
    second: secondName,
  });
  const homeowners = lines.filter((line) => line.party === "homeowner");
  const contractor = lines.find((line) => line.party === "contractor");
  for (const line of homeowners) {
    const image = isSignaturePng(line.image) ? await loadLogoForPdf(line.image) : null;
    y = ensure(y, 90);
    y = drawHomeownerLine(doc, line, image, PAPER_INSET, y, right - PAPER_INSET);
  }
  y = ensure(y, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  ink(doc, PAPER_MUTED);
  doc.text("PROJECT MANAGER", PAPER_INSET, y);
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  ink(doc, PAPER_INK);
  const pmName = manager?.name.trim() || contractor?.name || names.contractor || companyName;
  doc.text(pmName, PAPER_INSET, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  ink(doc, PAPER_MUTED);
  const pmBits = [manager?.title.trim() || "Project Manager", manager?.phone?.trim() || "", manager?.email.trim() || ""].filter(Boolean);
  if (pmBits.length) doc.text(pmBits.join(" · "), PAPER_INSET, y);
  return { y: y + 16, page };
}

function managerCard(manager: ProjectManagerContact | null | undefined, companyPhone?: string) {
  const name = manager?.name.trim() || "";
  if (!name) {
    return {
      label: "Project manager",
      name: "—",
      lines: [] as string[],
    };
  }
  return {
    label: "Project manager",
    name,
    lines: [manager?.title.trim() || "Project Manager", [manager?.phone || companyPhone || "", manager?.email || ""].filter(Boolean).join(" · ")],
  };
}

export async function buildEstimatePdf(raw: {
  estimate: Estimate;
  lines: EstimateLine[];
  company: CompanySettings;
  customer: string;
  projectManager?: ProjectManagerContact | null;
  primaryCustomer?: string;
  secondCustomer?: string | null;
  contractorName?: string;
  photos?: JobPhoto[];
  jobCode?: string | null;
}) {
  const clientFacing = toClientFacingProposal(raw.estimate, raw.lines);
  const input = { ...raw, estimate: clientFacing.estimate, lines: clientFacing.lines };
  const doc = await createDoc();
  const site = paperSiteTitle({
    street: input.estimate.street,
    city: input.estimate.city,
    state: input.estimate.state,
    postalCode: input.estimate.postalCode,
    name: input.estimate.name,
    kindTitle: "Estimate",
  });
  const header: PaperHeader = { kind: "estimate", number: input.estimate.number, title: site.title };
  const pager = createPager(doc, header);
  const gbb = isGbbEstimate(input.estimate);
  const visibleLines = gbb ? input.lines : scopedEstimateLines(input.estimate, input.lines);
  const totals = estimateTotals(input.estimate, input.lines);
  const estimateOptions = listEstimateOptions(input.lines);
  const hidePrices = Boolean(input.estimate.hideLinePrices);
  const cols = tableCols(doc, hidePrices);

  let y = await writeCoverHeader(doc, input.company, "estimate", input.estimate.number);
  y = writeSiteBlock(doc, site, y);
  y = writeMetaRow(
    doc,
    paperEstimateMeta({
      number: input.estimate.number,
      issuedAt: paperIssuedAt(input.estimate),
      validUntil: input.estimate.validUntil,
      jobCode: input.jobCode,
    }),
    y,
  );
  y = writePartyCards(
    doc,
    { label: "Prepared for", name: input.customer, lines: [] },
    managerCard(input.projectManager, input.company.phone),
    y,
  );

  if (input.estimate.intro) {
    y = writeParagraph(doc, input.estimate.intro, y, contentRight(doc) - PAPER_INSET, 9, pager.ensure);
  }
  if (gbb && estimateOptions.length > 0) {
    y = writeParagraph(
      doc,
      "Check one option. Shared work is included in every option. Options replace each other; they do not stack.",
      y,
      contentRight(doc) - PAPER_INSET,
      9,
      pager.ensure,
    );
  }

  y = pager.ensure(y, 36);
  y = writeTableHeader(doc, cols, y);
  const ensureRow = repeatingTableEnsure(doc, pager.ensure, cols);

  const pdfGroups = gbb
    ? gbbPrintSections(visibleLines)
    : groupEstimateLines(visibleLines).map((group, _, all) => ({
        kind: "shared" as const,
        key: "",
        name: all.length > 1 ? group.name : "",
        lines: group.lines,
      }));

  for (const group of pdfGroups) {
    y = ensureRow(y, group.kind === "option" ? 44 : 28);
    if (group.kind === "option") {
      const amount = totalsForPackage(input.estimate, input.lines, group.key).total;
      writeCheckbox(doc, PAPER_INSET, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      ink(doc, PAPER_INK);
      doc.text(group.name.toUpperCase(), PAPER_INSET + 16, y);
      doc.text(formatMoney(amount), cols.amountX, y, { align: "right" });
      y += 16;
    } else if (pdfGroups.length > 1 && group.name) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      ink(doc, PAPER_MUTED);
      doc.text(group.name.toUpperCase(), PAPER_INSET, y);
      y += 12;
    }
    for (const line of group.lines) {
      const included = lineIncluded(line);
      const heading = lineHeading(line);
      const detail = shouldShowLineDescription(line) ? line.description : "";
      doc.setFont("helvetica", included ? "bold" : "normal");
      doc.setFontSize(10);
      const headingLines = doc.splitTextToSize(heading, cols.descW);
      const headingPieces = (Array.isArray(headingLines) ? headingLines : [headingLines]).flatMap((piece) =>
        String(piece).split("\n"),
      );
      const headingH = Math.max(12, Math.max(headingPieces.length, 1) * 12);
      y = ensureRow(y, headingH + 2);
      doc.setFont("helvetica", included ? "bold" : "normal");
      doc.setFontSize(10);
      ink(doc, included ? PAPER_INK : PAPER_MUTED);
      headingPieces.forEach((text, index) => {
        doc.text(text, cols.descX, y + index * 12);
      });
      writeMoneyCols(
        doc,
        cols,
        y,
        paperQtyLabel(line.quantity),
        line.unit || "",
        formatMoney(line.unitCost),
        formatMoney(lineAmount(line)),
      );
      y += headingH;
      if (detail) {
        const detailColor = { r: 70, g: 70, b: 70 };
        ink(doc, detailColor);
        y = writeFormattedText(doc, detail, cols.descX, y, cols.descW, {
          fontSize: 8.5,
          lineHeight: 11,
          color: detailColor,
          ensure: ensureRow,
        });
      }
      if (line.optional) {
        y = ensureRow(y, 12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        ink(doc, PAPER_MUTED);
        doc.text(included ? "Optional — selected" : "Optional — not in this total", cols.descX, y);
        y += 12;
      }
      const linePhotos = photosForEstimateLine(line, input.photos ?? []);
      if (linePhotos.length) {
        const thumb = 72;
        const gap = 8;
        const perRow = 4;
        for (let index = 0; index < linePhotos.length; index += perRow) {
          y = ensureRow(y, thumb + 10);
          const row = linePhotos.slice(index, index + perRow);
          for (let col = 0; col < row.length; col++) {
            const photo = row[col];
            const image = await loadLogoForPdf(photo.imageUrl);
            const x = cols.descX + col * (thumb + gap);
            if (image) {
              const scale = Math.min(thumb / image.width, thumb / image.height);
              doc.addImage(image.data, image.format, x, y, image.width * scale, image.height * scale);
            }
          }
          y += thumb + 8;
        }
      }
      y += 8;
    }
    y += 4;
  }

  draw(doc, { r: 220, g: 220, b: 220 });
  doc.setLineWidth(0.6);
  doc.line(PAPER_INSET, y, contentRight(doc), y);
  y += 12;

  const summaryRows: Array<[string, string]> = [];
  if (gbb && estimateOptions.length > 0) {
    y = writeParagraph(doc, "The option you check is the contract total.", y, contentRight(doc) - PAPER_INSET, 9, pager.ensure);
    for (const option of estimateOptions) {
      const amount = totalsForPackage(input.estimate, input.lines, option.key).total;
      summaryRows.push([option.name, formatMoney(amount)]);
    }
    if (input.estimate.depositKind === "percent" && input.estimate.depositValue > 0) {
      summaryRows.push([`Deposit due (${input.estimate.depositValue}%)`, "of the option you check"]);
    } else if (totals.deposit > 0) {
      summaryRows.push(["Deposit due", formatMoney(totals.deposit)]);
    }
  } else {
    if (totals.discount > 0 || totals.tax > 0) {
      summaryRows.push(["Subtotal", formatMoney(totals.subtotal)]);
    }
    if (totals.discount > 0) {
      summaryRows.push([
        input.estimate.discountKind === "percent"
          ? `Discount (${input.estimate.discountValue}%)`
          : "Discount",
        `-${formatMoney(totals.discount)}`,
      ]);
    }
    if (totals.tax > 0) summaryRows.push([`Tax (${input.estimate.taxRate}%)`, formatMoney(totals.tax)]);
    if (totals.deposit > 0) {
      summaryRows.push([
        input.estimate.depositKind === "percent"
          ? `Deposit due (${input.estimate.depositValue}%)`
          : "Deposit due",
        formatMoney(totals.deposit),
      ]);
    }
  }
  y = writeTotalsStack(
    doc,
    summaryRows,
    { label: "TOTAL", amount: formatMoney(totals.total) },
    y,
    pager.ensure,
  );
  y += 6;
  y = pager.ensure(y, 14);
  const signCue = { page: doc.getNumberOfPages(), y };
  y += 16;
  if (totals.optionalCount > 0) {
    y = writeParagraph(
      doc,
      input.estimate.hideLinePrices
        ? `${totals.optionalCount} optional item${totals.optionalCount === 1 ? "" : "s"} not in this total.`
        : `${formatMoney(totals.optionalTotal)} in optional work is not in this total.`,
      y,
      contentRight(doc) - PAPER_INSET,
      8,
      pager.ensure,
    );
  }
  if (input.estimate.notes?.trim()) {
    y = pager.ensure(y + 6, 24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    ink(doc, PAPER_MUTED);
    doc.text("NOTES", PAPER_INSET, y);
    y += 12;
    y = writeParagraph(doc, input.estimate.notes, y, contentRight(doc) - PAPER_INSET, 9, pager.ensure);
  }

  const estimateTerms = liveEstimateTerms({
    estimate: input.estimate,
    companyDefault: companyEstimateTermsFor(input.company, input.estimate.contractTypeId),
  });
  const filledTerms = filledEstimateTerms({
    template: estimateTerms,
    estimate: input.estimate,
    lines: visibleLines,
    customer: input.customer,
    company: input.company,
  });
  if (filledTerms.trim()) {
    y = pager.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    ink(doc, PAPER_INK);
    doc.text("TERMS", PAPER_INSET, y);
    y += 18;
    y = writeTermsSections(doc, filledTerms, y, pager);
    if (y + 28 < contentBottom(doc)) {
      y = writeInitials(doc, y + 8);
    }
  }

  y = pager.ensure(y + 16, 220);
  const authorization = await writePaperAuthorization(
    doc,
    input.estimate,
    {
      contractor: input.contractorName || input.projectManager?.name || input.company.name,
      primary: input.primaryCustomer || input.customer,
      second: input.secondCustomer,
    },
    input.projectManager,
    input.company.name,
    formatMoney(totals.total),
    y,
    pager.ensure,
  );

  doc.setPage(signCue.page);
  writeSignCta(doc, signCue.y, authorization.page);
  stampFooters(doc, input.company);
  return doc.output("blob");
}

export async function downloadEstimatePdf(input: Parameters<typeof buildEstimatePdf>[0]) {
  downloadBlob(await buildEstimatePdf(input), `${input.estimate.number}.pdf`);
}

export async function downloadSignatureCertificatePdf(input: {
  estimate: Pick<Estimate, "number" | "name" | "street" | "city" | "state" | "postalCode" | "validUntil">;
  company: CompanySettings;
  customer: string;
  events: EstimateSignatureEvent[];
}) {
  const trail = input.events.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!trail.length) {
    throw new Error("No signature record yet.");
  }
  const doc = await createDoc();
  const width = doc.internal.pageSize.getWidth();
  const right = width - 54;
  let y = await writePdfLetterhead(doc, input.company, 54, 54, { showContact: false });
  const site = formatJobSite(input.estimate);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(input.estimate.number, 54, y);
  if (input.estimate.validUntil) {
    doc.text(`Valid until ${formatDate(input.estimate.validUntil)}`, right, y, { align: "right" });
  }
  y += 18;
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.setTextColor(28, 28, 28);
  const title = doc.splitTextToSize(site || input.estimate.name, 400);
  doc.text(title, 54, y);
  y += title.length * 20 + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  doc.text(`Prepared for ${input.customer}`, 54, y);
  y += 18;
  writeSignatureCertificate(doc, input.estimate.number, trail, y);
  downloadBlob(doc.output("blob"), `${input.estimate.number}-signature-certificate.pdf`);
}

export async function buildInvoicePdf(input: {
  invoice: Invoice;
  lines: InvoiceLine[];
  payments: Payment[];
  company: CompanySettings;
  customer: string;
  projectManager?: ProjectManagerContact | null;
  jobCode?: string | null;
  site?: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    name?: string | null;
  };
}) {
  const doc = await createDoc();
  const site = paperSiteTitle({
    street: input.site?.street,
    city: input.site?.city,
    state: input.site?.state,
    postalCode: input.site?.postalCode,
    name: input.site?.name || input.invoice.name,
    kindTitle: "Invoice",
  });
  const header: PaperHeader = { kind: "invoice", number: input.invoice.number, title: site.title };
  const pager = createPager(doc, header);
  const total = invoiceTotal(input.invoice.id, input.lines);
  const paid = paidOnInvoice(input.invoice.id, input.payments);
  const balance = invoiceBalance(input.invoice.id, input.lines, input.payments);
  const cols = tableCols(doc, false);

  let y = await writeCoverHeader(doc, input.company, "invoice", input.invoice.number);
  y = writeSiteBlock(doc, site, y);
  y = writeMetaRow(
    doc,
    paperInvoiceMeta({
      number: input.invoice.number,
      issuedAt: input.invoice.issuedAt,
      dueAt: input.invoice.dueAt,
      jobCode: input.jobCode,
    }),
    y,
  );
  y = writePartyCards(
    doc,
    { label: "Bill to", name: input.customer, lines: [site.locality].filter(Boolean) },
    managerCard(input.projectManager, input.company.phone),
    y,
  );

  y = pager.ensure(y, 36);
  y = writeTableHeader(doc, cols, y);
  const ensureRow = repeatingTableEnsure(doc, pager.ensure, cols);
  const lines = [...input.lines].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const line of lines) {
    y = ensureRow(y, 28);
    const amountY = y;
    ink(doc, PAPER_INK);
    writeMoneyCols(
      doc,
      cols,
      amountY,
      paperQtyLabel(line.quantity),
      line.unit || "",
      formatMoney(line.unitCost),
      formatMoney(invoiceLineAmount(line)),
    );
    y = writeFormattedText(doc, line.description, cols.descX, y, cols.descW, {
      fontSize: 9,
      lineHeight: 12,
      firstParagraphBold: true,
      color: PAPER_INK,
      ensure: ensureRow,
    });
    y += 10;
  }

  y = writeTotalsStack(
    doc,
    [
      ["Total", formatMoney(total)],
      ["Paid", formatMoney(paid)],
    ],
    { label: "BALANCE", amount: formatMoney(balance) },
    y + 4,
    pager.ensure,
  );

  if (input.invoice.notes?.trim()) {
    y += 8;
    y = pager.ensure(y, 24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    ink(doc, PAPER_MUTED);
    doc.text("NOTES", PAPER_INSET, y);
    y += 12;
    y = writeParagraph(doc, input.invoice.notes, y, contentRight(doc) - PAPER_INSET, 9, pager.ensure);
  }

  const invoiceTerms = liveInvoiceTerms({
    invoice: input.invoice,
    companyDefault: input.company.defaultInvoiceTerms,
  });
  const paymentTerms = filledInvoiceTerms({
    template: invoiceTerms,
    invoice: input.invoice,
    lines: input.lines,
    payments: input.payments,
    customer: input.customer,
    company: input.company,
  });
  if (paymentTerms.trim()) {
    y = pager.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    ink(doc, PAPER_INK);
    doc.text("PAYMENT TERMS", PAPER_INSET, y);
    y += 18;
    writeTermsSections(doc, paymentTerms, y, pager);
  }

  stampFooters(doc, input.company);
  return doc.output("blob");
}

export async function downloadInvoicePdf(input: Parameters<typeof buildInvoicePdf>[0]) {
  downloadBlob(await buildInvoicePdf(input), `${input.invoice.number}.pdf`);
}
