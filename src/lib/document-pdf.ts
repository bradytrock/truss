import type { CompanySettings, Estimate, EstimateLine, EstimateSignatureEvent, Invoice, InvoiceLine, JobPhoto, Payment } from "@/lib/types";
import { estimateTotals, groupEstimateLines, lineAmount, lineIncluded } from "@/lib/estimate-totals";
import { formatDate, formatMoney, formatPhone, formatDateTimeUtc } from "@/lib/format";
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
  resolveEstimateTerms,
  resolveInvoiceTerms,
} from "@/lib/document-terms";
import type { ProjectManagerContact } from "@/lib/document-owner";

type Doc = {
  setFont: (face: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  text: (text: string | string[], x: number, y: number, options?: { align?: "left" | "right" | "center" }) => void;
  splitTextToSize: (text: string, width: number) => string[];
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addPage: () => void;
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

async function createDoc() {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ unit: "pt", format: "letter" }) as unknown as Doc;
}

function pageBottom(doc: Doc) {
  return doc.internal.pageSize.getHeight() - 48;
}

function ensureSpace(doc: Doc, y: number, needed: number) {
  if (y + needed < pageBottom(doc)) return y;
  doc.addPage();
  return 54;
}

const TERMS_BODY_SIZE = 7.5;

function wrapText(doc: Doc, text: string, width: number, fontSize = 10) {
  doc.setFont("helvetica", "normal");
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

function writeSignatureCertificate(doc: Doc, estimateNumber: string, events: EstimateSignatureEvent[]) {
  const trail = events.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!trail.length) return;
  doc.addPage();
  let y = 54;
  const width = doc.internal.pageSize.getWidth();
  const right = width - 54;
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
    "This page is the audit trail for the electronic signatures on this proposal. Each homeowner received a unique link. The IP address, device, time, consent, and SHA-256 hash of the proposal at sign time are stored with the drawing.",
    y,
    504,
    undefined,
    9,
  );
  y += 8;
  for (const event of trail) {
    y = ensureSpace(doc, y, 88);
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
      y = ensureSpace(doc, y, wrapped.length * 11 + 2);
      doc.text(wrapped, 54, y);
      y += wrapped.length * 11;
    }
    y += 10;
  }
}

function writeParagraph(
  doc: Doc,
  text: string,
  y: number,
  width = 504,
  continued?: string,
  fontSize = 10,
) {
  const lines = wrapText(doc, text, width, fontSize);
  const lineHeight = fontSize <= 8 ? 9.5 : 13;
  const blankHeight = fontSize <= 8 ? 6 : 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(40, 40, 40);
  for (const line of lines) {
    const gap = line ? lineHeight + 2 : 12;
    if (y + gap >= pageBottom(doc)) {
      doc.addPage();
      y = 54;
      if (continued) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        doc.text(`${continued} (continued)`, 54, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(fontSize);
        doc.setTextColor(40, 40, 40);
      }
    }
    if (line) doc.text(line, 54, y);
    y += line ? lineHeight : blankHeight;
  }
  return y + (fontSize <= 8 ? 6 : 8);
}

