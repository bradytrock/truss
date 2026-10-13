import {
  CLOSEOUT_STATUS_LABELS,
  COMPARE_STATUS_LABELS,
  closeoutPdfFilename,
  type CommissionCloseout,
  type CommissionSheet,
} from "@/lib/commission-closeout";
import { formatDate, formatMoney } from "@/lib/format";
import { writePdfLetterhead } from "@/lib/letterhead-pdf";
import { downloadBlob } from "@/lib/share";
import type { CompanySettings } from "@/lib/types";

type Doc = {
  setFont: (face: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  setDrawColor: (r: number, g?: number, b?: number) => void;
  setFillColor: (r: number, g?: number, b?: number) => void;
  text: (text: string | string[], x: number, y: number, options?: { align?: "left" | "right" | "center" }) => void;
  splitTextToSize: (text: string, width: number) => string[];
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  addPage: () => void;
  addImage: (imageData: string, format: string, x: number, y: number, w: number, h: number) => void;
  output: (type: "blob") => Blob;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
};

type Align = "left" | "right";
type Cell = { text: string; x: number; width: number; align: Align };

const INSET = 40;

function pdfSafe(value: string) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\u0000-\u00FF]/g, "");
}

async function createDoc() {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const rawText = doc.text.bind(doc);
  const rawSplit = doc.splitTextToSize.bind(doc);
  doc.text = ((text: string | string[], x: number, y: number, options?: { align?: "left" | "right" | "center" }) => {
    if (Array.isArray(text)) return rawText(text.map((line) => pdfSafe(line)), x, y, options);
    return rawText(pdfSafe(text), x, y, options);
  }) as typeof doc.text;
  doc.splitTextToSize = ((text: string, size: number) => rawSplit(pdfSafe(text), size)) as typeof doc.splitTextToSize;
  return doc as unknown as Doc;
}

function pageRight(doc: Doc) {
  return doc.internal.pageSize.getWidth() - INSET;
}

function pageBottom(doc: Doc) {
  return doc.internal.pageSize.getHeight() - 36;
}

function blank(value: string) {
  const trimmed = value.trim();
  return trimmed || "-";
}

function money(value: number) {
  return formatMoney(value);
}

function ratio(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  const percent = value * 100;
  const digits = Number.isInteger(percent) ? 0 : 1;
  return `${percent.toFixed(digits)}%`;
}

function linesOf(doc: Doc, text: string, width: number, limit?: number) {
  const lines = doc.splitTextToSize(text.trim() || " ", width);
  const list = (Array.isArray(lines) ? lines : [String(lines)]).flatMap((piece) => String(piece).split("\n"));
  const filled = list.length > 0 ? list : [" "];
  return limit ? filled.slice(0, limit) : filled;
}

