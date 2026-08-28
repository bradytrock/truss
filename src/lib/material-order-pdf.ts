import type { CompanySettings, Job, MaterialOrder, MaterialOrderLine } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import { formatJobSite } from "@/lib/leads";
import { writePdfLetterhead } from "@/lib/letterhead-pdf";
import { downloadBlob } from "@/lib/share";
import { jobAddress } from "@/lib/job-record";
import { materialOrderLineAmount, materialOrderTotal } from "@/lib/material-orders";
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

function pageBottom(doc: Doc) {
  return doc.internal.pageSize.getHeight() - 48;
}

function ensureSpace(doc: Doc, y: number, needed: number) {
  if (y + needed < pageBottom(doc)) return y;
  doc.addPage();
  return 54;
}

export async function downloadMaterialOrderPdf(input: {
  order: MaterialOrder;
  lines: MaterialOrderLine[];
  job?: Job | null;
  company: CompanySettings;
  customer: string;
  orderedBy?: string;
  projectManager?: ProjectManagerContact | null;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" }) as unknown as Doc;
  const width = doc.internal.pageSize.getWidth();
  const right = width - 54;
  const qtyX = 54;
  const unitX = 96;
  const nameX = 138;
  const costX = right - 150;
  const amountX = right;
  let y = await writePdfLetterhead(doc, input.company, 54, 54, { showContact: false });
  const site = input.job ? formatJobSite(input.job) || jobAddress(input.job) : "";
  const total = materialOrderTotal(input.lines);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(input.order.number, 54, y);
  doc.text("Material order", right, y, { align: "right" });
  y += 18;
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.setTextColor(28, 28, 28);
  const title = doc.splitTextToSize(site || input.job?.name || "Material order", 400);
  doc.text(title, 54, y);
  y += title.length * 20 + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  if (input.customer) {
    doc.text(`Job for ${input.customer}`, 54, y);
    y += 14;
  }
  if (input.order.vendor.trim()) {
    doc.text(`Supplier: ${input.order.vendor.trim()}`, 54, y);
    y += 14;
  }
  if (input.order.neededBy) {
    doc.text(`Needed by ${formatDate(input.order.neededBy)}`, 54, y);
    y += 14;
  }
  if (input.orderedBy?.trim()) {
    doc.text(`Ordered by ${input.orderedBy.trim()}`, 54, y);
    y += 14;
  }
  const manager = input.projectManager?.name.trim() ?? "";
  if (manager && manager !== input.orderedBy?.trim()) {
    doc.text(`Project manager ${manager}`, 54, y);
    y += 16;
  } else {
    y += 4;
  }

  y = ensureSpace(doc, y, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("QTY", qtyX, y);
  doc.text("UNIT", unitX, y);
  doc.text("ITEM", nameX, y);
  doc.text("UNIT COST", costX, y, { align: "right" });
  doc.text("AMOUNT", amountX, y, { align: "right" });
  y += 6;
  doc.setTextColor(220, 220, 220);
  doc.line(54, y, right, y);
  y += 14;

  for (const line of input.lines) {
    const nameLines = doc.splitTextToSize(line.name || "Untitled", 250);
    y = ensureSpace(doc, y, 16 + nameLines.length * 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(28, 28, 28);
    doc.text(String(line.quantity), qtyX, y);
    doc.text(line.unit, unitX, y);
    doc.text(nameLines, nameX, y);
    doc.text(formatMoney(line.unitCost), costX, y, { align: "right" });
    doc.text(formatMoney(materialOrderLineAmount(line)), amountX, y, { align: "right" });
    y += Math.max(16, nameLines.length * 12);
  }

  y += 6;
  y = ensureSpace(doc, y, 36);
  doc.setTextColor(220, 220, 220);
  doc.line(costX - 80, y, right, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(28, 28, 28);
  doc.text("Estimated material cost", costX, y, { align: "right" });
  doc.text(formatMoney(total), amountX, y, { align: "right" });
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Unit costs from this company’s price book. Not a supplier quote.", 54, y);
  y += 16;

  const notes = input.order.notes.trim();
  if (notes) {
    y += 8;
    y = ensureSpace(doc, y, 36);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text("NOTES", 54, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const wrapped = doc.splitTextToSize(notes, 504);
    for (const piece of wrapped) {
      y = ensureSpace(doc, y, 14);
      doc.text(piece, 54, y);
      y += 13;
    }
  }

  downloadBlob(doc.output("blob"), `${input.order.number}-material-order.pdf`);
}
