import {
  EDGE_KINDS,
  facetPoints,
  measureRoof,
  pitchLabel,
  polygonAreaPx,
  slopeFactor,
  type EdgeKind,
  type RoofDrawing,
  type RoofFacet,
} from "./roof-measure.ts";

/** Waste columns on the takeoff page, matching a supplier-style report. */
export const WASTE_FACTORS = [0, 6, 11, 16, 19, 21, 23, 26, 31] as const;

/** Pitch below this is ordered as membrane, not shingles. */
const SHINGLE_PITCH = 3;
/** Linear feet of starter in one bundle. */
const STARTER_FEET_PER_BUNDLE = 75;
/** Linear feet of hip and ridge cap in one bundle. */
const HIP_RIDGE_FEET_PER_BUNDLE = 30;
/** Linear feet of ice and water in one roll. */
const ICE_WATER_FEET_PER_ROLL = 75;

export type RoofComplexity = "simple" | "normal" | "complex";

export type ReportFacet = {
  id: string;
  letter: string;
  pitchRise: number;
  surfaceSqFt: number;
  share: number;
};

export type PitchBand = {
  pitchRise: number;
  surfaceSqFt: number;
  share: number;
};

export type LineTotal = {
  kind: EdgeKind;
  label: string;
  feet: number;
  count: number;
};

export type WasteColumn = {
  percent: number;
  thirds: number;
  areaSqFt: number;
  measured: boolean;
  recommended: boolean;
};

export type MaterialLine = {
  name: string;
  qty: number;
  unit: string;
  basedOn: string;
};

export type RoofReportModel = {
  calibrated: boolean;
  totalSqFt: number;
  steepSqFt: number;
  lowSlopeSqFt: number;
  facets: ReportFacet[];
  pitchBands: PitchBand[];
  mainPitchRise: number | null;
  mainPitchShare: number;
  wastePercent: number;
  orderThirds: number;
  lines: LineTotal[];
  hipsPlusRidges: number;
  dripFeet: number;
  dripCount: number;
  complexity: RoofComplexity;
  wasteColumns: WasteColumn[];
  materials: MaterialLine[];
};

const LINE_LABELS: Record<EdgeKind, string> = {
  ridge: "Ridges",
  hip: "Hips",
  valley: "Valleys",
  rake: "Rakes",
  eave: "Eaves",
  step_flashing: "Step flashing",
  flashing: "Flashing",
  drip: "Drip edge",
  parapet: "Parapets",
};

export function squaresToThirds(squares: number) {
  if (!Number.isFinite(squares) || squares <= 0) return 0;
  return Math.ceil(squares * 3 - 1e-6);
}

/** 48 squares → "48.00". Two thirds of a square → ".66". */
export function formatThirdSquares(thirds: number) {
  const safe = Number.isFinite(thirds) ? Math.max(0, Math.round(thirds)) : 0;
  const whole = Math.floor(safe / 3);
  const rem = safe % 3;
  const frac = rem === 1 ? "33" : rem === 2 ? "66" : "00";
  return `${whole.toLocaleString("en-US")}.${frac}`;
}

