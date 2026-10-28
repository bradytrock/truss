import {
  CLOSEOUT_STATUS_LABELS,
  COMPARE_STATUS_LABELS,
  closeoutPdfFilename,
  type CommissionCloseout,
  type CommissionSheet,
  type ExpenseCompareStatus,
} from "@/lib/commission-closeout";
import { formatCompanyAddress, formatDate, formatMoney, formatPhone } from "@/lib/format";
import { loadLogoForPdf } from "@/lib/letterhead-pdf";
import { downloadBlob } from "@/lib/share";
import type { CompanySettings } from "@/lib/types";

type RGB = [number, number, number];

type Doc = {
  setFont: (face: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  setDrawColor: (r: number, g?: number, b?: number) => void;
  setFillColor: (r: number, g?: number, b?: number) => void;
  setLineWidth: (width: number) => void;
  setCharSpace: (space: number) => void;
  text: (text: string | string[], x: number, y: number, options?: { align?: "left" | "right" | "center" }) => void;
  splitTextToSize: (text: string, width: number) => string[];
  getTextWidth: (text: string) => number;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string) => void;
  triangle: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, style?: string) => void;
  addPage: () => void;
  setPage: (page: number) => void;
  getNumberOfPages: () => number;
  addImage: (imageData: string, format: string, x: number, y: number, w: number, h: number) => void;
  output: (type: "blob") => Blob;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
};

type Logo = NonNullable<Awaited<ReturnType<typeof loadLogoForPdf>>>;
type Align = "left" | "right";
type Cell = { text: string; width: number; align: Align; color?: RGB; bold?: boolean };

const RED: RGB = [213, 15, 32];
const INK: RGB = [23, 24, 28];
const MUTED: RGB = [120, 122, 128];
const LABEL: RGB = [132, 134, 140];
const LINE: RGB = [226, 227, 230];
const ZEBRA: RGB = [246, 247, 249];
const CARD: RGB = [244, 245, 247];
const AMBER: RGB = [146, 90, 12];
const AMBER_LINE: RGB = [196, 138, 48];
const WHITE: RGB = [255, 255, 255];

const LEFT = 36;
const RIGHT = 756;
const WIDTH = RIGHT - LEFT;
const ROW_H = 18;
const FOOTER_RULE = 558;
const FOOTER_TEXT = 574;
const CONTENT_BOTTOM = 546;
const DASH = "\u2014";

function pdfSafe(value: string) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2212/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\u0000-\u00FF\u2013\u2014]/g, "");
}

