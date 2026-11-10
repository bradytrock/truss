import type { CompanySettings, Job, MaterialOrder } from "@/lib/types";
import { formatCompanyAddress, formatPhone } from "@/lib/format";
import { loadLogoForPdf } from "@/lib/letterhead-pdf";
import { formatMoney } from "@/lib/format";
import {
  formatMaterialOrderIssued,
  groupPresentedLines,
  materialOrderWhenLabel,
  materialOrderWindowLabel,
  sectionAmount,
  type PresentedMaterialLine,
} from "@/lib/material-order-presentation";
import { materialOrderTotal } from "@/lib/material-orders";
import { PRODUCT_NAME } from "@/lib/product";
import { downloadBlob } from "@/lib/share";

type RGB = [number, number, number];

const RED: RGB = [215, 28, 39];
const INK: RGB = [26, 26, 26];
const MUTED: RGB = [107, 107, 107];
const HAIR: RGB = [214, 214, 214];
const BAND: RGB = [244, 242, 239];
const WHITE: RGB = [255, 255, 255];

const MARGIN = 40;

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
  addImage: (imageData: string, format: string, x: number, y: number, w: number, h: number) => void;
  output: (type: "blob") => Blob;
  internal: {
    pageSize: { getWidth: () => number; getHeight: () => number };
    getNumberOfPages: () => number;
  };
};

function pdfSafe(value: string) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2212/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\u0000-\u00FF\u2013\u2014]/g, "");
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

function shownPhone(value: string | undefined) {
  const formatted = formatPhone(value);
  return formatted === "—" ? "" : formatted;
}

