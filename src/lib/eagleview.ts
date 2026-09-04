import { firstName } from "@/lib/phone";

/** Regular delivery id for most Measurement Orders products. */
export const EAGLEVIEW_REGULAR_DELIVERY_ID = 8;

/** Product presets we expose in Truss. Mapped to EagleView catalog PrimaryProductIds. */
export const EAGLEVIEW_PRODUCTS = [
  {
    id: "premium_residential",
    label: "Premium Residential",
    description: "Full roof report with squares, pitch, and diagram.",
    eagleviewProductId: 31,
    deliveryProductId: EAGLEVIEW_REGULAR_DELIVERY_ID,
  },
  {
    id: "standard_residential",
    label: "ClaimsReady Residential",
    description: "ClaimsReady residential roof measurements.",
    eagleviewProductId: 13,
    deliveryProductId: EAGLEVIEW_REGULAR_DELIVERY_ID,
  },
  {
    id: "commercial",
    label: "Premium Commercial",
    description: "Premium commercial roof measurement report.",
    eagleviewProductId: 32,
    deliveryProductId: EAGLEVIEW_REGULAR_DELIVERY_ID,
  },
] as const;

export type EagleviewProductId = (typeof EAGLEVIEW_PRODUCTS)[number]["id"];

export const EAGLEVIEW_ORDER_STATUSES = [
  "queued",
  "in_progress",
  "ready",
  "failed",
  "cancelled",
] as const;

export type EagleviewOrderStatus = (typeof EAGLEVIEW_ORDER_STATUSES)[number];