function writeLabeledBlock(
  doc: Doc,
  title: string,
  text: string | null | undefined,
  y: number,
  bodySize = 10,
) {
  const body = text?.trim() ?? "";
  if (!body) return y;
  y += 12;
  y = ensureSpace(doc, y, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(title, 54, y);
  y += bodySize <= 8 ? 12 : 14;
  return writeParagraph(doc, body, y, 504, title, bodySize);
}

function writeNotes(doc: Doc, notes: string | null | undefined, y: number) {
  return writeLabeledBlock(doc, "NOTES", notes, y);
}

type PdfInk = Awaited<ReturnType<typeof loadLogoForPdf>>;
type AuthLine = ReturnType<typeof estimateSignatureLines>[number];

function signatureInkHeight(ink: PdfInk, colWidth: number) {
  if (!ink) return 48;
  return Math.min(56, (ink.height / Math.max(ink.width, 1)) * Math.min(220, colWidth));
}

function signatureCellHeight(doc: Doc, line: AuthLine, ink: PdfInk, colWidth: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const names = doc.splitTextToSize(line.name, colWidth);
  const nameH = Math.max(12, (Array.isArray(names) ? names.length : 1) * 12);
  if (ink) return signatureInkHeight(ink, colWidth) + 8 + 14 + nameH + 14;
  if (line.signedAt && line.party === "contractor") return 40 + 14 + nameH + 14;
  return 36 + 14 + nameH + 14;
}

function drawSignatureCell(
  doc: Doc,
  line: AuthLine,
  ink: PdfInk,
  x: number,
  y: number,
  colWidth: number,
) {
  const signed = Boolean(line.signedAt);
  let cursor = y;
  if (ink) {
    const sigHeight = signatureInkHeight(ink, colWidth);
    doc.addImage(ink.data, ink.format, x, cursor, Math.min(220, colWidth), sigHeight);
    cursor += sigHeight + 8;
  } else if (signed && line.party === "contractor") {
    cursor += 28;
    doc.setFont("times", "italic");
    doc.setFontSize(16);
    doc.setTextColor(28, 28, 28);
    const fit = doc.splitTextToSize(line.name, colWidth);
    doc.text(fit, x, cursor);
    cursor += (Array.isArray(fit) ? fit.length : 1) * 12;
  } else {
    cursor += 36;
  }
  doc.setTextColor(200, 200, 200);
  doc.line(x, cursor, x + colWidth, cursor);
  cursor += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  const names = doc.splitTextToSize(line.name, colWidth);
  doc.text(names, x, cursor);
  cursor += Math.max(12, (Array.isArray(names) ? names.length : 1) * 12);
  doc.setTextColor(120, 120, 120);
  const label = line.party === "contractor" ? "Contractor" : "Homeowner signature";
  doc.text(signed ? `${label} · ${formatDate(line.signedAt)}` : label, x, cursor);
}

async function writeAuthorization(
  doc: Doc,
  estimate: Parameters<typeof estimateSignatureLines>[0],
  names: {
    contractor?: string | null;
    primary: string;
    second?: string | null;
  },
  y: number,
) {
  const right = doc.internal.pageSize.getWidth() - 54;
  const secondName = names.second?.trim() || estimate.secondSignatureName.trim() || null;
  const lines = estimateSignatureLines(estimate, {
    contractor: names.contractor,
    primary: names.primary,
    second: secondName,
  });
  const inks: PdfInk[] = [];
  for (const line of lines) {
    inks.push(isSignaturePng(line.image) ? await loadLogoForPdf(line.image) : null);
  }
  const contractorIndex = lines.findIndex((line) => line.party === "contractor");
  const homeownerIndexes = lines
    .map((line, index) => (line.party === "homeowner" ? index : -1))
    .filter((index) => index >= 0);
  const twoCol = contractorIndex >= 0 && homeownerIndexes.length > 0;
  const gap = 24;
  const stackGap = 16;
  const colWidth = twoCol ? (right - 54 - gap) / 2 : right - 54;
  const contractorHeight =
    contractorIndex >= 0 ? signatureCellHeight(doc, lines[contractorIndex], inks[contractorIndex], colWidth) : 0;
  const homeownerHeights = homeownerIndexes.map((index) =>
    signatureCellHeight(doc, lines[index], inks[index], colWidth),
  );
  const homeownersHeight =
    homeownerHeights.reduce((sum, height) => sum + height, 0) +
    stackGap * Math.max(0, homeownerHeights.length - 1);
  const block = 16 + Math.max(contractorHeight, homeownersHeight, 0);
  y = ensureSpace(doc, y, block);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("AUTHORIZATION", 54, y);
  y += 16;
  const top = y;
  if (contractorIndex >= 0) {
    drawSignatureCell(doc, lines[contractorIndex], inks[contractorIndex], 54, top, colWidth);
  }
  let homeownerY = top;
  const homeownerX = twoCol ? 54 + colWidth + gap : 54;
  for (let i = 0; i < homeownerIndexes.length; i++) {
    const index = homeownerIndexes[i];
    drawSignatureCell(doc, lines[index], inks[index], homeownerX, homeownerY, colWidth);
    homeownerY += homeownerHeights[i] + stackGap;
  }
  return top + Math.max(contractorHeight, homeownersHeight, 0);
}

function writeProjectManager(doc: Doc, manager: ProjectManagerContact | null | undefined, y: number) {
  const name = manager?.name.trim() ?? "";
  if (!name) return y;
  y += 8;
  y = ensureSpace(doc, y, 48);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("PROJECT MANAGER", 54, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(name, 54, y);
  y += 13;
  const title = manager?.title.trim() ?? "";
  if (title) {
    doc.setTextColor(70, 70, 70);
    doc.text(title, 54, y);
    y += 13;
  }
  const phone = formatPhone(manager?.phone);
  if (phone && phone !== "—") {
    doc.setTextColor(70, 70, 70);
    doc.text(phone, 54, y);
    y += 13;
  }
  const email = manager?.email.trim() ?? "";
  if (email) {
    doc.setTextColor(70, 70, 70);
    doc.text(email, 54, y);
    y += 13;
  }
  return y + 6;
}

export async function downloadEstimatePdf(input: {
  estimate: Estimate;
  lines: EstimateLine[];
  company: CompanySettings;
  customer: string;
  projectManager?: ProjectManagerContact | null;
  primaryCustomer?: string;
  secondCustomer?: string | null;
  contractorName?: string;
  photos?: JobPhoto[];
  signatureEvents?: EstimateSignatureEvent[];
}) {
  const doc = await createDoc();
  const width = doc.internal.pageSize.getWidth();
  const right = width - 54;
  let y = await writePdfLetterhead(doc, input.company, 54, 54, { showContact: false });
  const site = formatJobSite(input.estimate);
  const totals = estimateTotals(input.estimate, input.lines);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(input.estimate.number, 54, y);
  doc.text(`Valid until ${formatDate(input.estimate.validUntil)}`, right, y, { align: "right" });
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
  y += 14;
  if (site && site !== input.estimate.name) {
    doc.text(site, 54, y);
    y += 16;
  }
  y = writeProjectManager(doc, input.projectManager, y);
  if (input.estimate.intro) {
    y += 6;
    y = writeParagraph(doc, input.estimate.intro, y);
  }

  for (const group of groupEstimateLines(input.lines)) {
    y = ensureSpace(doc, y, 28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(group.name.toUpperCase(), 54, y);
    y += 8;
    doc.setTextColor(220, 220, 220);
    doc.line(54, y, right, y);
    y += 14;
    for (const line of group.lines) {
      const included = lineIncluded(line);
      const label = line.title || line.description;
      const detail =
        line.description && line.description !== line.title ? line.description : "";
      const block = 28 + (detail ? 12 : 0) + (line.optional ? 12 : 0);
      y = ensureSpace(doc, y, block);
      doc.setFont("helvetica", included ? "bold" : "normal");
      doc.setFontSize(10);
      doc.setTextColor(included ? 28 : 140, included ? 28 : 140, included ? 28 : 140);
      doc.text(label, 54, y);
      doc.text(formatMoney(lineAmount(line)), right, y, { align: "right" });
      y += 13;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`${line.quantity} ${line.unit} × ${formatMoney(line.unitCost)}`, 54, y);
      y += 12;
      if (detail) {
        const wrapped = doc.splitTextToSize(detail, 360);
        doc.text(wrapped, 54, y);
        y += wrapped.length * 11;
      }
      if (line.optional) {
        doc.text(included ? "Optional — selected" : "Optional — not in this total", 54, y);
        y += 12;
      }
      const linePhotos = photosForEstimateLine(line, input.photos ?? []);
      if (linePhotos.length) {
        const thumb = 88;
        const gap = 8;
        const perRow = 4;
        for (let index = 0; index < linePhotos.length; index += perRow) {
          y = ensureSpace(doc, y, thumb + 10);
          const row = linePhotos.slice(index, index + perRow);
          for (let col = 0; col < row.length; col++) {
            const photo = row[col];
            const ink = await loadLogoForPdf(photo.imageUrl);
            const x = 54 + col * (thumb + gap);
            if (ink) {
              const scale = Math.min(thumb / ink.width, thumb / ink.height);
              const w = ink.width * scale;
              const h = ink.height * scale;
              doc.addImage(ink.data, ink.format, x, y, w, h);
            }
          }
          y += thumb + 8;
        }
      }
      y += 6;
    }
    y += 6;
  }

  y = ensureSpace(doc, y, 90);
  const boxLeft = right - 200;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  const rows: Array<[string, string]> = [["Subtotal", formatMoney(totals.subtotal)]];
  if (totals.discount > 0) {
    rows.push([
      input.estimate.discountKind === "percent"
        ? `Discount (${input.estimate.discountValue}%)`
        : "Discount",
      `-${formatMoney(totals.discount)}`,
    ]);
  }
  if (totals.tax > 0) rows.push([`Tax (${input.estimate.taxRate}%)`, formatMoney(totals.tax)]);
  rows.forEach(([label, value], index) => {
    doc.text(label, boxLeft, y + index * 14);
    doc.text(value, right, y + index * 14, { align: "right" });
  });
  y += rows.length * 14 + 6;
  doc.setTextColor(200, 200, 200);
  doc.line(boxLeft, y, right, y);
  y += 16;
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.setTextColor(28, 28, 28);
  doc.text("Total", boxLeft, y);
  doc.text(formatMoney(totals.total), right, y, { align: "right" });
  y += 16;
  if (totals.deposit > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(70, 70, 70);
    const depositLabel =
      input.estimate.depositKind === "percent"
        ? `Deposit due (${input.estimate.depositValue}%)`
        : "Deposit due";
    doc.text(depositLabel, boxLeft, y);
    doc.text(formatMoney(totals.deposit), right, y, { align: "right" });
    y += 16;
  }
  if (totals.optionalCount > 0) {
    y += 6;
    y = writeParagraph(
      doc,
      `${formatMoney(totals.optionalTotal)} in optional work is not in this total.`,
      y,
    );
  }
  y = writeNotes(doc, input.estimate.notes, y);
  const estimateTerms = resolveEstimateTerms({
    explicit: input.estimate.terms,
    companyDefault: input.company.defaultEstimateTerms,
  });
  y = writeLabeledBlock(
    doc,
    "TERMS",
    filledEstimateTerms({
      template: estimateTerms,
      estimate: input.estimate,
      lines: input.lines,
      customer: input.customer,
      company: input.company,
    }),
    y,
    TERMS_BODY_SIZE,
  );

  y += 10;
  y = await writeAuthorization(
    doc,
    input.estimate,
    {
      contractor: input.contractorName || input.projectManager?.name || input.company.name,
      primary: input.primaryCustomer || input.customer,
      second: input.secondCustomer,
    },
    y,
  );

  writeSignatureCertificate(doc, input.estimate.number, input.signatureEvents ?? []);

  downloadBlob(doc.output("blob"), `${input.estimate.number}.pdf`);
}

export async function downloadInvoicePdf(input: {
  invoice: Invoice;
  lines: InvoiceLine[];
  payments: Payment[];
  company: CompanySettings;
  customer: string;
  projectManager?: ProjectManagerContact | null;
}) {
  const doc = await createDoc();
  const width = doc.internal.pageSize.getWidth();
  const right = width - 54;
  let y = await writePdfLetterhead(doc, input.company, 54, 54, { showContact: false });
  const total = invoiceTotal(input.invoice.id, input.lines);
  const paid = paidOnInvoice(input.invoice.id, input.payments);
  const balance = invoiceBalance(input.invoice.id, input.lines, input.payments);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(input.invoice.number, 54, y);
  doc.text(`Due ${formatDate(input.invoice.dueAt)}`, right, y, { align: "right" });
  y += 18;
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.setTextColor(28, 28, 28);
  const title = doc.splitTextToSize(input.invoice.name, 400);
  doc.text(title, 54, y);
  y += title.length * 20 + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  doc.text(`Bill to ${input.customer}`, 54, y);
  y += 14;
  doc.text(`Issued ${formatDate(input.invoice.issuedAt)}`, 54, y);
  y += 14;
  y = writeProjectManager(doc, input.projectManager, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("DESCRIPTION", 54, y);
  doc.text("AMOUNT", right, y, { align: "right" });
  y += 8;
  doc.setTextColor(220, 220, 220);
  doc.line(54, y, right, y);
  y += 14;

  const lines = [...input.lines].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const line of lines) {
    y = ensureSpace(doc, y, 28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(28, 28, 28);
    const wrapped = doc.splitTextToSize(line.description, 360);
    doc.text(wrapped, 54, y);
    doc.text(formatMoney(invoiceLineAmount(line)), right, y, { align: "right" });
    y += wrapped.length * 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(`${line.quantity} ${line.unit} × ${formatMoney(line.unitCost)}`, 54, y);
    y += 16;
  }

  y = ensureSpace(doc, y, 70);
  const boxLeft = right - 200;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  doc.text("Total", boxLeft, y);
  doc.text(formatMoney(total), right, y, { align: "right" });
  y += 14;
  doc.text("Paid", boxLeft, y);
  doc.text(formatMoney(paid), right, y, { align: "right" });
  y += 10;
  doc.setTextColor(200, 200, 200);
  doc.line(boxLeft, y, right, y);
  y += 16;
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.setTextColor(28, 28, 28);
  doc.text("Balance due", boxLeft, y);
  doc.text(formatMoney(balance), right, y, { align: "right" });
  y = writeNotes(doc, input.invoice.notes, y);
  const invoiceTerms = resolveInvoiceTerms({
    explicit: input.invoice.terms,
    companyDefault: input.company.defaultInvoiceTerms,
  });
  y = writeLabeledBlock(
    doc,
    "PAYMENT TERMS",
    filledInvoiceTerms({
      template: invoiceTerms,
      invoice: input.invoice,
      lines: input.lines,
      payments: input.payments,
      customer: input.customer,
      company: input.company,
    }),
    y,
    TERMS_BODY_SIZE,
  );

  downloadBlob(doc.output("blob"), `${input.invoice.number}.pdf`);
}
