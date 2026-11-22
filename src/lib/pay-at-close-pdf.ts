import type { CompanySettings, Job } from "@/lib/types";
import { formatCompanyAddress, formatCompanyContact } from "@/lib/format";
import { loadLogoForPdf } from "@/lib/letterhead-pdf";
import { downloadBlob } from "@/lib/share";
import {
  LIEN_KIND_LABELS,
  LISTING_STATUS_LABELS,
  PAY_AT_CLOSE_STATUS_LABELS,
  RECOMMENDATION_LABELS,
  estimateMortgageBalance,
  type JobPayAtClose,
  type RiskSeverity,
} from "@/lib/pay-at-close";

type RGB = [number, number, number];

const INK: RGB = [20, 20, 20];
const MUTED: RGB = [96, 96, 96];
const RULE: RGB = [200, 200, 200];
const CARD: RGB = [244, 244, 244];
const GREEN: RGB = [22, 128, 72];
const AMBER: RGB = [184, 118, 12];
const RED: RGB = [196, 40, 52];
const SKY: RGB = [22, 92, 150];

const INSET = 44;

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
    .replace(/\u00D7/g, "x")
    .replace(/\u00F7/g, "/")
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
  return pageHeight(doc) - 56;
}

function linesOf(doc: Doc, value: string, width: number) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const lines = doc.splitTextToSize(trimmed, width);
  return (Array.isArray(lines) ? lines : [lines]).map((line) => String(line)).filter((line) => line.trim());
}

function ensure(doc: Doc, y: number, needed: number) {
  if (y + needed <= contentBottom(doc)) return y;
  doc.addPage();
  return 52;
}

