import type { CompanySettings, Estimate, EstimateLine, Invoice, InvoiceLine, JobPhoto, Payment } from "@/lib/types";
import { estimateTotals, groupEstimateLines, lineAmount, lineIncluded } from "@/lib/estimate-totals";
import { formatDate, formatMoney, formatPhone } from "@/lib/format";
import { formatJobSite } from "@/lib/leads";
import { photosForEstimateLine } from "@/lib/estimate-line-photos";
import { writePdfLetterhead, loadLogoForPdf } from "@/lib/letterhead-pdf";
import { invoiceBalance, invoiceTotal, lineAmount as invoiceLineAmount, paidOnInvoice } from "@/lib/money";
import { downloadBlob } from "@/lib/share";
import { isSignaturePng } from "@/lib/estimate-signature";
import { estimateSignatureLines } from "@/lib/estimate-signers";
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

function wrapText(doc: Doc, text: string, width: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
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

function writeParagraph(doc: Doc, text: string, y: number, width = 504, continued?: string) {
  const lines = wrapText(doc, text, width);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  for (const line of lines) {
    const gap = line ? 16 : 12;
    if (y + gap >= pageBottom(doc)) {
      doc.addPage();
      y = 54;
      if (continued) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        doc.text(`${continued} (continued)`, 54, y);
        y += 16;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
      }
    }
    if (line) doc.text(line, 54, y);
    y += line ? 13 : 8;
  }
  return y + 8;
}

function writeLabeledBlock(doc: Doc, title: string, text: string | null | undefined, y: number) {
  const body = text?.trim() ?? "";
  if (!body) return y;
  y += 12;
  y = ensureSpace(doc, y, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(title, 54, y);
  y += 14;
  return writeParagraph(doc, body, y, 504, title);
}

function writeNotes(doc: Doc, notes: string | null | undefined, y: number) {
  return writeLabeledBlock(doc, "NOTES", notes, y);
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
  );

  y += 10;
  y = ensureSpace(doc, y, 96);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("AUTHORIZATION", 54, y);
  y += 16;
  const authLines = estimateSignatureLines(input.estimate, {
    contractor: input.contractorName || input.projectManager?.name || input.company.name,
    primary: input.primaryCustomer || input.customer,
    second: input.secondCustomer,
  });
  for (const line of authLines) {
    y = ensureSpace(doc, y, 90);
    const signed = Boolean(line.signedAt);
    if (isSignaturePng(line.image)) {
      const ink = await loadLogoForPdf(line.image);
      const sigWidth = 220;
      const sigHeight = ink ? Math.min(56, (ink.height / ink.width) * sigWidth) : 48;
      y = ensureSpace(doc, y, sigHeight + 36);
      if (ink) {
        doc.addImage(ink.data, ink.format, 54, y, sigWidth, sigHeight);
      }
      y += sigHeight + 8;
    } else if (signed && line.party === "contractor") {
      y += 28;
      doc.setFont("times", "italic");
      doc.setFontSize(18);
      doc.setTextColor(28, 28, 28);
      doc.text(line.name, 54, y);
      y += 12;
    } else {
      y += 36;
    }
    doc.setTextColor(200, 200, 200);
    doc.line(54, y, 280, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    doc.text(line.name, 54, y);
    y += 12;
    doc.setTextColor(120, 120, 120);
    const label = line.party === "contractor" ? "Contractor" : "Homeowner signature";
    doc.text(signed ? `${label} · ${formatDate(line.signedAt)}` : label, 54, y);
    y += 18;
  }

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
  );

  downloadBlob(doc.output("blob"), `${input.invoice.number}.pdf`);
}
