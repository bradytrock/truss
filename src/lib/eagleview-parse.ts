import type { EagleviewMeasurements } from "@/lib/eagleview";

function asFinite(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? value : undefined;
}

function firstMatchNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const raw = (match[1] || match[0] || "").replace(/,/g, "");
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
}

function firstMatchString(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = (match[1] || "").trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * Pull roof measurements from EagleView (or similar) report text.
 * Works on text extracted from PDF; also accepts pasted summary text.
 */
export function parseEagleviewReportText(raw: string): EagleviewMeasurements & {
  reportId?: string;
  orderId?: string;
} {
  const text = raw.replace(/\u00a0/g, " ").replace(/\r/g, "\n");
  const compact = text.replace(/[ \t]+/g, " ");

  // Prefer labeled totals over bare "N squares" hits mid-page.
  const totalSquares = firstMatchNumber(compact, [
    /total\s*(?:roof\s*)?(?:area|squares?)\s*[:\-]?\s*([\d]+(?:\.\d+)?)\s*(?:sq|squares?)?/i,
    /(?:area|squares?)\s*[:\-]?\s*([\d]+(?:\.\d+)?)\s*(?:squares?|sq)\b/i,
    /([\d]+(?:\.\d+)?)\s*(?:squares?|sq)\b(?:\s*(?:total|roof))?/i,
  ]);

  // Square feet → squares when labeled as SF/SQ FT and no squares found.
  let squares = asFinite(totalSquares);
  if (squares == null) {
    const sqft = firstMatchNumber(compact, [
      /total\s*(?:roof\s*)?area\s*[:\-]?\s*([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sf|square\s*feet)/i,
      /([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sf|square\s*feet)/i,
    ]);
    if (sqft != null && sqft > 50) {
      squares = Math.round((sqft / 100) * 100) / 100;
    }
  }

  const wastePercent = firstMatchNumber(compact, [
    /(?:suggested\s*)?waste(?:\s*factor)?\s*[:\-]?\s*([\d]+(?:\.\d+)?)\s*%/i,
    /([\d]+(?:\.\d+)?)\s*%\s*waste/i,
  ]);

  const pitchSummary = firstMatchString(compact, [
    /predominant\s*pitch\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?\s*\/\s*12(?:\s*[–-]\s*[0-9]+(?:\.[0-9]+)?\s*\/\s*12)?)/i,
    /pitch(?:es)?\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?\s*\/\s*12(?:\s*[–-]\s*[0-9]+(?:\.[0-9]+)?\s*\/\s*12)?)/i,
    /([0-9]+(?:\.[0-9]+)?\s*\/\s*12\s*[–-]\s*[0-9]+(?:\.[0-9]+)?\s*\/\s*12)/,
  ]);

  const length = (labels: string[]) =>
    firstMatchNumber(
      compact,
      labels.flatMap((label) => [
        new RegExp(`${label}\\s*[:\\-]?\\s*([\\d]+(?:\\.\\d+)?)\\s*(?:lf|lin(?:e)?(?:ar)?\\s*ft|ft|')?`, "i"),
        new RegExp(`([\\d]+(?:\\.\\d+)?)\\s*(?:lf|ft)?\\s*${label}`, "i"),
      ]),
    );

  const ridgesLf = length(["ridges?", "ridge"]);
  const hipsLf = length(["hips?", "hip"]);
  const valleysLf = length(["valleys?", "valley"]);
  const eavesLf = length(["eaves?", "eave"]);
  const rakesLf = length(["rakes?", "rake"]);
  const facets = firstMatchNumber(compact, [
    /(?:number\s*of\s*)?facets?\s*[:\-]?\s*([\d]+)/i,
    /([\d]+)\s*facets?\b/i,
  ]);

  const reportId = firstMatchString(compact, [
    /report\s*(?:id|#|number)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i,
  ]);
  const orderId = firstMatchString(compact, [
    /order\s*(?:id|#|number)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i,
  ]);

  return {
    totalSquares: asFinite(squares),
    wastePercent: asFinite(wastePercent),
    pitchSummary,
    ridgesLf: asFinite(ridgesLf),
    hipsLf: asFinite(hipsLf),
    valleysLf: asFinite(valleysLf),
    eavesLf: asFinite(eavesLf),
    rakesLf: asFinite(rakesLf),
    facets: asFinite(facets),
    reportId,
    orderId,
    notes: squares != null ? "Parsed from uploaded EagleView report." : undefined,
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
  const result = await extractText(document, { mergePages: true });
  const rawText = result.text;
  const text = Array.isArray(rawText)
    ? rawText.join("\n")
    : typeof rawText === "string"
      ? rawText
      : "";
  return {
    text: text.replace(/\0/g, "").trim(),
    totalPages: typeof result.totalPages === "number" ? result.totalPages : 0,
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
