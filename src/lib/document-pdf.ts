import type { CompanySettings, Estimate, EstimateLine, Invoice, InvoiceLine, Payment } from "@/lib/types";
import { estimateTotals, groupEstimateLines, lineAmount, lineIncluded } from "@/lib/estimate-totals";
import { formatDate, formatMoney, formatPhone } from "@/lib/format";
import { formatJobSite } from "@/lib/leads";
import { writePdfLetterhead, loadLogoForPdf } from "@/lib/letterhead-pdf";
import { invoiceBalance, invoiceTotal, lineAmount as invoiceLineAmount, paidOnInvoice } from "@/lib/money";
import { downloadBlob } from "@/lib/share";
import { hasEstimateSignature } from "@/lib/estimate-signature";
import { filledEstimateTerms, filledInvoiceTerms } from "@/lib/document-terms";
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

function ensureSpace(doc: Doc, y: number, needed: number) {
  const height = doc.internal.pageSize.getHeight();
  if (y + needed < height - 48) return y;
  doc.addPage();
  return 54;
}

function writeParagraph(doc: Doc, text: string, y: number, width = 504) {
  const lines = doc.splitTextToSize(text, width);
  y = ensureSpace(doc, y, lines.length * 13 + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(lines, 54, y);
  return y + lines.length * 13 + 8;
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
  doc.text(`Project Manager Name: ${name}`, 54, y);
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
}) {
  const doc = await createDoc();
  const width = doc.internal.pageSize.getWidth();
  const right = width - 54;
  let y = await writePdfLetterhead(doc, input.company, 54);
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
  if (input.estimate.terms) {
    y += 8;
    y = ensureSpace(doc, y, 24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text("TERMS", 54, y);
    y += 14;
    y = writeParagraph(
      doc,
      filledEstimateTerms({
        template: input.estimate.terms,
        estimate: input.estimate,
        lines: input.lines,
        customer: input.customer,
        company: input.company,
      }),
      y,
    );
  }

  y += 10;
  y = ensureSpace(doc, y, 96);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("AUTHORIZATION", 54, y);
  y += 16;
  if (hasEstimateSignature(input.estimate)) {
    const ink = await loadLogoForPdf(input.estimate.signatureImage);
    const sigWidth = 220;
    const sigHeight = ink ? Math.min(56, (ink.height / ink.width) * sigWidth) : 48;
    y = ensureSpace(doc, y, sigHeight + 36);
    if (ink) {
      doc.addImage(ink.data, ink.format, 54, y, sigWidth, sigHeight);
    }
    y += sigHeight + 8;
    doc.setTextColor(200, 200, 200);
    doc.line(54, y, 280, y);
    doc.line(300, y, right, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    doc.text(input.estimate.signatureName || "Homeowner", 54, y);
    doc.text(formatDate(input.estimate.acceptedAt), 300, y);
    y += 12;
    doc.setTextColor(120, 120, 120);
    doc.text("Homeowner signature", 54, y);
    doc.text("Date signed", 300, y);
  } else {
    y += 36;
    doc.setTextColor(200, 200, 200);
    doc.line(54, y, 280, y);
    doc.line(300, y, right, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("Homeowner signature", 54, y);
    doc.text("Date", 300, y);
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
  let y = await writePdfLetterhead(doc, input.company, 54);
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

  if (input.invoice.terms) {
    y += 24;
    y = ensureSpace(doc, y, 24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text("TERMS", 54, y);
    y += 14;
    y = writeParagraph(
      doc,
      filledInvoiceTerms({
        template: input.invoice.terms,
        invoice: input.invoice,
        lines: input.lines,
        payments: input.payments,
        customer: input.customer,
        company: input.company,
      }),
      y,
    );
  }

  downloadBlob(doc.output("blob"), `${input.invoice.number}.pdf`);
}