export function facetLetter(index: number) {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export function roofComplexity(facets: number, valleys: number, hips: number): RoofComplexity {
  if (facets >= 12 || valleys >= 6 || hips >= 8) return "complex";
  if (facets <= 6 && valleys <= 2 && hips <= 4) return "simple";
  return "normal";
}

export function complexityLabel(complexity: RoofComplexity) {
  if (complexity === "complex") return "complex cut";
  if (complexity === "normal") return "normal cut";
  return "simple cut";
}

export function complexityNote(report: Pick<RoofReportModel, "complexity" | "facets" | "lines">) {
  const valleys = report.lines.find((line) => line.kind === "valley")?.count ?? 0;
  const hips = report.lines.find((line) => line.kind === "hip")?.count ?? 0;
  const plan =
    report.complexity === "complex"
      ? "Plan for 19–23% waste and extra time on cut-in."
      : report.complexity === "normal"
        ? "Plan for 15–19% waste."
        : "Plan for 10–15% waste.";
  const noun = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;
  return `${noun(report.facets.length, "facet", "facets")}, ${noun(valleys, "valley", "valleys")} and ${noun(hips, "hip", "hips")}. ${plan}`;
}

export function wasteColumns(steepSqFt: number, wastePercent: number): WasteColumn[] {
  const recommended = Number.isFinite(wastePercent) ? Math.round(wastePercent) : 15;
  const percents = [...WASTE_FACTORS] as number[];
  if (!percents.includes(recommended)) percents.push(recommended);
  percents.sort((a, b) => a - b);
  return percents.map((percent) => {
    const area = steepSqFt * (1 + percent / 100);
    return {
      percent,
      thirds: squaresToThirds(area / 100),
      areaSqFt: Math.round(area),
      measured: percent === 0,
      recommended: percent === recommended,
    };
  });
}

function stepPieces(feet: number) {
  if (feet <= 0) return 0;
  const raw = Math.ceil((feet * 12) / 5);
  return Math.ceil(raw / 5) * 5;
}

export function supplierMaterials(input: {
  orderThirds: number;
  eavesFt: number;
  hipsRidgesFt: number;
  valleysFt: number;
  dripFt: number;
  stepFt: number;
  lowSlopeSqFt: number;
}): MaterialLine[] {
  const squares = input.orderThirds / 3;
  const low = input.lowSlopeSqFt > 0 ? input.lowSlopeSqFt * 1.1 : 0;
  return [
    {
      name: "Architectural shingles",
      qty: input.orderThirds,
      unit: "bundles",
      basedOn: `${formatThirdSquares(input.orderThirds)} sq × 3`,
    },
    {
      name: "Hip & ridge cap",
      qty: input.hipsRidgesFt > 0 ? Math.ceil(input.hipsRidgesFt / HIP_RIDGE_FEET_PER_BUNDLE) : 0,
      unit: "bundles",
      basedOn: `${Math.round(input.hipsRidgesFt).toLocaleString("en-US")} ft ÷ ~${HIP_RIDGE_FEET_PER_BUNDLE} ft`,
    },
    {
      name: "Starter strip",
      qty: input.eavesFt > 0 ? Math.ceil(input.eavesFt / STARTER_FEET_PER_BUNDLE) : 0,
      unit: "bundles",
      basedOn: `${Math.round(input.eavesFt).toLocaleString("en-US")} ft of eaves`,
    },
    {
      name: "Synthetic underlayment",
      qty: squares > 0 ? Math.ceil(squares / 10) : 0,
      unit: "rolls",
      basedOn: "10-square rolls",
    },
    {
      name: "Ice & water shield",
      qty: input.valleysFt > 0 ? Math.ceil(input.valleysFt / ICE_WATER_FEET_PER_ROLL) : 0,
      unit: "rolls",
      basedOn: `${Math.round(input.valleysFt).toLocaleString("en-US")} ft of valleys`,
    },
    {
      name: "Drip edge",
      qty: input.dripFt > 0 ? Math.ceil((input.dripFt * 1.1) / 10) : 0,
      unit: "10 ft pcs",
      basedOn: `${Math.round(input.dripFt).toLocaleString("en-US")} ft + 10%`,
    },
    {
      name: "Step flashing",
      qty: stepPieces(input.stepFt),
      unit: "pcs",
      basedOn: `${Math.round(input.stepFt).toLocaleString("en-US")} ft at 5 in`,
    },
    {
      name: "Low-slope membrane",
      qty: low > 0 ? Math.ceil(low / 100) : 0,
      unit: "squares",
      basedOn: `${input.lowSlopeSqFt.toLocaleString("en-US", { maximumFractionDigits: 1 })} sf + 10%`,
    },
  ];
}

function facetSurface(drawing: RoofDrawing, facet: RoofFacet) {
  const scale = drawing.feetPerPixel;
  if (scale == null || scale <= 0) return polygonAreaPx(facetPoints(drawing, facet));
  const plan = polygonAreaPx(facetPoints(drawing, facet)) * scale * scale;
  return plan * slopeFactor(facet.pitchRise);
}

export function buildRoofReport(drawing: RoofDrawing): RoofReportModel {
  const measured = measureRoof(drawing);
  const calibrated = measured.calibrated;
  const counted = new Map<EdgeKind, number>();
  for (const kind of EDGE_KINDS) counted.set(kind, 0);
  for (const edge of drawing.edges) counted.set(edge.kind, (counted.get(edge.kind) ?? 0) + 1);

  const lines: LineTotal[] = EDGE_KINDS.map((kind) => ({
    kind,
    label: LINE_LABELS[kind],
    feet: calibrated ? Math.round(measured.lengths[kind]) : 0,
    count: counted.get(kind) ?? 0,
  }));
  const feetOf = (kind: EdgeKind) => lines.find((line) => line.kind === kind)?.feet ?? 0;
  const countOf = (kind: EdgeKind) => lines.find((line) => line.kind === kind)?.count ?? 0;
  const dripFeet = feetOf("eave") + feetOf("rake") + feetOf("drip");
  const dripCount = countOf("eave") + countOf("rake") + countOf("drip");
  const hipsPlusRidges = feetOf("hip") + feetOf("ridge");

  const raw = drawing.facets.map((facet) => ({
    id: facet.id,
    pitchRise: facet.pitchRise,
    surfaceSqFt: calibrated ? facetSurface(drawing, facet) : 0,
    order: facetSurface(drawing, facet),
  }));
  raw.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const totalSqFt = raw.reduce((sum, facet) => sum + facet.surfaceSqFt, 0);
  const facets: ReportFacet[] = raw.map((facet, index) => ({
    id: facet.id,
    letter: facetLetter(index),
    pitchRise: facet.pitchRise,
    surfaceSqFt: facet.surfaceSqFt,
    share: totalSqFt > 0 ? facet.surfaceSqFt / totalSqFt : 0,
  }));

  const bands = new Map<number, number>();
  for (const facet of facets) bands.set(facet.pitchRise, (bands.get(facet.pitchRise) ?? 0) + facet.surfaceSqFt);
  const pitchBands: PitchBand[] = [...bands.entries()]
    .map(([pitchRise, surfaceSqFt]) => ({
      pitchRise,
      surfaceSqFt,
      share: totalSqFt > 0 ? surfaceSqFt / totalSqFt : 0,
    }))
    .sort((a, b) => b.surfaceSqFt - a.surfaceSqFt || a.pitchRise - b.pitchRise);
  const main = pitchBands[0];
  const steepSqFt = pitchBands
    .filter((band) => band.pitchRise >= SHINGLE_PITCH)
    .reduce((sum, band) => sum + band.surfaceSqFt, 0);
  const lowSlopeSqFt = pitchBands
    .filter((band) => band.pitchRise < SHINGLE_PITCH)
    .reduce((sum, band) => sum + band.surfaceSqFt, 0);
  const wastePercent = Number.isFinite(drawing.wastePercent) ? drawing.wastePercent : 15;
  const columns = wasteColumns(steepSqFt, wastePercent);
  const recommended = columns.find((column) => column.recommended) ?? columns[0];

  return {
    calibrated,
    totalSqFt,
    steepSqFt,
    lowSlopeSqFt,
    facets,
    pitchBands,
    mainPitchRise: main ? main.pitchRise : null,
    mainPitchShare: main?.share ?? 0,
    wastePercent,
    orderThirds: recommended?.thirds ?? 0,
    lines,
    hipsPlusRidges,
    dripFeet,
    dripCount,
    complexity: roofComplexity(facets.length, countOf("valley"), countOf("hip")),
    wasteColumns: columns,
    materials: supplierMaterials({
      orderThirds: recommended?.thirds ?? 0,
      eavesFt: feetOf("eave"),
      hipsRidgesFt: hipsPlusRidges,
      valleysFt: feetOf("valley"),
      dripFt: dripFeet,
      stepFt: feetOf("step_flashing"),
      lowSlopeSqFt,
    }),
  };
}

export function pitchText(rise: number | null) {
  return rise == null ? "—" : pitchLabel(rise);
}
