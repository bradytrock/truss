import type { EagleviewMeasurements } from "@/lib/eagleview";
import type { JobCustomField } from "@/lib/types";

function asFinite(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? value : undefined;
}

function parseNumber(raw: string | undefined) {
  if (!raw) return undefined;
  const num = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(num) ? num : undefined;
}

/** Read `Label = 123` (or `Label = 123 ft`) from a section, line-oriented. */
function labeledNumber(section: string, label: RegExp) {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*${label.source}\\s*=\\s*([\\d,]+(?:\\.\\d+)?)`,
    "i",
  );
  const match = section.match(pattern);
  return parseNumber(match?.[1]);
}

function labeledPitch(section: string) {
  const match = section.match(
    /(?:^|\n)\s*Predominant\s*Pitch\s*=\s*([0-9]+(?:\.[0-9]+)?\s*\/\s*12)/i,
  );
  return match?.[1]?.replace(/\s+/g, "") || undefined;
}

function labeledReportId(section: string) {
  const match = section.match(/Report:\s*([A-Za-z0-9\-]+)/i);
  return match?.[1]?.trim() || undefined;
}

/**
 * Prefer the Report Summary page (TOC "page 8") which has
 * "Lengths, Areas and Pitches". Fall back to Length Diagram totals.
 */
function pickMeasurementSection(pages: string[], fullText: string) {
  const summary =
    pages.find(
      (page) =>
        /REPORT\s*SUMMARY/i.test(page) && /Lengths,\s*Areas\s+and\s+Pitches/i.test(page),
    ) ||
    pages.find((page) => /Lengths,\s*Areas\s+and\s+Pitches/i.test(page));
  if (summary) return summary;

  const lengthDiagram = pages.find(
    (page) => /LENGTH\s*DIAGRAM/i.test(page) && /Total\s*Line\s*Lengths/i.test(page),
  );
  if (lengthDiagram) return lengthDiagram;

  // Last resort: slice from the summary heading in the merged text.
  const fromSummary = fullText.search(/REPORT\s*SUMMARY/i);
  if (fromSummary >= 0) return fullText.slice(fromSummary);
  const fromLengths = fullText.search(/Lengths,\s*Areas\s+and\s+Pitches/i);
  if (fromLengths >= 0) return fullText.slice(fromLengths);
  return fullText;
}

export type EagleviewTextItem = {
  str: string;
  x: number;
  y: number;
  page: number;
};

export type EagleviewSuggestedWaste = {
  wastePercent?: number;
  suggestedSquares?: number;
  measuredSquares?: number;
};

const EMPTY_WASTE: EagleviewSuggestedWaste = {};

function wasteTableBlock(text: string) {
  const start = text.search(/Waste\s*Calculation/i);
  if (start >= 0) return text.slice(start, start + 4000);
  const alt = text.search(/Waste\s*%/i);
  if (alt >= 0) return text.slice(alt, alt + 2500);
  return text;
}

function parsePercentList(block: string) {
  const row = block.match(/Waste\s*%\s*((?:\d+%\s*)+)/i);
  if (!row) return [] as number[];
  return [...row[1].matchAll(/(\d+)%/g)].map((match) => Number(match[1]));
}

function parseLabeledNumberList(block: string, label: RegExp) {
  const row = block.match(new RegExp(`${label.source}\\s*((?:[\\d,]+(?:\\.\\d+)?(?:\\s+|$))+)` , "i"));
  if (!row) return [] as number[];
  return [...row[1].matchAll(/([\d,]+(?:\.\d+)?)/g)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
}

function indexFromAlignment(headerLine: string, tokens: string[], labelLine: string, label: string) {
  if (!/\s{3,}/.test(labelLine) && labelLine.length < headerLine.length * 0.6) return -1;
  const found = labelLine.match(new RegExp(label, "i"));
  if (!found || found.index == null) return -1;
  const labelX = found.index + found[0].length / 2;
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  let from = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const at = headerLine.indexOf(tokens[i], from);
    if (at < 0) continue;
    from = at + tokens[i].length;
    const dist = Math.abs(at + tokens[i].length / 2 - labelX);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function suggestedColumnIndex(block: string, wastes: number[], squares: number[]) {
  const adjacentPct =
    block.match(/(\d+)\s*%[^\d%]{0,28}Suggested/i) || block.match(/Suggested[^\d%]{0,28}(\d+)\s*%/i);
  if (adjacentPct) {
    const idx = wastes.indexOf(Number(adjacentPct[1]));
    if (idx >= 0) return idx;
  }

  const adjacentSq =
    block.match(/(\d+\.\d+)\s+Suggested/i) || block.match(/Suggested\s+(\d+\.\d+)/i);
  if (adjacentSq) {
    const value = Number(adjacentSq[1]);
    const idx = squares.findIndex((square) => Math.abs(square - value) < 0.011);
    if (idx >= 0) return idx;
  }

  const wasteLine = block.split(/\n/).find((line) => /Waste\s*%/i.test(line) && /%/.test(line));
  const labelLine = block.split(/\n/).find((line) => /Suggested/i.test(line));
  if (wasteLine && labelLine) {
    const aligned = indexFromAlignment(
      wasteLine,
      wastes.map((waste) => `${waste}%`),
      labelLine,
      "Suggested",
    );
    if (aligned >= 0) return aligned;
  }

  let from = 0;
  const positions: number[] = [];
  for (const waste of wastes) {
    const at = block.indexOf(`${waste}%`, from);
    if (at < 0) break;
    positions.push(at);
    from = at + String(waste).length + 1;
  }
  const suggestedAt = block.search(/Suggested/i);
  if (suggestedAt >= 0 && positions.length === wastes.length) {
    for (let i = 0; i < positions.length; i += 1) {
      const end = i + 1 < positions.length ? positions[i + 1] : block.length;
      if (suggestedAt < positions[i] || suggestedAt >= end) continue;
      const afterLast = i === positions.length - 1 && suggestedAt - positions[i] > 40;
      if (afterLast) break;
      return i;
    }
  }

  if (wastes.length === 2) return 1;
  return -1;
}

/**
 * EagleView waste table: Measured is the 0% column; Suggested is the
 * highlighted column (often 15–21%, not the first increment).
 */
export function parseSuggestedWaste(section: string): EagleviewSuggestedWaste {
  const block = wasteTableBlock(section);
  if (!/Waste\s*%/i.test(block) && !/Suggested/i.test(block)) return EMPTY_WASTE;
  const wastes = parsePercentList(block);
  const squares = parseLabeledNumberList(block, /Squares\s*\*?/);
  if (wastes.length === 0) return EMPTY_WASTE;
  const idx = suggestedColumnIndex(block, wastes, squares);
  const measuredIdx = wastes.findIndex((waste) => waste === 0);
  return {
    wastePercent: idx >= 0 ? asFinite(wastes[idx]) : undefined,
    suggestedSquares: idx >= 0 ? asFinite(squares[idx]) : undefined,
    measuredSquares: measuredIdx >= 0 ? asFinite(squares[measuredIdx]) : asFinite(squares[0]),
  };
}

function clusterItemsByY(items: EagleviewTextItem[], tolerance = 4) {
  const rows: EagleviewTextItem[][] = [];
  for (const item of [...items].sort((left, right) => right.y - left.y || left.x - right.x)) {
    const row = rows.find((candidate) => Math.abs(candidate[0]!.y - item.y) <= tolerance);
    if (row) row.push(item);
    else rows.push([item]);
  }
  for (const row of rows) row.sort((left, right) => left.x - right.x);
  return rows;
}

function nearestItem(items: EagleviewTextItem[], x: number) {
  return items.reduce((best, item) => (Math.abs(item.x - x) < Math.abs(best.x - x) ? item : best));
}

function percentTokens(items: EagleviewTextItem[]) {
  const tokens: EagleviewTextItem[] = [];
  const sorted = [...items].sort((left, right) => left.page - right.page || right.y - left.y || left.x - right.x);
  for (let i = 0; i < sorted.length; i += 1) {
    const text = sorted[i]!.str.trim();
    if (/^\d+%$/.test(text)) {
      tokens.push({ ...sorted[i]!, str: text });
      continue;
    }
    const next = sorted[i + 1];
    if (/^\d+$/.test(text) && next && next.str.trim() === "%" && next.page === sorted[i]!.page) {
      tokens.push({ ...sorted[i]!, str: `${text}%` });
    }
  }
  return tokens;
}

/** Align the Suggested label to the waste-% and squares columns using PDF x/y. */
export function parseSuggestedWasteFromItems(items: EagleviewTextItem[]): EagleviewSuggestedWaste {
  if (items.length === 0) return EMPTY_WASTE;
  const byPage = new Map<number, EagleviewTextItem[]>();
  for (const item of items) {
    const list = byPage.get(item.page) ?? [];
    list.push(item);
    byPage.set(item.page, list);
  }

  for (const pageItems of byPage.values()) {
    const labels = pageItems.filter((item) => /^suggested$/i.test(item.str.trim()));
    const percents = percentTokens(pageItems);
    if (labels.length === 0 || percents.length < 3) continue;
    const wasteRows = clusterItemsByY(percents).filter((row) => row.length >= 3);
    if (wasteRows.length === 0) continue;
    const wasteRow = wasteRows.sort((left, right) => right.length - left.length)[0]!;
    const label = labels
      .slice()
      .sort(
        (left, right) =>
          Math.min(...wasteRow.map((item) => Math.abs(item.x - left.x))) -
          Math.min(...wasteRow.map((item) => Math.abs(item.x - right.x))),
      )[0]!;
    const percentItem = nearestItem(wasteRow, label.x);
    const wastePercent = Number(percentItem.str.replace("%", ""));
    const squareItems = pageItems.filter((item) => /^\d+\.\d+$/.test(item.str.trim()));
    const squareRows = clusterItemsByY(squareItems).filter((row) => row.length >= 3);
    const squareRow = squareRows.sort(
      (left, right) => Math.abs(left[0]!.y - label.y) - Math.abs(right[0]!.y - label.y),
    )[0];
    const suggestedSquares = squareRow
      ? asFinite(Number(nearestItem(squareRow, label.x).str))
      : undefined;
    const zero = wasteRow.find((item) => item.str === "0%");
    const measuredSquares =
      squareRow && zero ? asFinite(Number(nearestItem(squareRow, zero.x).str)) : asFinite(squareRow?.[0] ? Number(squareRow[0].str) : undefined);
    return {
      wastePercent: asFinite(wastePercent),
      suggestedSquares,
      measuredSquares,
    };
  }
  return EMPTY_WASTE;
}

function parseSummaryLengths(section: string): EagleviewMeasurements {
  const ridgesLf = labeledNumber(section, /Ridges(?!\s*\/\s*Hips)/);
  const hipsLf = labeledNumber(section, /Hips/);
  const valleysLf = labeledNumber(section, /Valleys/);
  const rakesLf = labeledNumber(section, /Rakes[†*]?/);
  const eavesLf = labeledNumber(section, /Eaves(?:\s*\/\s*Starter)?[‡*]?/);
  const dripEdgeLf = labeledNumber(section, /Drip\s*Edge(?:\s*\([^)\n]*\))?/);
  const parapetWallsLf = labeledNumber(section, /Parapet\s*Walls?/);
  const stepFlashingLf = labeledNumber(section, /Step\s*flashing/);
  const flashingLf = labeledNumber(section, /Flashing/);
  const pitchSummary = labeledPitch(section);
  const facets = labeledNumber(section, /Total\s*Roof\s*Facets/);

  const areaSqFt =
    labeledNumber(section, /Total\s*Area\s*\(\s*All\s*Pitches\s*\)/) ??
    labeledNumber(section, /Total\s*Roof\s*Area/) ??
    labeledNumber(section, /Total\s*Area/);

  const waste = parseSuggestedWaste(section);
  const totalSquares =
    areaSqFt != null
      ? Math.round((areaSqFt / 100) * 100) / 100
      : waste.measuredSquares ?? waste.suggestedSquares;

  return {
    totalAreaSqFt: asFinite(areaSqFt),
    totalSquares: asFinite(totalSquares),
    wastePercent: waste.wastePercent,
    suggestedSquares: waste.suggestedSquares,
    pitchSummary,
    ridgesLf: asFinite(ridgesLf),
    hipsLf: asFinite(hipsLf),
    valleysLf: asFinite(valleysLf),
    eavesLf: asFinite(eavesLf),
    rakesLf: asFinite(rakesLf),
    dripEdgeLf: asFinite(dripEdgeLf),
    parapetWallsLf: asFinite(parapetWallsLf),
    flashingLf: asFinite(flashingLf),
    stepFlashingLf: asFinite(stepFlashingLf),
    facets: asFinite(facets),
  };
}

/** Length Diagram page uses "Total Line Lengths:" with Ridges/Hips split. */
function parseLengthDiagram(section: string): Partial<EagleviewMeasurements> {
  if (!/Total\s*Line\s*Lengths/i.test(section)) return {};
  return {
    ridgesLf: asFinite(labeledNumber(section, /Ridges(?!\s*\/\s*Hips)/)),
    hipsLf: asFinite(labeledNumber(section, /Hips/)),
    valleysLf: asFinite(labeledNumber(section, /Valleys/)),
    rakesLf: asFinite(labeledNumber(section, /Rakes/)),
    eavesLf: asFinite(labeledNumber(section, /Eaves/)),
    flashingLf: asFinite(labeledNumber(section, /Flashing/)),
    stepFlashingLf: asFinite(labeledNumber(section, /Step\s*flashing/)),
    parapetWallsLf: asFinite(labeledNumber(section, /Parapets?/)),
  };
}

/**
 * Pull roof measurements from EagleView report text.
 * Targets Report Summary (TOC page 8): Hip, Ridge, Valley, Rakes, Eaves/Starter,
 * Drip Edge, parapet walls, flashing, step flashing, predominant pitch.
 */
export function parseEagleviewReportText(
  raw: string,
  pages?: string[],
  items?: EagleviewTextItem[],
): EagleviewMeasurements & {
  reportId?: string;
  orderId?: string;
} {
  const normalizedPages = (pages?.length ? pages : [raw]).map((page) =>
    page.replace(/\u00a0/g, " ").replace(/\r/g, "\n"),
  );
  const fullText = normalizedPages.join("\n");
  const section = pickMeasurementSection(normalizedPages, fullText);
  const fromSummary = parseSummaryLengths(section);
  const wastePages = normalizedPages.filter(
    (page) => /Waste\s*Calculation/i.test(page) || (/Waste\s*%/i.test(page) && /Suggested/i.test(page)),
  );
  const wasteFromItems = parseSuggestedWasteFromItems(items ?? []);
  const wasteFromText =
    wasteFromItems.wastePercent != null
      ? wasteFromItems
      : parseSuggestedWaste(wastePages.join("\n") || section || fullText);
  if (wasteFromText.wastePercent != null) fromSummary.wastePercent = wasteFromText.wastePercent;
  if (wasteFromText.suggestedSquares != null) fromSummary.suggestedSquares = wasteFromText.suggestedSquares;
  if (fromSummary.totalSquares == null && wasteFromText.measuredSquares != null) {
    fromSummary.totalSquares = wasteFromText.measuredSquares;
  }

  // Fill any gaps from the Length Diagram page.
  const lengthPage =
    normalizedPages.find((page) => /LENGTH\s*DIAGRAM/i.test(page)) || "";
  const fromDiagram = parseLengthDiagram(lengthPage);

  const cover = normalizedPages[0] || fullText;
  const reportId = labeledReportId(cover) || labeledReportId(fullText);
  const orderId = fullText.match(/Order\s*(?:id|#|number)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i)?.[1];

  const merged: EagleviewMeasurements = {
    ...fromDiagram,
    ...Object.fromEntries(
      Object.entries(fromSummary).filter(([, value]) => value != null && value !== ""),
    ),
  };

  // Cover page pitch / facets as last-chance fallbacks.
  if (!merged.pitchSummary) {
    merged.pitchSummary = labeledPitch(cover);
  }
  if (merged.facets == null) {
    merged.facets = asFinite(labeledNumber(cover, /Total\s*Roof\s*Facets/));
  }
  if (merged.totalAreaSqFt == null) {
    const coverArea = labeledNumber(cover, /Total\s*Roof\s*Area/);
    if (coverArea != null) {
      merged.totalAreaSqFt = coverArea;
      if (merged.totalSquares == null) {
        merged.totalSquares = Math.round((coverArea / 100) * 100) / 100;
      }
    }
  }

  const hasCore =
    merged.totalSquares != null ||
    merged.ridgesLf != null ||
    merged.hipsLf != null ||
    merged.eavesLf != null;

  return {
    ...merged,
    reportId,
    orderId,
    notes: hasCore
      ? "Parsed from EagleView Report Summary (lengths, areas, and pitches)."
      : undefined,
  };
}

/** Extract plain text from a PDF buffer (EagleView digital reports). */
export async function extractPdfText(pdf: Buffer | Uint8Array) {
  const { extractText, extractTextItems, getDocumentProxy } = await import("unpdf");
  const bytes =
    pdf instanceof Buffer
      ? new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength)
      : pdf instanceof Uint8Array
        ? pdf
        : new Uint8Array(pdf);
  // Ensure a standalone Uint8Array copy — unpdf rejects Node Buffer views.
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const document = await getDocumentProxy(data);
  const result = await extractText(document, { mergePages: false });
  const rawText = result.text;
  const pages = (Array.isArray(rawText) ? rawText : [rawText])
    .map((page) => (typeof page === "string" ? page : String(page ?? "")))
    .map((page) => page.replace(/\0/g, "").trim());
  let items: EagleviewTextItem[] = [];
  try {
    const structured = await extractTextItems(document);
    items = structured.items.flatMap((pageItems, pageIndex) =>
      pageItems.map((item) => ({
        str: (item.str ?? "").replace(/\u00a0/g, " "),
        x: item.x,
        y: item.y,
        page: pageIndex + 1,
      })),
    );
  } catch {
    items = [];
  }
  return {
    text: pages.join("\n\n"),
    pages,
    totalPages: typeof result.totalPages === "number" ? result.totalPages : pages.length,
    items,
  };
}

export function mergeEagleviewMeasurementOverrides(
  parsed: EagleviewMeasurements,
  overrides: { totalSquares?: number | null; wastePercent?: number | null; pitchSummary?: string },
): EagleviewMeasurements {
  return {
    ...parsed,
    totalSquares:
      overrides.totalSquares != null && Number.isFinite(overrides.totalSquares)
        ? overrides.totalSquares
        : parsed.totalSquares,
    wastePercent:
      overrides.wastePercent != null && Number.isFinite(overrides.wastePercent)
        ? overrides.wastePercent
        : parsed.wastePercent,
    pitchSummary: overrides.pitchSummary?.trim() || parsed.pitchSummary,
  };
}

const MEASUREMENT_FIELD_DEFS: Array<{
  id: string;
  label: string;
  key: keyof EagleviewMeasurements;
  format: "number" | "text";
  suffix?: string;
}> = [
  { id: "eagleview:squares", label: "Roof squares", key: "totalSquares", format: "number" },
  {
    id: "eagleview:suggested-squares",
    label: "Suggested squares (w/ waste)",
    key: "suggestedSquares",
    format: "number",
  },
  { id: "eagleview:waste", label: "Suggested waste", key: "wastePercent", format: "number", suffix: "%" },
  { id: "eagleview:area-sqft", label: "Total roof area", key: "totalAreaSqFt", format: "number", suffix: " sq ft" },
  { id: "eagleview:pitch", label: "Predominant pitch", key: "pitchSummary", format: "text" },
  { id: "eagleview:ridges", label: "Ridges", key: "ridgesLf", format: "number", suffix: " LF" },
  { id: "eagleview:hips", label: "Hips", key: "hipsLf", format: "number", suffix: " LF" },
  { id: "eagleview:valleys", label: "Valleys", key: "valleysLf", format: "number", suffix: " LF" },
  { id: "eagleview:rakes", label: "Rakes", key: "rakesLf", format: "number", suffix: " LF" },
  { id: "eagleview:eaves", label: "Eaves / starter", key: "eavesLf", format: "number", suffix: " LF" },
  { id: "eagleview:drip-edge", label: "Drip edge (eaves + rakes)", key: "dripEdgeLf", format: "number", suffix: " LF" },
  { id: "eagleview:parapets", label: "Parapet walls", key: "parapetWallsLf", format: "number", suffix: " LF" },
  { id: "eagleview:flashing", label: "Flashing", key: "flashingLf", format: "number", suffix: " LF" },
  { id: "eagleview:step-flashing", label: "Step flashing", key: "stepFlashingLf", format: "number", suffix: " LF" },
  { id: "eagleview:facets", label: "Roof facets", key: "facets", format: "number" },
];

/** Job custom fields so estimate writers can use EagleView lengths. */
export function eagleviewJobCustomFields(measurements: EagleviewMeasurements): JobCustomField[] {
  const fields: JobCustomField[] = [];
  for (const def of MEASUREMENT_FIELD_DEFS) {
    const raw = measurements[def.key];
    if (raw == null || raw === "") continue;
    const value =
      def.format === "number" && typeof raw === "number"
        ? `${raw}${def.suffix || ""}`
        : `${String(raw)}${def.suffix || ""}`;
    fields.push({ id: def.id, label: def.label, value });
  }
  return fields;
}

export function mergeEagleviewJobCustomFields(
  existing: JobCustomField[],
  measurements: EagleviewMeasurements,
) {
  const next = eagleviewJobCustomFields(measurements);
  const ids = new Set(next.map((field) => field.id));
  return [...existing.filter((field) => !field.id.startsWith("eagleview:") && !ids.has(field.id)), ...next];
}