export const EAGLEVIEW_STATUS_LABELS: Record<EagleviewOrderStatus, string> = {
  queued: "Queued",
  in_progress: "In progress",
  ready: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

export type EagleviewMeasurements = {
  totalSquares?: number;
  /** Total roof area in square feet (all pitches). */
  totalAreaSqFt?: number;
  wastePercent?: number;
  /** EagleView suggested squares including waste (from the waste table). */
  suggestedSquares?: number;
  pitchSummary?: string;
  ridgesLf?: number;
  hipsLf?: number;
  valleysLf?: number;
  eavesLf?: number;
  rakesLf?: number;
  dripEdgeLf?: number;
  parapetWallsLf?: number;
  flashingLf?: number;
  stepFlashingLf?: number;
  facets?: number;
  notes?: string;
};

export type EagleviewConnection = {
  companyId: string;
  clientId: string;
  /** Never return the raw secret to the browser — only whether one is saved. */
  hasSecret: boolean;
  sandbox: boolean;
  defaultProduct: EagleviewProductId;
  webhookToken: string;
  linked: boolean;
  linkedAt: string | null;
};

export type EagleviewOrder = {
  id: string;
  companyId: string;
  jobId: string;
  estimateId: string | null;
  referenceId: string;
  eagleviewOrderId: string;
  eagleviewReportId: string;
  product: EagleviewProductId;
  status: EagleviewOrderStatus;
  statusDetail: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  claimNumber: string;
  totalSquares: number | null;
  wastePercent: number | null;
  pitchSummary: string;
  measurements: EagleviewMeasurements;
  reportFileId: string | null;
  reportUrl: string;
  appliedEstimateId: string | null;
  appliedAt: string | null;
  mocked: boolean;
  orderedBy: string;
  createdAt: string;
  updatedAt: string;
};

export function eagleviewProductLabel(id: string) {
  return EAGLEVIEW_PRODUCTS.find((item) => item.id === id)?.label || id;
}

export function eagleviewProductNumericId(id: string) {
  return EAGLEVIEW_PRODUCTS.find((item) => item.id === id)?.eagleviewProductId ?? 31;
}

export function eagleviewDeliveryProductId(id: string) {
  return (
    EAGLEVIEW_PRODUCTS.find((item) => item.id === id)?.deliveryProductId ??
    EAGLEVIEW_REGULAR_DELIVERY_ID
  );
}

function eagleviewErrorMessage(data: Record<string, unknown> | null, fallback: string) {
  if (!data) return fallback;
  const modelState = data.ModelState;
  if (modelState && typeof modelState === "object") {
    const parts: string[] = [];
    for (const value of Object.values(modelState as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string" && item.trim()) parts.push(item.trim());
        }
      } else if (typeof value === "string" && value.trim()) {
        parts.push(value.trim());
      }
    }
    if (parts.length) return parts.join(" ");
  }
  const candidates = [
    data.error_description,
    data.errorSummary,
    data.error_summary,
    data.Message,
    data.message,
    data.error,
    data.errorCode,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

export function isEagleviewProductId(value: string): value is EagleviewProductId {
  return EAGLEVIEW_PRODUCTS.some((item) => item.id === value);
}

export function parseEagleviewMeasurements(value: unknown): EagleviewMeasurements {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  const num = (key: string) => {
    const raw = row[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
    return undefined;
  };
  return {
    totalSquares: num("totalSquares") ?? num("total_squares"),
    totalAreaSqFt: num("totalAreaSqFt") ?? num("total_area_sq_ft"),
    wastePercent: num("wastePercent") ?? num("waste_percent"),
    suggestedSquares: num("suggestedSquares") ?? num("suggested_squares"),
    pitchSummary:
      typeof row.pitchSummary === "string"
        ? row.pitchSummary
        : typeof row.pitch_summary === "string"
          ? row.pitch_summary
          : undefined,
    ridgesLf: num("ridgesLf") ?? num("ridges_lf"),
    hipsLf: num("hipsLf") ?? num("hips_lf"),
    valleysLf: num("valleysLf") ?? num("valleys_lf"),
    eavesLf: num("eavesLf") ?? num("eaves_lf"),
    rakesLf: num("rakesLf") ?? num("rakes_lf"),
    dripEdgeLf: num("dripEdgeLf") ?? num("drip_edge_lf"),
    parapetWallsLf: num("parapetWallsLf") ?? num("parapet_walls_lf"),
    flashingLf: num("flashingLf") ?? num("flashing_lf"),
    stepFlashingLf: num("stepFlashingLf") ?? num("step_flashing_lf"),
    facets: num("facets"),
    notes: typeof row.notes === "string" ? row.notes : undefined,
  };
}

/** Best-effort extract from EagleView GetReport JSON (field names vary by product). */
export function measurementsFromEagleviewReport(report: Record<string, unknown>): EagleviewMeasurements {
  const direct = parseEagleviewMeasurements(report);
  const nested =
    report.Measurements && typeof report.Measurements === "object"
      ? parseEagleviewMeasurements(report.Measurements)
      : report.measurements && typeof report.measurements === "object"
        ? parseEagleviewMeasurements(report.measurements)
        : {};

  const num = (...keys: string[]) => {
    for (const key of keys) {
      const raw = report[key];
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
    }
    return undefined;
  };

  const squares =
    direct.totalSquares ??
    nested.totalSquares ??
    num("TotalSquares", "AreaSquares", "SquareCount", "RoofSquares", "squares");
  const waste =
    direct.wastePercent ??
    nested.wastePercent ??
    num("WastePercent", "SuggestedWastePercent", "waste");
  const pitch =
    direct.pitchSummary ||
    nested.pitchSummary ||
    (typeof report.Pitch === "string" ? report.Pitch : undefined) ||
    (typeof report.DominantPitch === "string" ? report.DominantPitch : undefined);

  return {
    totalSquares: squares,
    totalAreaSqFt: direct.totalAreaSqFt ?? nested.totalAreaSqFt ?? num("TotalArea", "AreaSquareFeet"),
    wastePercent: waste,
    suggestedSquares: direct.suggestedSquares ?? nested.suggestedSquares ?? num("SuggestedSquares"),
    pitchSummary: pitch,
    ridgesLf: direct.ridgesLf ?? nested.ridgesLf ?? num("LengthRidges", "RidgeLength", "Ridges"),
    hipsLf: direct.hipsLf ?? nested.hipsLf ?? num("LengthHips", "HipLength", "Hips"),
    valleysLf: direct.valleysLf ?? nested.valleysLf ?? num("LengthValleys", "ValleyLength", "Valleys"),
    eavesLf: direct.eavesLf ?? nested.eavesLf ?? num("LengthEaves", "EaveLength", "Eaves"),
    rakesLf: direct.rakesLf ?? nested.rakesLf ?? num("LengthRakes", "RakeLength", "Rakes"),
    dripEdgeLf: direct.dripEdgeLf ?? nested.dripEdgeLf ?? num("LengthDripEdge", "DripEdge"),
    parapetWallsLf: direct.parapetWallsLf ?? nested.parapetWallsLf ?? num("LengthParapets", "Parapets"),
    flashingLf: direct.flashingLf ?? nested.flashingLf ?? num("LengthFlashing", "Flashing"),
    stepFlashingLf:
      direct.stepFlashingLf ?? nested.stepFlashingLf ?? num("LengthStepFlashing", "StepFlashing"),
    facets: direct.facets ?? nested.facets ?? num("FacetCount", "Facets"),
    notes: direct.notes ?? nested.notes,
  };
}

/** Host-level credentials (optional). Company Settings can also store its own pair. */
export function eagleviewHostCredentials() {
  return {
    clientId: process.env.EAGLEVIEW_CLIENT_ID?.trim() || "",
    clientSecret: process.env.EAGLEVIEW_CLIENT_SECRET?.trim() || "",
    sandbox: process.env.EAGLEVIEW_SANDBOX?.trim() !== "false",
  };
}

export function eagleviewApiBase(sandbox: boolean) {
  return sandbox
    ? "https://sandbox.apicenter.eagleview.com"
    : "https://apicenter.eagleview.com";
}

export function eagleviewTokenUrl() {
  return "https://apicenter.eagleview.com/oauth2/v1/token";
}

export async function fetchEagleviewAccessToken(input: {
  clientId: string;
  clientSecret: string;
}) {
  // EagleView / Okta expect HTTP Basic auth, not client_id in the form body.
  const basic = Buffer.from(`${input.clientId}:${input.clientSecret}`, "utf8").toString("base64");
  try {
    const response = await fetch(eagleviewTokenUrl(), {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const accessToken = typeof data?.access_token === "string" ? data.access_token : "";
    if (!response.ok || !accessToken) {
      return {
        ok: false as const,
        error: eagleviewErrorMessage(
          data,
          `EagleView could not issue an access token (${response.status}). Check Client ID and secret.`,
        ),
      };
    }
    return {
      ok: true as const,
      accessToken,
      expiresIn: typeof data?.expires_in === "number" ? data.expires_in : 3600,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? `Could not reach EagleView auth (${error.message}).`
          : "Could not reach EagleView auth.",
    };
  }
}

export async function placeEagleviewOrder(input: {
  accessToken: string;
  sandbox: boolean;
  productId: number;
  deliveryProductId?: number;
  referenceId: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  claimNumber?: string;
}) {
  const url = `${eagleviewApiBase(input.sandbox)}/v2/Order/PlaceOrder`;
  const payload = {
    OrderReports: [
      {
        ReportAddresses: [
          {
            Address: input.street,
            City: input.city,
            State: input.state,
            Zip: input.postalCode,
            Country: "US",
            /** 1 = residential street address (required; 0 fails validation). */
            AddressType: 1,
          },
        ],
        PrimaryProductId: input.productId,
        DeliveryProductId: input.deliveryProductId ?? EAGLEVIEW_REGULAR_DELIVERY_ID,
        MeasurementInstructionType: 1,
        ChangesInLast4Years: false,
        ReferenceId: input.referenceId,
        ...(input.claimNumber?.trim()
          ? { ClaimNumber: input.claimNumber.trim() }
          : {}),
      },
    ],
  };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    let data: Record<string, unknown> | null = null;
    try {
      data = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const parsed = eagleviewErrorMessage(data, "");
      const snippet = !parsed && raw.trim() ? raw.trim().slice(0, 240) : "";
      let error =
        parsed ||
        snippet ||
        `EagleView order failed (${response.status}).`;
      if (
        input.sandbox &&
        (response.status >= 500 || /upstream connect|connection termination/i.test(error))
      ) {
        error = `${error} Sandbox looks down — uncheck “Use EagleView sandbox API” in Settings → EagleView and try again.`;
      }
      return { ok: false as const, error };
    }
    const orderId = data?.OrderId != null ? String(data.OrderId) : "";
    const reportIds = data?.ReportIds;
    const reportId =
      Array.isArray(reportIds) && reportIds[0] != null ? String(reportIds[0]) : "";
    return { ok: true as const, orderId, reportId };
  } catch (error) {
    const message =
      error instanceof Error
        ? `Could not reach EagleView order API (${error.message}).`
        : "Could not reach EagleView order API.";
    return {
      ok: false as const,
      error: input.sandbox
        ? `${message} If this keeps happening, uncheck sandbox in Settings → EagleView.`
        : message,
    };
  }
}

export async function fetchEagleviewReport(input: {
  accessToken: string;
  sandbox: boolean;
  reportId: string;
}) {
  const url = `${eagleviewApiBase(input.sandbox)}/v3/Report/GetReport?reportId=${encodeURIComponent(input.reportId)}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" },
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !data) {
      return {
        ok: false as const,
        error: eagleviewErrorMessage(data, "EagleView could not return that report."),
      };
    }
    return { ok: true as const, report: data };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? `Could not reach EagleView report API (${error.message}).`
          : "Could not reach EagleView report API.",
    };
  }
}

/** Deterministic mock measurements from an address so demos stay stable. */
export function mockEagleviewMeasurements(addressLine: string): EagleviewMeasurements {
  const seed = Array.from(addressLine).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const squares = Math.round((18 + (seed % 220) / 10) * 10) / 10;
  const waste = [10, 12, 15, 18][seed % 4];
  const pitches = ["4/12–6/12", "5/12–8/12", "6/12–9/12", "3/12–5/12"];
  return {
    totalSquares: squares,
    wastePercent: waste,
    pitchSummary: pitches[seed % pitches.length],
    ridgesLf: Math.round(40 + (seed % 80)),
    hipsLf: Math.round(20 + (seed % 60)),
    valleysLf: Math.round(15 + (seed % 50)),
    eavesLf: Math.round(80 + (seed % 120)),
    rakesLf: Math.round(30 + (seed % 70)),
    facets: 4 + (seed % 8),
    notes: "Mock EagleView report for demo — connect credentials in Settings → EagleView for live orders.",
  };
}

/** Minimal one-page PDF summarizing measurements (no external deps). */
export function buildEagleviewReportPdf(input: {
  company: string;
  address: string;
  product: string;
  orderId: string;
  measurements: EagleviewMeasurements;
  orderedBy?: string;
}) {
  const lines = [
    "EagleView roof report",
    input.company,
    `Property: ${input.address}`,
    `Product: ${input.product}`,
    `Order: ${input.orderId}`,
    input.orderedBy ? `Ordered by: ${firstName(input.orderedBy)}` : "",
    "",
    `Total squares: ${input.measurements.totalSquares ?? "—"}`,
    `Suggested squares: ${input.measurements.suggestedSquares ?? "—"}`,
    `Suggested waste: ${input.measurements.wastePercent ?? "—"}%`,
    `Pitch: ${input.measurements.pitchSummary || "—"}`,
    `Ridges: ${input.measurements.ridgesLf ?? "—"} lf`,
    `Hips: ${input.measurements.hipsLf ?? "—"} lf`,
    `Valleys: ${input.measurements.valleysLf ?? "—"} lf`,
    `Eaves/Starter: ${input.measurements.eavesLf ?? "—"} lf`,
    `Rakes: ${input.measurements.rakesLf ?? "—"} lf`,
    `Drip edge: ${input.measurements.dripEdgeLf ?? "—"} lf`,
    `Parapet walls: ${input.measurements.parapetWallsLf ?? "—"} lf`,
    `Flashing: ${input.measurements.flashingLf ?? "—"} lf`,
    `Step flashing: ${input.measurements.stepFlashingLf ?? "—"} lf`,
    `Facets: ${input.measurements.facets ?? "—"}`,
    "",
    input.measurements.notes || "",
  ].filter((line) => line !== undefined);

  const escaped = lines
    .map((line) => line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"))
    .join("\\n");

  // Simple PDF with one text block. Good enough for Files attach + download.
  const content = `BT /F1 11 Tf 50 750 Td 14 TL (${escaped}) Tj ET`;
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj",
    `4 0 obj<< /Length ${content.length} >>stream\n${content}\nendstream endobj`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${object}\n`;
  }
  const xrefStart = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(body, "utf8");
}

/**
 * Apply EagleView measurements to estimate lines.
 * Squares → field coverage lines; LF lengths → ridge/hip/valley/eave/etc. lines by title.
 */
export function applySquaresToEstimateLines<
  T extends { id: string; title: string; unit: string; quantity: number },
>(
  lines: T[],
  totalSquares: number,
  wastePercent: number | null | undefined,
  measurements?: EagleviewMeasurements | null,
) {
  const suggested = measurements?.suggestedSquares;
  const withWaste =
    suggested != null && Number.isFinite(suggested)
      ? suggested
      : wastePercent != null && Number.isFinite(wastePercent)
        ? Math.round(totalSquares * (1 + wastePercent / 100) * 100) / 100
        : totalSquares;

  const updated: Array<{ id: string; quantity: number }> = [];
  const used = new Set<string>();

  const titleHas = (line: T, ...words: string[]) => {
    const title = line.title.trim().toLowerCase();
    return words.some((word) => new RegExp(`\\b${word}\\b`, "i").test(title));
  };

  const pickByTitle = (words: string[], quantity: number | undefined) => {
    if (quantity == null || !Number.isFinite(quantity)) return;
    const target = lines.find((line) => !used.has(line.id) && titleHas(line, ...words));
    if (!target) return;
    used.add(target.id);
    updated.push({ id: target.id, quantity });
  };

  // Field coverage / squares
  const squareLine = lines.find((line) => {
    if (used.has(line.id)) return false;
    const unit = line.unit.trim().toLowerCase();
    return (
      unit === "sq" ||
      unit === "square" ||
      unit === "squares" ||
      titleHas(line, "shingle", "square", "field", "roofing")
    );
  });
  if (squareLine) {
    used.add(squareLine.id);
    updated.push({ id: squareLine.id, quantity: withWaste });
  }

  const m = measurements ?? {};
  pickByTitle(["ridge"], m.ridgesLf);
  pickByTitle(["hip"], m.hipsLf);
  pickByTitle(["valley"], m.valleysLf);
  pickByTitle(["rake"], m.rakesLf);
  pickByTitle(["eave", "starter"], m.eavesLf);
  pickByTitle(["drip"], m.dripEdgeLf);
  pickByTitle(["parapet"], m.parapetWallsLf);
  pickByTitle(["step flashing", "step-flashing"], m.stepFlashingLf);
  const flashingLine = lines.find(
    (line) =>
      !used.has(line.id) &&
      titleHas(line, "flashing") &&
      !titleHas(line, "step"),
  );
  if (flashingLine && m.flashingLf != null && Number.isFinite(m.flashingLf)) {
    used.add(flashingLine.id);
    updated.push({ id: flashingLine.id, quantity: m.flashingLf });
  }

  return {
    updated,
    quantity: withWaste,
    appliedLengths: updated.length,
  };
}