function usd(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function dateLabel(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function severityColor(severity: RiskSeverity): RGB {
  return severity === "high" ? RED : severity === "watch" ? AMBER : MUTED;
}

function recommendationColor(code: string): RGB {
  if (code === "approve") return GREEN;
  if (code === "approve_with_deposit") return SKY;
  if (code === "review") return AMBER;
  return RED;
}

async function drawHeader(doc: Doc, company: CompanySettings) {
  const width = pageWidth(doc);
  const right = width - INSET;
  const logo = company.logoUrl?.trim() ? await loadLogoForPdf(company.logoUrl) : null;
  let textX = INSET;
  let bottom = 44;
  if (logo) {
    const max = 40;
    const scale = Math.min(max / logo.width, max / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    doc.addImage(logo.data, logo.format, INSET, 40, w, h);
    textX = INSET + w + 10;
    bottom = 40 + h;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  paint(doc, INK);
  doc.text(company.name || "Company", textX, 54);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  paint(doc, MUTED);
  let y = 66;
  for (const line of [formatCompanyAddress(company), formatCompanyContact(company)].filter(Boolean)) {
    doc.text(line, textX, y);
    y += 11;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  paint(doc, INK);
  doc.text("PAY AT CLOSE", right, 52, { align: "right" });
  doc.text("RISK REVIEW", right, 68, { align: "right" });
  const ruleY = Math.max(y + 4, bottom + 8, 84);
  stroke(doc, INK);
  doc.setLineWidth(0.9);
  doc.line(INSET, ruleY, right, ruleY);
  return ruleY + 16;
}

function sectionTitle(doc: Doc, y: number, title: string) {
  y = ensure(doc, y, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  paint(doc, MUTED);
  doc.text(title.toUpperCase(), INSET, y);
  stroke(doc, RULE);
  doc.setLineWidth(0.5);
  doc.line(INSET, y + 4, pageWidth(doc) - INSET, y + 4);
  return y + 16;
}

function keyValueGrid(doc: Doc, y: number, rows: Array<[string, string]>, columns = 3) {
  const width = pageWidth(doc) - INSET * 2;
  const col = width / columns;
  let index = 0;
  while (index < rows.length) {
    const slice = rows.slice(index, index + columns);
    const heights = slice.map(([, value]) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      return linesOf(doc, value || "—", col - 10).length;
    });
    const rowHeight = 12 + Math.max(1, ...heights) * 11 + 6;
    y = ensure(doc, y, rowHeight);
    slice.forEach(([label, value], slot) => {
      const x = INSET + slot * col;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      paint(doc, MUTED);
      doc.text(label, x, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      paint(doc, INK);
      let textY = y + 12;
      for (const line of linesOf(doc, value || "—", col - 10)) {
        doc.text(line, x, textY);
        textY += 11;
      }
    });
    y += rowHeight;
    index += columns;
  }
  return y;
}

function paragraph(doc: Doc, y: number, text: string, size = 9.5, leading = 12.5, color: RGB = INK) {
  const width = pageWidth(doc) - INSET * 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  paint(doc, color);
  for (const line of linesOf(doc, text, width)) {
    y = ensure(doc, y, leading);
    doc.text(line, INSET, y);
    y += leading;
  }
  return y;
}

function moneyRow(doc: Doc, y: number, label: string, amount: number, options?: { strong?: boolean; estimated?: boolean; detail?: string; negative?: boolean }) {
  const right = pageWidth(doc) - INSET;
  const labelWidth = right - INSET - 110;
  doc.setFont("helvetica", options?.strong ? "bold" : "normal");
  doc.setFontSize(9.5);
  const labelLines = linesOf(doc, `${label}${options?.estimated ? " (est.)" : ""}`, labelWidth);
  doc.setFontSize(7.5);
  const detailLines = options?.detail ? linesOf(doc, options.detail, labelWidth) : [];
  const height = labelLines.length * 12 + detailLines.length * 9.5 + 5;
  y = ensure(doc, y, height);
  paint(doc, INK);
  doc.setFont("helvetica", options?.strong ? "bold" : "normal");
  doc.setFontSize(9.5);
  let textY = y;
  for (const line of labelLines) {
    doc.text(line, INSET, textY);
    textY += 12;
  }
  const shown = options?.negative ? `(${usd(Math.abs(amount))})` : usd(amount);
  paint(doc, options?.negative && !options?.strong ? MUTED : INK);
  doc.text(shown, right, y, { align: "right" });
  if (detailLines.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    paint(doc, MUTED);
    for (const line of detailLines) {
      doc.text(line, INSET, textY - 2);
      textY += 9.5;
    }
  }
  stroke(doc, RULE);
  doc.setLineWidth(0.4);
  doc.line(INSET, y + height - 7, right, y + height - 7);
  return y + height;
}

function stampFooter(doc: Doc, company: CompanySettings, generated: string) {
  const pages = doc.getNumberOfPages();
  const width = pageWidth(doc);
  const height = pageHeight(doc);
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const y = height - 34;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    paint(doc, MUTED);
    doc.text(`${company.name} · Pay at Close risk review · ${generated}`, INSET, y);
    doc.text(`Page ${page} of ${pages}`, width - INSET, y, { align: "right" });
    const disclaimer =
      "Figures marked (est.) come from public records and stated assumptions, not from payoff statements. Not legal, tax, or lending advice.";
    doc.text(linesOf(doc, disclaimer, width - INSET * 2), INSET, y + 10);
  }
}

export type PayAtClosePdfInput = {
  company: CompanySettings;
  job: Job;
  record: JobPayAtClose;
  homeowner: string;
};

export function payAtCloseFilename(job: Job) {
  const base = (job.code || job.name || "job").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `${base || "job"}-pay-at-close-review.pdf`;
}

export async function buildPayAtClosePdf(input: PayAtClosePdfInput) {
  const { company, job, record } = input;
  const report = record.report;
  if (!report) throw new Error("Run the property review before downloading the report.");
  const doc = await createDoc();
  const width = pageWidth(doc) - INSET * 2;
  let y = await drawHeader(doc, company);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  paint(doc, INK);
  doc.text(job.location || job.name, INSET, y);
  y += 15;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  paint(doc, MUTED);
  doc.text(
    [job.code, input.homeowner ? `Homeowner ${input.homeowner}` : "", `Status ${PAY_AT_CLOSE_STATUS_LABELS[record.status]}`]
      .filter(Boolean)
      .join("  ·  "),
    INSET,
    y,
  );
  y += 18;

  // Recommendation card.
  const cardHeight = 62;
  fill(doc, CARD);
  doc.roundedRect(INSET, y, width, cardHeight, 5, 5, "F");
  const cardCols = width / 4;
  const metrics: Array<[string, string, RGB?]> = [
    ["RECOMMENDATION", RECOMMENDATION_LABELS[report.recommendation], recommendationColor(report.recommendation)],
    ["RISK SCORE", `${report.score} / 100`],
    ["COVERAGE", report.waterfall.coverageRatio != null ? `${report.waterfall.coverageRatio.toFixed(2)}x` : "—"],
    ["DUE AT CLOSING", usd(report.waterfall.payAtCloseAmount)],
  ];
  metrics.forEach(([label, value, color], index) => {
    const x = INSET + 12 + index * cardCols;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    paint(doc, MUTED);
    doc.text(label, x, y + 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    paint(doc, color ?? INK);
    doc.text(value, x, y + 42);
  });
  y += cardHeight + 16;

  y = sectionTitle(doc, y, "Summary");
  y = paragraph(doc, y, report.narrative);
  y += 6;

  y = sectionTitle(doc, y, "Approval");
  y = keyValueGrid(doc, y, [
    ["Requested by", record.requestedAt ? [record.requestedByName, dateLabel(record.requestedAt)].filter(Boolean).join(" · ") : "—"],
    [
      "Decision",
      record.decidedAt
        ? `${record.status === "declined" ? "Declined" : "Approved"} · ${[record.decidedByName, dateLabel(record.decidedAt)].filter(Boolean).join(" · ")}`
        : "Awaiting company admin",
    ],
  ]);
  if (record.decisionNote) y = paragraph(doc, y, record.decisionNote);
  y += 4;

  y = sectionTitle(doc, y, "Deal");
  y = keyValueGrid(doc, y, [
    ["Pay-at-close amount", usd(record.contractValue)],
    ["Deposit collected", usd(record.depositAmount)],
    ["Expected closing", dateLabel(record.expectedCloseDate)],
    ["Listing", record.listingStatus ? LISTING_STATUS_LABELS[record.listingStatus] : "—"],
    ["List price", record.listPrice ? usd(record.listPrice) : "—"],
    ["Sale contract price", record.contractPrice ? usd(record.contractPrice) : "—"],
    ["Title company", [record.titleCompany, record.escrowFileNumber ? `#${record.escrowFileNumber}` : ""].filter(Boolean).join(" ") || "—"],
    ["Escrow officer", [record.escrowOfficer, record.escrowEmail, record.escrowPhone].filter(Boolean).join(" · ") || "—"],
    ["Signers", record.signerNames || "—"],
  ]);
  y += 4;

  const property = record.property;
  y = sectionTitle(doc, y, "Public property record");
  if (property) {
    y = keyValueGrid(doc, y, [
      ["Owner of record", property.ownerNames.join(", ")],
      ["Vesting", property.vesting],
      ["APN", property.apn],
      ["Last sale", property.lastSaleDate ? `${dateLabel(property.lastSaleDate)}${property.lastSalePrice ? ` · ${usd(property.lastSalePrice)}` : ""}` : "—"],
      [
        "AVM",
        property.avmValue
          ? `${usd(property.avmValue)}${property.avmLow && property.avmHigh ? ` (${usd(property.avmLow)} - ${usd(property.avmHigh)})` : ""}${property.avmConfidence != null ? `, ${property.avmConfidence}% confidence` : ""}`
          : "—",
      ],
      ["Assessed value", property.assessedValue ? usd(property.assessedValue) : "—"],
      ["Property tax", property.annualTax ? `${usd(property.annualTax)} / yr${property.taxDelinquentAmount ? ` · ${usd(property.taxDelinquentAmount)} delinquent` : ""}` : "—"],
      ["Owner occupied", property.ownerOccupied == null ? "—" : property.ownerOccupied ? "Yes" : "No"],
      [
        "Home",
        [
          property.yearBuilt ? `Built ${property.yearBuilt}` : "",
          property.livingSqFt ? `${property.livingSqFt.toLocaleString("en-US")} sq ft` : "",
          property.beds ? `${property.beds} bd` : "",
          property.baths ? `${property.baths} ba` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      ],
    ]);
    if (property.mortgages.length) {
      y = ensure(doc, y, 16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      paint(doc, MUTED);
      doc.text("RECORDED LOANS", INSET, y);
      y += 12;
      for (const mortgage of property.mortgages) {
        const estimate = estimateMortgageBalance(mortgage);
        const label = `${mortgage.isHeloc ? "HELOC" : `Mortgage ${mortgage.position}`}${mortgage.lender ? ` · ${mortgage.lender}` : ""}${mortgage.loanType ? ` · ${mortgage.loanType}` : ""}`;
        const detail = mortgage.isHeloc
          ? `Recorded line ${usd(mortgage.originalAmount)}; counted as fully drawn.`
          : `Recorded ${usd(mortgage.originalAmount)} ${dateLabel(mortgage.recordedDate)}, amortized ${estimate.monthsElapsed} months at ${estimate.rateUsed.toFixed(2)}%${estimate.assumedRate ? " (assumed)" : ""}.`;
        y = moneyRow(doc, y, label, estimate.balance, { estimated: true, detail });
      }
    }
    const distress = [
      property.distress.noticeOfDefault ? "Notice of default" : "",
      property.distress.lisPendens ? "Lis pendens" : "",
      property.distress.bankruptcy ? "Bankruptcy" : "",
      property.distress.taxLien ? "Tax lien" : "",
    ].filter(Boolean);
    y = ensure(doc, y, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    paint(doc, distress.length ? RED : MUTED);
    doc.text(`Distress signals: ${distress.length ? distress.join(", ") : "none found"}`, INSET, y + 4);
    y += 18;
  } else {
    y = paragraph(doc, y, "No public-record pull on file. Figures below rely on office-entered values only.", 9.5, 12.5, MUTED);
    y += 4;
  }

  y = sectionTitle(doc, y, "Equity waterfall");
  const w = report.waterfall;
  y = moneyRow(doc, y, w.valueSource, w.estimatedValue, { strong: true, estimated: w.valueEstimated });
  for (const line of w.lines) {
    y = moneyRow(doc, y, line.label, line.amount, { estimated: line.estimated, detail: line.detail, negative: true });
  }
  y = moneyRow(doc, y, "Seller closing costs and concessions", w.closingCosts, { estimated: true, negative: true });
  y = moneyRow(doc, y, "Estimated seller net proceeds", w.netProceeds, { strong: true });
  y = moneyRow(doc, y, `Due to ${company.name} at closing`, w.payAtCloseAmount, { negative: true });
  y = moneyRow(doc, y, "Seller cushion after our payment", w.cushion, { strong: true });
  y += 6;

  y = sectionTitle(doc, y, `Risk flags (${report.flags.length})`);
  if (report.flags.length === 0) {
    y = paragraph(doc, y, "No flags.", 9.5, 12.5, MUTED);
  }
  for (const flag of report.flags) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    const titleLines = linesOf(doc, flag.title, width - 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const detailLines = linesOf(doc, flag.detail, width - 50);
    const height = titleLines.length * 12 + detailLines.length * 10.5 + 8;
    y = ensure(doc, y, height);
    const tag = flag.severity === "high" ? "HIGH" : flag.severity === "watch" ? "WATCH" : "INFO";
    fill(doc, severityColor(flag.severity));
    doc.roundedRect(INSET, y - 8, 38, 12, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    paint(doc, [255, 255, 255]);
    doc.text(tag, INSET + 19, y, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    paint(doc, INK);
    let textY = y;
    for (const line of titleLines) {
      doc.text(line, INSET + 46, textY);
      textY += 12;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    paint(doc, MUTED);
    for (const line of detailLines) {
      doc.text(line, INSET + 46, textY - 2);
      textY += 10.5;
    }
    y += height;
  }
  y += 4;

  y = sectionTitle(doc, y, "Paperwork checklist");
  for (const item of record.checklist) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const detailLines = linesOf(doc, item.detail, width - 30);
    const height = 12 + detailLines.length * 10 + 4;
    y = ensure(doc, y, height);
    stroke(doc, item.done ? GREEN : MUTED);
    doc.setLineWidth(0.8);
    doc.rect(INSET, y - 8, 9, 9);
    if (item.done) {
      doc.line(INSET + 2, y - 4, INSET + 4, y - 1);
      doc.line(INSET + 4, y - 1, INSET + 8, y - 7);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    paint(doc, INK);
    doc.text(item.label, INSET + 16, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    paint(doc, MUTED);
    doc.text(item.done && item.doneAt ? `Done ${dateLabel(item.doneAt)}` : item.dueNote, pageWidth(doc) - INSET, y, { align: "right" });
    doc.setFontSize(8.5);
    let textY = y + 11;
    for (const line of detailLines) {
      doc.text(line, INSET + 16, textY);
      textY += 10;
    }
    y += height;
  }
  y += 4;

  if (record.liens.length) {
    y = sectionTitle(doc, y, "Liens and payoffs entered by the office");
    for (const lien of record.liens) {
      y = moneyRow(doc, y, `${LIEN_KIND_LABELS[lien.kind]}${lien.holder ? ` · ${lien.holder}` : ""}`, lien.amount, {
        estimated: !lien.verified,
        detail: [lien.verified ? "Verified payoff" : "Unverified", lien.notes].filter(Boolean).join(". "),
      });
    }
    y += 4;
  }

  y = sectionTitle(doc, y, "Assumptions and sources");
  for (const line of [...report.assumptions, ...report.sources]) {
    y = paragraph(doc, y, `- ${line}`, 8.5, 11, MUTED);
  }
  if (record.notes.trim()) {
    y += 4;
    y = sectionTitle(doc, y, "Office notes");
    y = paragraph(doc, y, record.notes, 9, 12);
  }

  stampFooter(doc, company, dateLabel(report.generatedAt));
  return doc.output("blob");
}

export async function downloadPayAtClosePdf(input: PayAtClosePdfInput) {
  const blob = await buildPayAtClosePdf(input);
  downloadBlob(blob, payAtCloseFilename(input.job));
}