function websiteLabel(value: string) {
  return value.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function qtyLabel(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "MO";
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

function shipLines(job: Job | null | undefined, customer: string) {
  const title = job?.name?.trim() || customer.trim() || "Job site";
  const street = job?.street?.trim() ?? "";
  const cityLine = [[job?.city, job?.state].filter(Boolean).join(", "), job?.postalCode]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!street && !cityLine) {
    const location = job?.location?.trim() ?? "";
    return [title, location].filter(Boolean);
  }
  return [title, street, cityLine].filter(Boolean);
}

export async function buildMaterialOrderPdf(input: {
  order: MaterialOrder;
  lines: PresentedMaterialLine[];
  job?: Job | null;
  company: CompanySettings;
  customer: string;
  orderedBy?: string;
  orderedByPhone?: string;
  orderedByEmail?: string;
}) {
  const doc = await createDoc();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const right = width - MARGIN;
  const contentWidth = right - MARGIN;
  const groups = groupPresentedLines(input.lines);
  const total = materialOrderTotal(input.lines);
  const namedCount = input.lines.filter((line) => line.name.trim()).length;
  const phone = shownPhone(input.orderedByPhone) || shownPhone(input.company.phone);
  const issued = formatMaterialOrderIssued(input.order.createdAt);
  const jobCode = input.job?.code?.trim() ?? "";
  const when = input.order.neededBy
    ? `${formatWhen(input)}`
    : input.order.fulfillment === "pickup"
      ? "Date not set"
      : "Date not set";

  let y = await drawLetterhead(doc, input.company, width, issued, input.order.number, jobCode);

  y = drawParties(doc, y, right, {
    vendor: input.order.vendor.trim() || "Supplier",
    branch: input.order.branch.trim(),
    account: input.order.accountNumber.trim(),
    ship: shipLines(input.job, input.customer),
    orderedBy: input.orderedBy?.trim() || "",
    phone,
    email: input.orderedByEmail?.trim() || "",
  });

  y = drawDeliverBox(doc, y, right, {
    label: input.order.fulfillment === "pickup" ? "WILL-CALL" : "DELIVER ON",
    when,
    contact: phone || "—",
  });

  const quick = input.order.quickNotes.map((note) => note.trim()).filter(Boolean);
  if (quick.length) {
    y += 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    paint(doc, INK);
    const wrapped = doc.splitTextToSize(quick.join("   ·   "), contentWidth);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 12;
  }

  y += 16;
  y = drawTableHeader(doc, y, right);

  for (const group of groups) {
    y = ensureRow(doc, y, height, 22, () => {
      y = drawTableHeader(doc, 48, right);
      return y;
    });
    y = drawSectionBand(doc, y, right, group.section, sectionAmount(group.lines));
    for (const line of group.lines) {
      const item = [line.name.trim() || "Untitled", line.detail.trim()].filter(Boolean).join(" · ");
      const itemLines = doc.splitTextToSize(item, 210);
      const rowHeight = Math.max(18, itemLines.length * 11 + 6);
      y = ensureRow(doc, y, height, rowHeight + 4, () => drawTableHeader(doc, 48, right));
      drawItemRow(doc, y, right, line, itemLines);
      y += rowHeight;
    }
  }

  if (groups.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    paint(doc, MUTED);
    doc.text("No items on this order.", MARGIN, y + 4);
    y += 22;
  }

  y += 14;
  const notes = input.order.notes.trim();
  const noteLines = notes ? doc.splitTextToSize(notes, 280) : [];
  const notesHeight = notes ? Math.max(72, 28 + noteLines.length * 12) : 0;
  const blockHeight = Math.max(notesHeight, 78);
  if (y + blockHeight > height - 88) {
    doc.addPage();
    y = 48;
  }
  drawTotals(doc, y, right, namedCount, total, notes, noteLines, notesHeight);

  const signatureY = Math.max(y + blockHeight + 28, height - 72);
  if (signatureY > height - 46) {
    doc.addPage();
    drawSignature(doc, height - 72, right);
  } else {
    drawSignature(doc, Math.min(signatureY, height - 58), right);
  }

  stampPages(doc, width, height);
  return doc.output("blob");
}

function formatWhen(input: { order: MaterialOrder }) {
  const day = materialOrderWhenLabel({
    neededBy: input.order.neededBy,
    window: input.order.window,
    fulfillment: input.order.fulfillment,
  });
  if (day.startsWith("Pick ")) return `${materialOrderWindowLabel(input.order.window)}`;
  return day;
}

async function drawLetterhead(
  doc: Doc,
  company: CompanySettings,
  width: number,
  issued: string,
  number: string,
  jobCode: string,
) {
  const right = width - MARGIN;
  const logo = company.logoUrl?.trim() ? await loadLogoForPdf(company.logoUrl) : null;
  const markTop = 32;
  if (logo) {
    const max = 36;
    const scale = Math.min(max / logo.width, max / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    doc.addImage(logo.data, logo.format, MARGIN, markTop + (36 - h) / 2, w, h);
  } else {
    fill(doc, RED);
    doc.roundedRect(MARGIN, markTop, 36, 36, 4, 4, "F");
    const mark = initials(company.name);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mark.length > 2 ? 9 : 13);
    paint(doc, WHITE);
    doc.text(mark, MARGIN + 18, markTop + 23, { align: "center" });
  }

  const textX = MARGIN + 46;
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  paint(doc, INK);
  doc.text(company.name || "Company", textX, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, MUTED);
  const contact = [websiteLabel(company.website), shownPhone(company.phone), formatCompanyAddress(company)]
    .filter(Boolean)
    .join("  ·  ");
  if (contact) doc.text(doc.splitTextToSize(contact, 280), textX, 62);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  paint(doc, RED);
  doc.text("MATERIAL ORDER", right, 40, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, INK);
  const numberLines = doc.splitTextToSize(number, 230);
  doc.text(numberLines, right, 54, { align: "right" });
  paint(doc, MUTED);
  const issuedLine = [issued ? `Issued ${issued}` : "", jobCode ? `Job ${jobCode}` : ""].filter(Boolean).join("  ·  ");
  const issuedY = 54 + numberLines.length * 10;
  if (issuedLine) doc.text(issuedLine, right, issuedY, { align: "right" });

  const ruleY = Math.max(80, issuedY + 12);
  stroke(doc, RED);
  doc.setLineWidth(1.75);
  doc.line(MARGIN, ruleY, right, ruleY);
  doc.setLineWidth(0.6);
  return ruleY + 20;
}

function drawParties(
  doc: Doc,
  y: number,
  right: number,
  input: {
    vendor: string;
    branch: string;
    account: string;
    ship: string[];
    orderedBy: string;
    phone: string;
    email: string;
  },
) {
  const width = (right - MARGIN - 16) / 3;
  const columns = [
    {
      label: "SUPPLIER",
      lines: [input.vendor, `Branch ${input.branch || "[BRANCH]"}`, `Account ${input.account || "[ACCOUNT #]"}`],
    },
    { label: "SHIP TO", lines: input.ship.length ? input.ship : ["Job site"] },
    {
      label: "ORDERED BY",
      lines: [input.orderedBy || "—", input.phone, input.email].filter(Boolean),
    },
  ];
  columns.forEach((column, index) => {
    const x = MARGIN + index * (width + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    paint(doc, MUTED);
    doc.text(column.label, x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    paint(doc, INK);
    doc.text(doc.splitTextToSize(column.lines[0] || "—", width), x, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    paint(doc, MUTED);
    column.lines.slice(1).forEach((line, lineIndex) => {
      const wrapped = doc.splitTextToSize(line, width);
      doc.text(wrapped, x, y + 28 + lineIndex * 12);
    });
  });
  return y + 62;
}

function drawDeliverBox(
  doc: Doc,
  y: number,
  right: number,
  input: { label: string; when: string; contact: string },
) {
  const boxWidth = right - MARGIN;
  const boxHeight = 52;
  stroke(doc, HAIR);
  doc.setLineWidth(0.8);
  doc.roundedRect(MARGIN, y, boxWidth, boxHeight, 4, 4, "S");
  const mid = MARGIN + boxWidth / 2;
  doc.line(mid, y, mid, y + boxHeight);
  const cells = [
    { label: input.label, value: input.when, x: MARGIN + 12 },
    { label: "ON-SITE CONTACT", value: input.contact, x: mid + 12 },
  ];
  for (const cell of cells) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    paint(doc, MUTED);
    doc.text(cell.label, cell.x, y + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    paint(doc, INK);
    doc.text(cell.value, cell.x, y + 36);
  }
  return y + boxHeight;
}

function drawTableHeader(doc: Doc, y: number, right: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  paint(doc, MUTED);
  doc.text("QTY", 62, y);
  doc.text("UNIT", 100, y);
  doc.text("ITEM", 142, y);
  doc.text("SKU", 368, y);
  doc.text("UNIT COST", 500, y, { align: "right" });
  doc.text("TOTAL", right, y, { align: "right" });
  stroke(doc, HAIR);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y + 6, right, y + 6);
  return y + 18;
}

function drawSectionBand(doc: Doc, y: number, right: number, section: string, amount: number) {
  fill(doc, BAND);
  doc.rect(MARGIN, y - 10, right - MARGIN, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, INK);
  doc.text(section.toUpperCase(), MARGIN + 8, y);
  doc.setFont("helvetica", "normal");
  paint(doc, MUTED);
  doc.text(formatMoney(amount), right - 8, y, { align: "right" });
  return y + 16;
}

function drawItemRow(doc: Doc, y: number, right: number, line: PresentedMaterialLine, itemLines: string[]) {
  stroke(doc, HAIR);
  doc.setLineWidth(0.7);
  doc.rect(MARGIN + 2, y - 8, 8, 8, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  paint(doc, INK);
  doc.text(qtyLabel(line.quantity), 62, y);
  doc.text(line.unit || "EA", 100, y);
  doc.text(itemLines, 142, y);
  paint(doc, MUTED);
  doc.text(line.sku || "—", 368, y);
  paint(doc, INK);
  doc.text(formatMoney(line.unitCost), 500, y, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text(formatMoney(line.amount), right, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  stroke(doc, [232, 232, 232]);
  doc.setLineWidth(0.4);
  const rowBottom = y + Math.max(8, (itemLines.length - 1) * 11 + 8);
  doc.line(MARGIN, rowBottom, right, rowBottom);
}

function ensureRow(doc: Doc, y: number, height: number, needed: number, header: () => number) {
  if (y + needed < height - 56) return y;
  doc.addPage();
  return header();
}

function drawTotals(
  doc: Doc,
  y: number,
  right: number,
  count: number,
  total: number,
  notes: string,
  noteLines: string[],
  notesHeight: number,
) {
  if (notes && notesHeight > 0) {
    stroke(doc, HAIR);
    doc.setLineWidth(0.8);
    doc.roundedRect(MARGIN, y, 310, notesHeight, 6, 6, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    paint(doc, MUTED);
    doc.text("NOTES", MARGIN + 12, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    paint(doc, INK);
    doc.text(noteLines, MARGIN + 12, y + 32);
  }

  const labelX = 360;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  paint(doc, MUTED);
  doc.text(`Materials (${count} ${count === 1 ? "item" : "items"})`, labelX, y + 16);
  paint(doc, INK);
  doc.text(formatMoney(total), right, y + 16, { align: "right" });
  paint(doc, MUTED);
  doc.text("Tax & delivery", labelX, y + 32);
  doc.text("Per supplier invoice", right, y + 32, { align: "right" });
  stroke(doc, INK);
  doc.setLineWidth(0.8);
  doc.line(labelX, y + 42, right, y + 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  paint(doc, INK);
  doc.text("Estimated total", labelX, y + 60);
  doc.setFontSize(13);
  doc.text(formatMoney(total), right, y + 60, { align: "right" });
}

function drawSignature(doc: Doc, y: number, right: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, MUTED);
  doc.text("Received by (print & sign)", MARGIN, y);
  doc.text("Date & time delivered", MARGIN + 250, y);
  stroke(doc, [160, 160, 160]);
  doc.setLineWidth(0.6);
  doc.line(MARGIN + 118, y, MARGIN + 230, y);
  doc.line(MARGIN + 360, y, right, y);
}

function stampPages(doc: Doc, width: number, height: number) {
  const pages = doc.internal.getNumberOfPages();
  const right = width - MARGIN;
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, MUTED);
    doc.text(`Page ${page} of ${pages}`, right, height - 28, { align: "right" });
    doc.setFontSize(7.5);
    doc.text(`Powered by ${PRODUCT_NAME}`, right, height - 16, { align: "right" });
  }
}

export async function downloadMaterialOrderPdf(
  input: Parameters<typeof buildMaterialOrderPdf>[0],
  filename?: string,
) {
  const blob = await buildMaterialOrderPdf(input);
  downloadBlob(blob, filename || `${input.order.number}-material-order.pdf`);
  return blob;
}

export async function previewMaterialOrderPdf(input: Parameters<typeof buildMaterialOrderPdf>[0]) {
  const blob = await buildMaterialOrderPdf(input);
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    downloadBlob(blob, `${input.order.number}-material-order.pdf`);
    URL.revokeObjectURL(url);
    return blob;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return blob;
}