async function createDoc() {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
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

function shown(value: string) {
  const trimmed = value.trim();
  return trimmed || DASH;
}

function money(value: number) {
  return formatMoney(value);
}

function moneyColor(value: number, onDark = false): RGB {
  if (onDark) return WHITE;
  return value < 0 ? RED : INK;
}

function percentText(value: number | null) {
  if (value == null || !Number.isFinite(value)) return DASH;
  const percent = value * 100;
  const digits = Number.isInteger(percent) ? 0 : 1;
  return `${percent.toFixed(digits)}%`;
}

function splitPercentText(value: number | null) {
  if (value == null || !Number.isFinite(value)) return DASH;
  const digits = Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(digits)}%`;
}

function websiteLabel(website: string) {
  return website.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function clip(doc: Doc, text: string, width: number) {
  const value = text.trim();
  if (width <= 8) return "";
  if (doc.getTextWidth(value) <= width) return value;
  let end = value.length;
  while (end > 1 && doc.getTextWidth(`${value.slice(0, end)}...`) > width) end -= 1;
  return `${value.slice(0, end).trimEnd()}...`;
}

function wrap(doc: Doc, text: string, width: number) {
  const lines = doc.splitTextToSize(text.trim() || " ", width);
  const list = (Array.isArray(lines) ? lines : [String(lines)]).flatMap((piece) => String(piece).split("\n"));
  return list.length > 0 ? list : [" "];
}

function resultColor(status: ExpenseCompareStatus): RGB {
  if (status === "match") return MUTED;
  if (status === "amount") return RED;
  return AMBER;
}

function placeLogo(doc: Doc, logo: Logo | null, x: number, y: number, max: number) {
  if (!logo) return 0;
  const scale = Math.min(max / logo.width, max / logo.height);
  const w = logo.width * scale;
  const h = logo.height * scale;
  doc.addImage(logo.data, logo.format, x, y + (max - h) / 2, w, h);
  return w;
}

export async function buildCloseoutPdf(input: {
  sheet: CommissionSheet;
  company: CompanySettings;
  closeout?: CommissionCloseout | null;
}) {
  const doc = await createDoc();
  const sheet = input.sheet;
  const company = input.company;
  const closeout = input.closeout ?? null;
  const logo = company.logoUrl?.trim() ? await loadLogoForPdf(company.logoUrl) : null;
  const address = formatCompanyAddress(company);
  const site = websiteLabel(company.website);
  const companyLine = [company.name, site].filter(Boolean).join(" · ");
  const phone = sheet.phone.trim() ? formatPhone(sheet.phone) : DASH;
  const pmCheck = sheet.splitTotals.check;
  const jobCode = shown(sheet.jobCode);
  const customer = shown(sheet.customerName);

  const statusText = (closeout ? CLOSEOUT_STATUS_LABELS[closeout.status] : "Not submitted").toUpperCase();
  const submitted = closeout?.submittedByName?.trim()
    ? `Submitted by ${closeout.submittedByName.trim()}`
    : "Not submitted";
  const closed = sheet.closingDate ? `Closed ${formatDate(sheet.closingDate)}` : "";
  const coverMeta = [submitted, closed].filter(Boolean).join(" · ");
  const followMeta = [customer, shown(sheet.projectAddress)].join(" · ");

  let coverMetaY = 96;
  let followMetaY = 40;
  let followClearX = 280;

  function rule(x: number, y: number, w: number, color: RGB = LINE, width = 0.6) {
    stroke(doc, color);
    doc.setLineWidth(width);
    doc.line(x, y, x + w, y);
  }

  function bar() {
    fill(doc, RED);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 4.5, "F");
  }

  function pillWidth(text: string, size = 7.5, tracking = 0.45, pad = 20) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setCharSpace(0);
    return doc.getTextWidth(text) + Math.max(0, text.length - 1) * tracking + pad;
  }

  function drawPill(text: string, right: number, baseline: number, tone: "black" | "amber") {
    const width = pillWidth(text);
    const height = 16;
    const x = right - width;
    const y = baseline - 11;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setCharSpace(0.45);
    if (tone === "black") {
      fill(doc, INK);
      doc.roundedRect(x, y, width, height, 3, 3, "F");
      paint(doc, WHITE);
    } else {
      fill(doc, [255, 251, 245]);
      stroke(doc, AMBER_LINE);
      doc.setLineWidth(0.9);
      doc.roundedRect(x, y, width, height, 3, 3, "FD");
      paint(doc, AMBER);
    }
    doc.text(text, x + 9, baseline);
    doc.setCharSpace(0);
    return x;
  }

  function drawStatusPills(baseline: number) {
    let right = RIGHT;
    right = drawPill(statusText, right, baseline, "black") - 10;
    if (sheet.validationOnly) drawPill("PENDING ACCOUNTING VALIDATION", right, baseline, "amber");
  }

  function drawCoverHeader() {
    bar();
    const logoW = placeLogo(doc, logo, LEFT, 16, 32);
    const textX = LEFT + (logoW ? logoW + 10 : 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    paint(doc, INK);
    const nameMax = 360;
    doc.text(clip(doc, company.name || "Company", nameMax), textX, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    paint(doc, MUTED);
    if (address) doc.text(clip(doc, address, nameMax), textX, 46);
    drawStatusPills(40);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    paint(doc, INK);
    doc.text("Job Closeout", LEFT, 86);
    const titleW = doc.getTextWidth("Job Closeout");
    doc.setFontSize(16);
    paint(doc, RED);
    doc.text(clip(doc, jobCode, 220), LEFT + titleW + 10, 86);
    coverMetaY = 86;
    rule(LEFT, 102, WIDTH, LINE, 0.7);
  }

  function drawFollowHeader() {
    bar();
    const logoW = placeLogo(doc, logo, LEFT, 14, 26);
    let textX = LEFT + (logoW ? logoW + 8 : 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    paint(doc, INK);
    doc.text("Job Closeout", textX, 34);
    textX += doc.getTextWidth("Job Closeout") + 8;
    doc.setFontSize(13);
    paint(doc, RED);
    doc.text(clip(doc, jobCode, 180), textX, 34);
    followMetaY = 34;
    followClearX = textX + doc.getTextWidth(clip(doc, jobCode, 180)) + 16;
    rule(LEFT, 50, WIDTH, LINE, 0.7);
  }

  let opened = false;
  function openPage(kind: "cover" | "follow") {
    if (opened) doc.addPage();
    opened = true;
    if (kind === "cover") drawCoverHeader();
    else drawFollowHeader();
  }

  function sectionTitle(x: number, y: number, title: string) {
    fill(doc, RED);
    doc.rect(x, y - 7, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setCharSpace(0.35);
    paint(doc, INK);
    doc.text(title, x + 12, y);
    doc.setCharSpace(0);
    return y + 16;
  }

  function drawHead(x: number, y: number, cells: Cell[]) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setCharSpace(0.5);
    paint(doc, LABEL);
    let cursor = x;
    for (const cell of cells) {
      const pad = 1;
      const tx = cell.align === "right" ? cursor + cell.width - pad : cursor + pad;
      doc.text(cell.text, tx, y + 10, { align: cell.align });
      cursor += cell.width;
    }
    doc.setCharSpace(0);
    rule(x, y + 15, cells.reduce((sum, cell) => sum + cell.width, 0));
    return y + 17;
  }

  function drawRow(x: number, y: number, cells: Cell[], options?: { bold?: boolean; shade?: boolean; strong?: boolean }) {
    const width = cells.reduce((sum, cell) => sum + cell.width, 0);
    if (options?.shade) {
      fill(doc, ZEBRA);
      doc.rect(x, y, width, ROW_H, "F");
    }
    if (options?.strong) rule(x, y, width, [196, 197, 201], 0.9);
    const baseline = y + 12.2;
    let cursor = x;
    for (const cell of cells) {
      doc.setFont("helvetica", options?.bold || cell.bold ? "bold" : "normal");
      doc.setFontSize(9.5);
      paint(doc, cell.color ?? INK);
      const pad = 1;
      const inner = Math.max(8, cell.width - pad * 2);
      const tx = cell.align === "right" ? cursor + cell.width - pad : cursor + pad;
      doc.text(clip(doc, cell.text, inner), tx, baseline, { align: cell.align });
      cursor += cell.width;
    }
    if (!options?.strong) rule(x, y + ROW_H, width);
    else rule(x, y + ROW_H, width, LINE, 0.5);
    return y + ROW_H;
  }

  function fieldGrid(y: number) {
    const rows: Array<Array<[string, string]>> = [
      [
        ["CUSTOMER", shown(sheet.customerName)],
        ["PROJECT ADDRESS", shown(sheet.projectAddress)],
        ["PROJECT MANAGER", shown(sheet.projectManager)],
        ["LEAD", shown(sheet.lead)],
      ],
      [
        ["PHONE", phone],
        ["EMAIL", shown(sheet.email)],
        ["CLOSING DATE", sheet.closingDate ? formatDate(sheet.closingDate) : DASH],
        ["JOB #", shown(sheet.jobCode)],
      ],
    ];
    const colW = WIDTH / 4;
    for (const row of rows) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      const wrapped = row.map(([, value]) => wrap(doc, value, colW - 14).slice(0, 2));
      const lines = Math.max(1, ...wrapped.map((parts) => parts.length));
      row.forEach(([label], index) => {
        const x = LEFT + index * colW;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setCharSpace(0.65);
        paint(doc, LABEL);
        doc.text(label, x, y);
        doc.setCharSpace(0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        paint(doc, INK);
        wrapped[index]?.forEach((part, line) => {
          doc.text(part, x, y + 15 + line * 13);
        });
      });
      y += 18 + lines * 13 + 6;
    }
    return y;
  }

  function kpiStrip(y: number) {
    const height = 58;
    const cellW = WIDTH / 5;
    fill(doc, WHITE);
    stroke(doc, [214, 215, 218]);
    doc.setLineWidth(0.9);
    doc.roundedRect(LEFT, y, WIDTH, height, 6, 6, "FD");
    stroke(doc, LINE);
    doc.setLineWidth(0.6);
    for (let index = 1; index < 4; index += 1) {
      const x = LEFT + index * cellW;
      doc.line(x, y + 12, x, y + height - 12);
    }
    const darkX = LEFT + 4 * cellW;
    fill(doc, INK);
    doc.roundedRect(darkX, y + 0.45, cellW - 0.45, height - 0.9, 5.5, 5.5, "F");
    doc.rect(darkX, y + 0.45, 12, height - 0.9, "F");

    const profitLabel = sheet.margin == null ? "PROFIT" : `PROFIT · ${percentText(sheet.margin)}`;
    const cells: Array<{ label: string; value: string; dark?: boolean; amount: number }> = [
      { label: "JOB SOLD", value: money(sheet.jobSold), amount: sheet.jobSold },
      { label: "NET COLLECTED", value: money(sheet.totalPayments), amount: sheet.totalPayments },
      { label: "EXPENSES", value: money(sheet.totalExpenses), amount: sheet.totalExpenses },
      { label: profitLabel, value: money(sheet.profit), amount: sheet.profit },
      { label: "PM CHECK", value: money(pmCheck), amount: pmCheck, dark: true },
    ];
    cells.forEach((cell, index) => {
      const x = LEFT + index * cellW + 12;
      const max = cellW - 22;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setCharSpace(0.45);
      paint(doc, cell.dark ? [206, 207, 212] : LABEL);
      doc.text(clip(doc, cell.label, max), x, y + 18);
      doc.setCharSpace(0);
      let size = 16;
      doc.setFontSize(size);
      while (size > 10 && doc.getTextWidth(cell.value) > max) {
        size -= 0.5;
        doc.setFontSize(size);
      }
      paint(doc, moneyColor(cell.amount, cell.dark));
      doc.text(cell.value, x, y + 42);
    });
    return y + height;
  }

  function metricStrip(x: number, y: number, width: number, cells: Array<{ label: string; value: string; color?: RGB }>) {
    const height = 42;
    fill(doc, CARD);
    doc.roundedRect(x, y, width, height, 5, 5, "F");
    const cellW = width / cells.length;
    cells.forEach((cell, index) => {
      const cx = x + index * cellW;
      if (index > 0) {
        stroke(doc, [226, 227, 230]);
        doc.setLineWidth(0.6);
        doc.line(cx, y + 8, cx, y + height - 8);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setCharSpace(0.4);
      paint(doc, LABEL);
      doc.text(cell.label, cx + 10, y + 15);
      doc.setCharSpace(0);
      doc.setFontSize(11);
      paint(doc, cell.color ?? INK);
      doc.text(clip(doc, cell.value, cellW - 18), cx + 10, y + 32);
    });
    return y + height;
  }

  function fits(y: number, needed: number) {
    return y + needed <= CONTENT_BOTTOM;
  }

  const leftW = 328;
  const rightX = LEFT + leftW + 22;
  const rightW = RIGHT - rightX;

  openPage("cover");
  let y = fieldGrid(122);
  y = kpiStrip(y + 8) + 22;

  function incomeHead(tableW: number): Cell[] {
    const fee = 70;
    const amount = 86;
    const method = 80;
    return [
      { text: "PAYMENT", width: tableW - fee - amount - method, align: "left" },
      { text: "METHOD", width: method, align: "left" },
      { text: "AMOUNT", width: amount, align: "right" },
      { text: "CC FEE", width: fee, align: "right" },
    ];
  }
  const scopeHead: Cell[] = [
    { text: "LINE", width: 72, align: "left" },
    { text: "ISOW · INSURANCE", width: 86, align: "right" },
    { text: "TSOW · SOLD", width: 72, align: "right" },
    { text: "ZSOW · SETTLED", width: 78, align: "right" },
    { text: "DIFFERENCE", width: rightW - 308, align: "right" },
  ];

  let incomeWidth = leftW;
  let incomeY = sectionTitle(LEFT, y, "INCOME");
  incomeY = drawHead(LEFT, incomeY, incomeHead(incomeWidth));
  let scopeY = sectionTitle(rightX, y, "SCOPE");
  scopeY = drawHead(rightX, scopeY, scopeHead);

  function continueIncome() {
    openPage("follow");
    incomeWidth = WIDTH;
    incomeY = sectionTitle(LEFT, 72, "INCOME");
    incomeY = drawHead(LEFT, incomeY, incomeHead(incomeWidth));
  }

  function paymentCells(payment: CommissionSheet["payments"][number]): Cell[] {
    const cols = incomeHead(incomeWidth);
    const fee = payment.ccFee;
    return [
      { text: payment.label, width: cols[0]!.width, align: "left" },
      { text: shown(payment.method), width: cols[1]!.width, align: "left" },
      { text: money(payment.amount), width: cols[2]!.width, align: "right", color: moneyColor(payment.amount) },
      { text: money(fee), width: cols[3]!.width, align: "right", color: fee > 0 ? INK : MUTED },
    ];
  }

  function summaryCells(label: string, value: number, signed = false, bold = false): Cell[] {
    const shownValue = signed && value > 0 ? -value : value;
    return [
      { text: label, width: incomeWidth - 90, align: "left", bold },
      { text: money(shownValue), width: 90, align: "right", color: moneyColor(shownValue), bold },
    ];
  }

  const payments = sheet.payments.length
    ? sheet.payments
    : [null];
  for (const payment of payments) {
    if (!fits(incomeY, ROW_H)) continueIncome();
    incomeY = payment
      ? drawRow(LEFT, incomeY, paymentCells(payment))
      : drawRow(LEFT, incomeY, [{ text: "No posted payments on this job yet.", width: incomeWidth, align: "left", color: MUTED }]);
  }
  if (sheet.hiddenPayments > 0) {
    if (!fits(incomeY, ROW_H)) continueIncome();
    incomeY = drawRow(LEFT, incomeY, [{
      text: `${sheet.hiddenPayments} more payment${sheet.hiddenPayments === 1 ? "" : "s"} are in the totals.`,
      width: incomeWidth,
      align: "left",
      color: MUTED,
    }]);
  }
  for (const line of sheet.refundLines) {
    if (!fits(incomeY, ROW_H)) continueIncome();
    incomeY = drawRow(LEFT, incomeY, summaryCells(line.label, line.amount));
  }
  const summaries: Array<[string, number, boolean, boolean]> = [
    ["Payments received", sheet.paymentsReceived, false, false],
    ["Merchant fees (4%)", sheet.merchantFees, true, false],
    ["Customer refund", sheet.customerRefund, false, false],
    ["Total payments", sheet.totalPayments, false, true],
  ];
  for (const [label, value, signed, bold] of summaries) {
    if (!fits(incomeY, ROW_H)) continueIncome();
    incomeY = drawRow(LEFT, incomeY, summaryCells(label, value, signed, bold), { bold, strong: bold });
  }

  const scopeRows = [
    ...sheet.scopes,
    {
      label: "Total",
      isow: sheet.scopeTotals.isow,
      tsow: sheet.scopeTotals.tsow,
      zsow: sheet.scopeTotals.zsow,
      difference: sheet.scopeTotals.difference,
    },
  ];
  for (const scope of scopeRows) {
    const total = scope.label === "Total";
    const diff = percentText(scope.difference);
    scopeY = drawRow(
      rightX,
      scopeY,
      [
        { text: scope.label, width: 72, align: "left" },
        { text: money(scope.isow), width: 86, align: "right" },
        { text: money(scope.tsow), width: 72, align: "right" },
        { text: money(scope.zsow), width: 78, align: "right" },
        { text: diff, width: rightW - 308, align: "right", color: diff === DASH ? MUTED : INK },
      ],
      { bold: total, strong: total },
    );
  }
  scopeY += 12;
  const est = sheet.estProfit == null ? DASH : money(sheet.estProfit);
  metricStrip(rightX, scopeY, rightW, [
    { label: "O&P", value: money(sheet.overheadProfit) },
    { label: "RCV", value: money(sheet.rcv) },
    { label: "EST. PROFIT", value: est, color: est === DASH ? MUTED : INK },
    { label: "ACTUAL PROFIT", value: money(sheet.actualProfit) },
  ]);
  if (sheet.carrier.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, MUTED);
    doc.text(clip(doc, `Carrier · ${sheet.carrier.trim()}`, rightW), rightX, scopeY + 56);
  }

  const expenseW = 300;
  const commissionX = LEFT + expenseW + 24;
  const commissionW = RIGHT - commissionX;
  const expenseHead: Cell[] = [
    { text: "VENDOR", width: expenseW - 84, align: "left" },
    { text: "AMOUNT", width: 84, align: "right" },
  ];
  const commissionCols = commissionColumns(commissionW);

  openPage("follow");
  let detailY = 70;
  const banner =
    sheet.expensesAreForecasted
      ? "All job expenses in this project are FORECASTED."
      : sheet.costBasis === "mixed"
        ? "Some costs are still forecasted. Total expenses uses the bills already on the job."
        : "";
  if (banner) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const bannerW = Math.min(WIDTH, doc.getTextWidth(banner) + 20);
    fill(doc, [255, 248, 232]);
    stroke(doc, AMBER_LINE);
    doc.setLineWidth(0.8);
    doc.roundedRect(LEFT, detailY, bannerW, 16, 3, 3, "FD");
    paint(doc, AMBER);
    doc.text(banner, LEFT + 10, detailY + 11);
    detailY += 26;
  }

  const sectionTop = detailY;
  let expenseY = sectionTitle(LEFT, sectionTop, "EXPENSES");
  expenseY = drawHead(LEFT, expenseY, expenseHead);

  function expenseCells(vendor: string, amount: number | null, width: number): Cell[] {
    const amountW = 84;
    return [
      { text: vendor, width: width - amountW, align: "left" },
      amount == null
        ? { text: "", width: amountW, align: "right" }
        : { text: money(amount), width: amountW, align: "right", color: moneyColor(amount) },
    ];
  }

  function expenseLabel(line: CommissionSheet["expenseLines"][number]) {
    const tags = [
      line.disposition === "customer_refund" ? "Customer refund" : "",
      line.disposition === "pm_deduction" ? "Commission deduction" : "",
      line.forecasted && sheet.costBasis === "mixed" ? "Forecast" : "",
    ].filter(Boolean);
    return tags.length ? `${line.vendor} · ${tags.join(" · ")}` : line.vendor;
  }

  let expenseIndex = 0;
  const expenseLines = sheet.expenseLines;
  const expensePage = doc.getNumberOfPages();
  while (expenseIndex < expenseLines.length && fits(expenseY, ROW_H)) {
    const line = expenseLines[expenseIndex]!;
    expenseY = drawRow(LEFT, expenseY, expenseCells(expenseLabel(line), line.amount, expenseW));
    expenseIndex += 1;
  }
  if (expenseLines.length === 0) {
    expenseY = drawRow(LEFT, expenseY, [{ text: "No expenses on this job yet.", width: expenseW, align: "left", color: MUTED }]);
  }

  let commissionY = sectionTitle(commissionX, sectionTop, "COMMISSION");
  commissionY = drawHead(commissionX, commissionY, commissionCols);
  sheet.splits.forEach((line, index) => {
    const check = moneyColor(line.check);
    commissionY = drawRow(
      commissionX,
      commissionY,
      [
        { text: line.label, width: commissionCols[0]!.width, align: "left" },
        { text: splitPercentText(line.percent), width: commissionCols[1]!.width, align: "right", color: line.percent == null ? MUTED : INK },
        { text: money(line.comm), width: commissionCols[2]!.width, align: "right" },
        { text: money(line.trades), width: commissionCols[3]!.width, align: "right" },
        { text: money(line.draw), width: commissionCols[4]!.width, align: "right" },
        { text: money(line.check), width: commissionCols[5]!.width, align: "right", color: check },
      ],
      { bold: line.id === "pm", shade: index === 0, strong: false },
    );
  });
  const totals = sheet.splitTotals;
  commissionY = drawRow(
    commissionX,
    commissionY,
    [
      { text: "Total", width: commissionCols[0]!.width, align: "left" },
      { text: splitPercentText(totals.percent), width: commissionCols[1]!.width, align: "right", color: totals.percent == null ? MUTED : INK },
      { text: money(totals.comm), width: commissionCols[2]!.width, align: "right" },
      { text: money(totals.trades), width: commissionCols[3]!.width, align: "right" },
      { text: money(totals.draw), width: commissionCols[4]!.width, align: "right" },
      { text: money(totals.check), width: commissionCols[5]!.width, align: "right", color: moneyColor(totals.check) },
    ],
    { bold: true, strong: true },
  );
  commissionY += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  paint(doc, MUTED);
  for (const line of wrap(doc, "Payee checks come out of the project manager's check. Warranty, trades and draws stay on their own lines.", commissionW)) {
    doc.text(line, commissionX, commissionY);
    commissionY += 11;
  }

  function drawProfitCards(x: number, y: number) {
    const height = 46;
    const half = expenseW / 2;
    fill(doc, CARD);
    doc.roundedRect(x, y, expenseW, height, 5, 5, "F");
    stroke(doc, [220, 221, 224]);
    doc.setLineWidth(0.6);
    doc.line(x + half, y + 8, x + half, y + height - 8);
    const cards = [
      { label: "PROFIT MARGIN", value: percentText(sheet.margin), color: sheet.margin == null ? MUTED : INK },
      { label: "TOTAL PROFIT", value: money(sheet.profit), color: moneyColor(sheet.profit) },
    ];
    cards.forEach((card, index) => {
      const cx = x + index * half + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setCharSpace(0.4);
      paint(doc, LABEL);
      doc.text(card.label, cx, y + 16);
      doc.setCharSpace(0);
      doc.setFontSize(13);
      paint(doc, card.color);
      doc.text(clip(doc, card.value, half - 20), cx, y + 34);
    });
    return y + height;
  }

  function finishExpenses(startY: number, pageStarted: number) {
    let cursor = startY;
    let page = pageStarted;
    const fullHead: Cell[] = [
      { text: "VENDOR", width: WIDTH - 100, align: "left" },
      { text: "AMOUNT", width: 100, align: "right" },
    ];
    while (expenseIndex < expenseLines.length) {
      if (!fits(cursor, ROW_H)) {
        openPage("follow");
        page = doc.getNumberOfPages();
        cursor = sectionTitle(LEFT, 70, "EXPENSES");
        cursor = drawHead(LEFT, cursor, fullHead);
      }
      const line = expenseLines[expenseIndex]!;
      const full = doc.getNumberOfPages() !== pageStarted;
      cursor = drawRow(
        LEFT,
        cursor,
        full ? expenseCells(expenseLabel(line), line.amount, WIDTH) : expenseCells(expenseLabel(line), line.amount, expenseW),
      );
      expenseIndex += 1;
    }
    if (!fits(cursor, ROW_H + 58)) {
      openPage("follow");
      page = doc.getNumberOfPages();
      cursor = sectionTitle(LEFT, 70, "EXPENSES");
    }
    const totalWidth = doc.getNumberOfPages() === pageStarted ? expenseW : WIDTH;
    cursor = drawRow(
      LEFT,
      cursor,
      [
        { text: "Total expenses", width: totalWidth - 84, align: "left" },
        { text: money(sheet.totalExpenses), width: 84, align: "right" },
      ],
      { bold: true, strong: true },
    );
    cursor = drawProfitCards(LEFT, cursor + 12);
    return { cursor, page };
  }

  const expensesDone = finishExpenses(expenseY, expensePage);
  let cursor = doc.getNumberOfPages() === expensePage ? Math.max(expensesDone.cursor, commissionY) + 20 : expensesDone.cursor + 20;

  const openBills = sheet.compare.filter((row) => row.status !== "match").length;
  const qbHead: Cell[] = [
    { text: "VENDOR", width: 280, align: "left" },
    { text: "CRM", width: 130, align: "right" },
    { text: "QUICKBOOKS", width: 150, align: "right" },
    { text: "RESULT", width: WIDTH - 560, align: "right" },
  ];

  function drawQuickbooks(startY: number) {
    let qy = startY;
    if (!fits(qy, 78)) {
      openPage("follow");
      qy = 70;
    }
    const titleY = qy;
    qy = sectionTitle(LEFT, qy, "QUICKBOOKS RECONCILIATION");
    if (openBills > 0 && sheet.compare.length > 0) {
      const alert = `${openBills} of ${sheet.compare.length} bill${sheet.compare.length === 1 ? "" : "s"} not yet in QuickBooks`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const width = doc.getTextWidth(alert) + 26;
      const x = RIGHT - width;
      const top = titleY - 11;
      fill(doc, [255, 248, 240]);
      stroke(doc, AMBER_LINE);
      doc.setLineWidth(0.8);
      doc.roundedRect(x, top, width, 16, 8, 8, "FD");
      fill(doc, AMBER);
      doc.triangle(x + 11, top + 3, x + 7, top + 12, x + 15, top + 12, "F");
      paint(doc, AMBER);
      doc.text(alert, x + 18, titleY);
    }
    qy = drawHead(LEFT, qy, qbHead);
    if (sheet.compare.length === 0) {
      qy = drawRow(LEFT, qy, [{ text: "Nothing to compare yet.", width: WIDTH, align: "left", color: MUTED }]);
    }
    for (const item of sheet.compare) {
      if (!fits(qy, ROW_H)) {
        openPage("follow");
        qy = sectionTitle(LEFT, 70, "QUICKBOOKS RECONCILIATION");
        qy = drawHead(LEFT, qy, qbHead);
      }
      qy = drawRow(LEFT, qy, [
        { text: item.vendor, width: 280, align: "left" },
        { text: item.crm ? money(item.crm.amount) : DASH, width: 130, align: "right", color: item.crm ? INK : MUTED },
        { text: item.qb ? money(item.qb.amount) : DASH, width: 150, align: "right", color: item.qb ? INK : MUTED },
        { text: COMPARE_STATUS_LABELS[item.status], width: WIDTH - 560, align: "right", color: resultColor(item.status) },
      ]);
    }
    qy += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, MUTED);
    for (const line of wrap(doc, "Posted bills start from what the CRM sent to QuickBooks. Add any bill that is in QuickBooks and not on the job.", WIDTH)) {
      if (!fits(qy, 12)) {
        openPage("follow");
        qy = 74;
      }
      doc.text(line, LEFT, qy);
      qy += 11;
    }
    return qy;
  }

  cursor = drawQuickbooks(cursor);

  const notes = [
    sheet.pmDeductions.length
      ? `Commission deductions: ${sheet.pmDeductions.map((line) => `${line.vendor} ${money(line.amount)}`).join(", ")}. These come out of the project manager's check and are not job expenses.`
      : "",
    closeout?.accountingNote.trim() ? `Accounting: ${closeout.accountingNote.trim()}` : "",
    closeout?.notes.trim() ? `Note: ${closeout.notes.trim()}` : "",
  ].filter(Boolean);

  const noteLines = notes.flatMap((note) => wrap(doc, note, WIDTH));
  const notesHeight = noteLines.length * 12;
  if (!fits(cursor + 8, notesHeight + 40)) {
    openPage("follow");
    cursor = 74;
  }
  cursor += 14;
  if (noteLines.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    paint(doc, MUTED);
    for (const line of noteLines) {
      doc.text(line, LEFT, cursor);
      cursor += 12;
    }
    cursor += 8;
  }

  const signatureY = cursor + 36 < 500 && fits(516, 28) ? 516 : cursor + 14;
  const gap = 16;
  const sigW = (WIDTH - gap * 2) / 3;
  const labels = [`Project manager · ${shown(sheet.projectManager)}`, "Accounting approval", "Date"];
  labels.forEach((label, index) => {
    const x = LEFT + index * (sigW + gap);
    rule(x, signatureY, sigW, [188, 189, 194], 0.7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, MUTED);
    doc.text(clip(doc, label, sigW), x, signatureY + 14);
  });

  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    const last = page === total;
    const footerLeft = last && page > 1 && sheet.validationOnly
      ? "Figures are for validation only until accounting accepts the costs."
      : companyLine;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, MUTED);
    rule(LEFT, FOOTER_RULE, WIDTH, LINE, 0.6);
    doc.text(clip(doc, footerLeft, 430), LEFT, FOOTER_TEXT);
    const pageBit = page === 1 ? `Page ${page} of ${total}` : `Page ${page} of ${total}`;
    const meta = page === 1 ? `${coverMeta} · ${pageBit}` : `${followMeta} · ${pageBit}`;
    const metaY = page === 1 ? coverMetaY : followMetaY;
    const clear = page === 1 ? 340 : Math.max(followClearX, 280);
    doc.text(clip(doc, meta, RIGHT - clear), RIGHT, metaY, { align: "right" });
    const footerRight = `Closeout ${jobCode} · ${customer} · ${page} / ${total}`;
    doc.text(clip(doc, footerRight, 280), RIGHT, FOOTER_TEXT, { align: "right" });
  }

  return doc.output("blob");
}

function commissionColumns(width: number): Cell[] {
  const split = 124;
  const pct = 36;
  const rest = width - split - pct;
  const comm = Math.round(rest * 0.26);
  const trades = Math.round(rest * 0.22);
  const draw = Math.round(rest * 0.22);
  const check = rest - comm - trades - draw;
  return [
    { text: "SPLIT", width: split, align: "left" },
    { text: "%", width: pct, align: "right" },
    { text: "COMM $", width: comm, align: "right" },
    { text: "TRADES", width: trades, align: "right" },
    { text: "DRAW", width: draw, align: "right" },
    { text: "CHECK $", width: check, align: "right" },
  ];
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
