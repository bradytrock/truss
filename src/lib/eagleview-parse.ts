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

/**
 * EagleView waste table marks Measured / Suggested under Waste % columns.
 * Typical: 0% = Measured, next column = Suggested (often 6% / 10% / 15%).
 */
function parseSuggestedWaste(section: string) {
  if (!/Measured\s+Suggested/i.test(section)) {
    return { wastePercent: undefined as number | undefined, suggestedSquares: undefined as number | undefined };
  }
  const wasteMatch = section.match(/Waste\s*%\s*((?:\d+%\s*)+)/i);
  const squaresMatch = section.match(/Squares\s*\*?\s*((?:[\d.]+(?:\s+|$))+)/i);
  if (!wasteMatch || !squaresMatch) {
    return { wastePercent: undefined, suggestedSquares: undefined };
  }
  const wastes = [...wasteMatch[1].matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
  const squares = [...squaresMatch[1].matchAll(/([\d.]+)/g)].map((m) => Number(m[1]));
  // Suggested is the second column when Measured + Suggested are present.
  const suggestedIdx = wastes.length > 1 ? 1 : 0;
  return {
    wastePercent: asFinite(wastes[suggestedIdx]),
    suggestedSquares: asFinite(squares[suggestedIdx]),
  };
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
    areaSqFt != null ? Math.round((areaSqFt / 100) * 100) / 100 : waste.suggestedSquares;

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
  const { extractText, getDocumentProxy } = await import("unpdf");
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
  return {
    text: pages.join("\n\n"),
    pages,
    totalPages: typeof result.totalPages === "number" ? result.totalPages : pages.length,
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