export async function buildCloseoutPdf(input: {
  sheet: CommissionSheet;
  company: CompanySettings;
  closeout?: CommissionCloseout | null;
}) {
  const doc = await createDoc();
  const sheet = input.sheet;
  const right = pageRight(doc);
  const running = `Closeout ${sheet.jobCode || sheet.customerName || "job"}`;

  function ensure(y: number, needed: number) {
    if (y + needed <= pageBottom(doc)) return y;
    doc.addPage();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(running, INSET, 28);
    return 44;
  }

  function heading(y: number, title: string) {
    y = ensure(y, 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(title, INSET, y);
    y += 4;
    doc.setDrawColor(220, 220, 220);
    doc.line(INSET, y, right, y);
    return y + 12;
  }

  function row(y: number, cells: Cell[], bold = false) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9);
    const prepared = cells.map((cell) => ({ ...cell, lines: linesOf(doc, cell.text, cell.width, 2) }));
    const height = Math.max(13, ...prepared.map((cell) => cell.lines.length * 11));
    y = ensure(y, height + 2);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(28, 28, 28);
    for (const cell of prepared) {
      cell.lines.forEach((line, index) => {
        const x = cell.align === "right" ? cell.x + cell.width : cell.x;
        doc.text(line, x, y + index * 11, { align: cell.align });
      });
    }
    return y + height;
  }

  function paragraph(y: number, text: string, size = 9) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    const wrapped = linesOf(doc, text, right - INSET);
    for (const line of wrapped) {
      y = ensure(y, 12);
      doc.setTextColor(70, 70, 70);
      doc.text(line, INSET, y);
      y += 12;
    }
    return y;
  }

  function banner(start: number, text: string, fill: [number, number, number]) {
    const next = ensure(start, 22);
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.rect(INSET, next - 11, right - INSET, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(24, 24, 24);
    doc.text(text, INSET + 8, next);
    return next + 16;
  }

  let y = await writePdfLetterhead(doc, input.company, 46, INSET, { showContact: false, nameSize: 14 });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(28, 28, 28);
  doc.text("Closeout", INSET, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  const status = input.closeout ? CLOSEOUT_STATUS_LABELS[input.closeout.status] : "Not submitted";
  const submitted = input.closeout?.submittedByName ? `Submitted by ${input.closeout.submittedByName}` : "";
  doc.text([sheet.jobCode, status, submitted].filter(Boolean).join("  ·  "), right, y, { align: "right" });
  y += 18;

  const fields: Array<[string, string]> = [
    ["Customer", sheet.customerName],
    ["Project address", sheet.projectAddress],
    ["Project manager", sheet.projectManager],
    ["Lead", sheet.lead],
    ["Phone", sheet.phone],
    ["Email", sheet.email],
    ["Closing date", sheet.closingDate ? formatDate(sheet.closingDate) : ""],
    ["Job #", sheet.jobCode],
  ];
  const colW = (right - INSET) / 4;
  fields.forEach((field, index) => {
    const col = index % 4;
    if (col === 0) y = ensure(y, 28);
    const x = INSET + col * colW;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(field[0].toUpperCase(), x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(28, 28, 28);
    const value = linesOf(doc, blank(field[1]), colW - 8);
    doc.text(value[0] ?? "-", x, y + 12);
    if (col === 3) y += 28;
  });
  if (fields.length % 4 !== 0) y += 28;
  y += 6;

  y = heading(y, "INCOME");
  y = row(y, [
    { text: "Payment", x: INSET, width: 170, align: "left" },
    { text: "Amount", x: 220, width: 110, align: "right" },
    { text: "Pay method", x: 350, width: 200, align: "left" },
    { text: "CC fees", x: 560, width: right - 560, align: "right" },
  ], true);
  if (sheet.payments.length === 0) {
    y = row(y, [{ text: "No posted payments on this job yet.", x: INSET, width: right - INSET, align: "left" }]);
  }
  for (const payment of sheet.payments) {
    y = row(y, [
      { text: payment.label, x: INSET, width: 170, align: "left" },
      { text: money(payment.amount), x: 220, width: 110, align: "right" },
      { text: payment.method, x: 350, width: 200, align: "left" },
      { text: money(payment.ccFee), x: 560, width: right - 560, align: "right" },
    ]);
  }
  if (sheet.hiddenPayments > 0) {
    y = row(y, [{
      text: `${sheet.hiddenPayments} more payment${sheet.hiddenPayments === 1 ? "" : "s"} are in the totals.`,
      x: INSET,
      width: right - INSET,
      align: "left",
    }]);
  }
  for (const total of [
    ["Payments received", sheet.paymentsReceived],
    ["Merchant fees 4%", sheet.merchantFees],
    ["Customer refund", sheet.customerRefund],
    ["Total payments", sheet.totalPayments],
    ["Job sold amount", sheet.jobSold],
  ] as const) {
    y = row(
      y,
      [
        { text: total[0], x: INSET, width: 280, align: "left" },
        { text: money(total[1]), x: 560, width: right - 560, align: "right" },
      ],
      total[0] === "Total payments" || total[0] === "Job sold amount",
    );
  }
  y += 8;

  y = heading(y, "SCOPE");
  y = row(y, [
    { text: "", x: INSET, width: 110, align: "left" },
    { text: "ISOW", x: 160, width: 110, align: "right" },
    { text: "TSOW", x: 280, width: 110, align: "right" },
    { text: "ZSOW", x: 400, width: 110, align: "right" },
    { text: "Difference", x: 520, width: right - 520, align: "right" },
  ], true);
  for (const scope of [...sheet.scopes, {
    label: "Total",
    isow: sheet.scopeTotals.isow,
    tsow: sheet.scopeTotals.tsow,
    zsow: sheet.scopeTotals.zsow,
    difference: sheet.scopeTotals.difference,
  }]) {
    y = row(y, [
      { text: scope.label, x: INSET, width: 110, align: "left" },
      { text: money(scope.isow), x: 160, width: 110, align: "right" },
      { text: money(scope.tsow), x: 280, width: 110, align: "right" },
      { text: money(scope.zsow), x: 400, width: 110, align: "right" },
      { text: ratio(scope.difference), x: 520, width: right - 520, align: "right" },
    ], scope.label === "Total");
  }
  y += 4;
  y = paragraph(
    y,
    `Carrier ${blank(sheet.carrier)}    O&P ${money(sheet.overheadProfit)}    RCV ${money(sheet.rcv)}    Est. profit ${sheet.estProfit == null ? "-" : money(sheet.estProfit)}    Actual profit ${money(sheet.actualProfit)}    ZSOW due ${money(sheet.due)}`,
  );
  y = paragraph(y, "ISOW is the insurance scope. TSOW is the sold contract. ZSOW is what this closeout settles, after the deductible when there is a claim.");
  y += 6;

  y = heading(y, "EXPENSES");
  if (sheet.expenseLines.length === 0) {
    y = row(y, [{ text: "No expenses on this job yet.", x: INSET, width: right - INSET, align: "left" }]);
  }
  for (const line of sheet.expenseLines) {
    y = row(y, [
      { text: line.forecasted ? `${line.vendor} (Forecast)` : line.vendor, x: INSET, width: 520, align: "left" },
      { text: money(line.amount), x: 560, width: right - 560, align: "right" },
    ]);
  }
  y = row(y, [
    { text: "Total expenses", x: INSET, width: 280, align: "left" },
    { text: money(sheet.totalExpenses), x: 560, width: right - 560, align: "right" },
  ], true);
  y = row(y, [
    { text: "Profit margin", x: INSET, width: 280, align: "left" },
    { text: ratio(sheet.margin), x: 560, width: right - 560, align: "right" },
  ]);
  y = row(y, [
    { text: "Total profit", x: INSET, width: 280, align: "left" },
    { text: money(sheet.profit), x: 560, width: right - 560, align: "right" },
  ], true);
  y += 8;

  y = heading(y, "COMMISSION");
  y = row(y, [
    { text: "Split", x: INSET, width: 180, align: "left" },
    { text: "%", x: 230, width: 50, align: "right" },
    { text: "Comm $", x: 290, width: 100, align: "right" },
    { text: "Trades", x: 400, width: 100, align: "right" },
    { text: "Draw", x: 510, width: 100, align: "right" },
    { text: "Check $", x: 620, width: right - 620, align: "right" },
  ], true);
  for (const line of sheet.splits) {
    y = row(y, [
      { text: line.label, x: INSET, width: 180, align: "left" },
      { text: line.percent == null ? "-" : `${line.percent}%`, x: 230, width: 50, align: "right" },
      { text: money(line.comm), x: 290, width: 100, align: "right" },
      { text: money(line.trades), x: 400, width: 100, align: "right" },
      { text: money(line.draw), x: 510, width: 100, align: "right" },
      { text: money(line.check), x: 620, width: right - 620, align: "right" },
    ]);
  }
  y = row(y, [
    { text: "Total", x: INSET, width: 180, align: "left" },
    { text: sheet.splitTotals.percent == null ? "-" : `${sheet.splitTotals.percent}%`, x: 230, width: 50, align: "right" },
    { text: money(sheet.splitTotals.comm), x: 290, width: 100, align: "right" },
    { text: money(sheet.splitTotals.trades), x: 400, width: 100, align: "right" },
    { text: money(sheet.splitTotals.draw), x: 510, width: 100, align: "right" },
    { text: money(sheet.splitTotals.check), x: 620, width: right - 620, align: "right" },
  ], true);
  y += 4;
  y = paragraph(y, "Payee checks come out of the project manager's check. Warranty, trades, and draws stay on their own lines.");
  if (sheet.validationOnly) {
    y = paragraph(y, "These numbers are for validation only until accounting accepts the costs.");
  }
  y += 6;

  if (sheet.expensesAreForecasted) {
    y = banner(y, "All job expenses in this project are FORECASTED.", [255, 225, 74]);
  } else if (sheet.costBasis === "mixed") {
    y = banner(y, "Some costs are still forecasted. Total expenses uses the bills already on the job.", [255, 225, 74]);
  } else if (sheet.costBasis === "none") {
    y = banner(y, "This job has no expenses yet.", [255, 248, 240]);
  }

  if (input.closeout?.accountingNote.trim()) {
    y = paragraph(y, `Accounting: ${input.closeout.accountingNote.trim()}`);
  }
  if (input.closeout?.notes.trim()) {
    y = paragraph(y, `Note: ${input.closeout.notes.trim()}`);
  }
  y += 6;

  y = heading(y, "QUICKBOOKS AND CRM EXPENSES");
  y = paragraph(y, "Posted bills start from what this CRM sent to QuickBooks. Add any bill that is in QuickBooks and not on the job.");
  y = row(y, [
    { text: "Vendor", x: INSET, width: 220, align: "left" },
    { text: "CRM", x: 270, width: 120, align: "right" },
    { text: "QuickBooks", x: 400, width: 180, align: "right" },
    { text: "Result", x: 590, width: right - 590, align: "left" },
  ], true);
  if (sheet.compare.length === 0) {
    y = row(y, [{ text: "Nothing to compare yet.", x: INSET, width: right - INSET, align: "left" }]);
  }
  for (const item of sheet.compare) {
    const qb = item.qb ? `${money(item.qb.amount)}${item.qb.txnId ? ` ${item.qb.txnId}` : ""}` : "-";
    y = row(y, [
      { text: item.vendor, x: INSET, width: 220, align: "left" },
      { text: item.crm ? money(item.crm.amount) : "-", x: 270, width: 120, align: "right" },
      { text: qb, x: 400, width: 180, align: "right" },
      { text: COMPARE_STATUS_LABELS[item.status], x: 590, width: right - 590, align: "left" },
    ]);
  }

  return doc.output("blob");
}

export async function downloadCloseoutPdf(input: {
  sheet: CommissionSheet;
  company: CompanySettings;
  closeout?: CommissionCloseout | null;
}) {
  const blob = await buildCloseoutPdf(input);
  const name = closeoutPdfFilename(input.sheet.jobCode);
  downloadBlob(blob, name);
  return { blob, name };
}
