/** Measurement fields formulas can read (matches FormulaMeasurements). */
type FormulaMeasurements = {
  totalSquares?: number;
  totalAreaSqFt?: number;
  wastePercent?: number;
  suggestedSquares?: number;
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
};

/** Tokens authors can use in template quantity formulas. */
export const EAGLEVIEW_FORMULA_TOKENS: Array<{
  token: string;
  label: string;
  hint: string;
}> = [
  { token: "squares", label: "Squares", hint: "Suggested / waste-adjusted squares" },
  { token: "totalSquares", label: "Total squares", hint: "Report squares before waste" },
  { token: "suggestedSquares", label: "Suggested squares", hint: "EagleView suggested squares" },
  { token: "wastePercent", label: "Waste %", hint: "Suggested waste percent" },
  { token: "areaSqFt", label: "Area sq ft", hint: "Total roof area in square feet" },
  { token: "ridges", label: "Ridges", hint: "Ridge length (LF)" },
  { token: "hips", label: "Hips", hint: "Hip length (LF)" },
  { token: "valleys", label: "Valleys", hint: "Valley length (LF)" },
  { token: "eaves", label: "Eaves", hint: "Eave / starter length (LF)" },
  { token: "rakes", label: "Rakes", hint: "Rake length (LF)" },
  { token: "dripEdge", label: "Drip edge", hint: "Drip edge length (LF)" },
  { token: "parapet", label: "Parapet", hint: "Parapet walls (LF)" },
  { token: "flashing", label: "Flashing", hint: "Flashing length (LF)" },
  { token: "stepFlashing", label: "Step flashing", hint: "Step flashing (LF)" },
  { token: "facets", label: "Facets", hint: "Facet count" },
];

export type EagleviewFormulaVars = Record<string, number>;

function num(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? value : 0;
}

/** Build the variable map used when evaluating a formula against a report. */
export function eagleviewFormulaVars(
  measurements: FormulaMeasurements | null | undefined,
  totalSquares: number,
  wastePercent: number | null | undefined,
): EagleviewFormulaVars {
  const m = measurements ?? {};
  const suggested = m.suggestedSquares;
  const withWaste =
    suggested != null && Number.isFinite(suggested)
      ? suggested
      : wastePercent != null && Number.isFinite(wastePercent)
        ? Math.round(totalSquares * (1 + wastePercent / 100) * 100) / 100
        : totalSquares;

  const ridges = num(m.ridgesLf);
  const hips = num(m.hipsLf);
  const valleys = num(m.valleysLf);
  const eaves = num(m.eavesLf);
  const rakes = num(m.rakesLf);
  const dripEdge = num(m.dripEdgeLf);
  const parapet = num(m.parapetWallsLf);
  const flashing = num(m.flashingLf);
  const stepFlashing = num(m.stepFlashingLf);
  const facets = num(m.facets);
  const areaSqFt = num(m.totalAreaSqFt);
  const waste = num(wastePercent ?? m.wastePercent);
  const suggestedValue = num(suggested ?? withWaste);

  return {
    squares: withWaste,
    sq: withWaste,
    suggestedSquares: suggestedValue,
    suggested: suggestedValue,
    totalSquares: num(m.totalSquares ?? totalSquares),
    total: num(m.totalSquares ?? totalSquares),
    wastePercent: waste,
    waste,
    areaSqFt,
    area: areaSqFt,
    totalAreaSqFt: areaSqFt,
    ridges,
    ridge: ridges,
    ridgesLf: ridges,
    hips,
    hip: hips,
    hipsLf: hips,
    valleys,
    valley: valleys,
    valleysLf: valleys,
    eaves,
    eave: eaves,
    starter: eaves,
    eavesLf: eaves,
    rakes,
    rake: rakes,
    rakesLf: rakes,
    dripEdge,
    drip: dripEdge,
    dripEdgeLf: dripEdge,
    parapet,
    parapets: parapet,
    parapetWallsLf: parapet,
    flashing,
    flashingLf: flashing,
    stepFlashing,
    step: stepFlashing,
    stepFlashingLf: stepFlashing,
    facets,
    facet: facets,
  };
}

type Tok =
  | { kind: "num"; value: number }
  | { kind: "id"; value: string }
  | { kind: "op"; value: string }
  | { kind: "lp" }
  | { kind: "rp" }
  | { kind: "comma" };

function tokenize(input: string): Tok[] | { error: string } {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push(ch === "(" ? { kind: "lp" } : ch === ")" ? { kind: "rp" } : { kind: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) j += 1;
      const raw = input.slice(i, j);
      const value = Number(raw);
      if (!Number.isFinite(value)) return { error: `Invalid number "${raw}".` };
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j += 1;
      tokens.push({ kind: "id", value: input.slice(i, j) });
      i = j;
      continue;
    }
    return { error: `Unexpected character "${ch}".` };
  }
  return tokens;
}

const FN_ARITY: Record<string, number> = {
  ceil: 1,
  floor: 1,
  round: 1,
  abs: 1,
  max: 2,
  min: 2,
};

function evalExpr(
  tokens: Tok[],
  vars: EagleviewFormulaVars,
): { value: number } | { error: string } {
  let pos = 0;

  const peek = () => tokens[pos];
  const take = () => tokens[pos++];

  function parsePrimary(): { value: number } | { error: string } {
    const tok = peek();
    if (!tok) return { error: "Unexpected end of formula." };
    if (tok.kind === "num") {
      take();
      return { value: tok.value };
    }
    if (tok.kind === "id") {
      take();
      const name = tok.value;
      const next = peek();
      if (next?.kind === "lp") {
        take();
        const args: number[] = [];
        if (peek()?.kind !== "rp") {
          while (true) {
            const arg = parseExpr();
            if ("error" in arg) return arg;
            args.push(arg.value);
            if (peek()?.kind === "comma") {
              take();
              continue;
            }
            break;
          }
        }
        if (peek()?.kind !== "rp") return { error: `Missing ) after ${name}(.` };
        take();
        const arity = FN_ARITY[name.toLowerCase()];
        if (arity == null) return { error: `Unknown function "${name}".` };
        if (args.length !== arity) {
          return { error: `${name}() expects ${arity} argument${arity === 1 ? "" : "s"}.` };
        }
        const fn = name.toLowerCase();
        if (fn === "ceil") return { value: Math.ceil(args[0]) };
        if (fn === "floor") return { value: Math.floor(args[0]) };
        if (fn === "round") return { value: Math.round(args[0]) };
        if (fn === "abs") return { value: Math.abs(args[0]) };
        if (fn === "max") return { value: Math.max(args[0], args[1]) };
        if (fn === "min") return { value: Math.min(args[0], args[1]) };
        return { error: `Unknown function "${name}".` };
      }
      if (!(name in vars)) return { error: `Unknown measurement "${name}".` };
      return { value: vars[name] };
    }
    if (tok.kind === "lp") {
      take();
      const inner = parseExpr();
      if ("error" in inner) return inner;
      if (peek()?.kind !== "rp") return { error: "Missing )." };
      take();
      return inner;
    }
    if (tok.kind === "op" && (tok.value === "+" || tok.value === "-")) {
      take();
      const rhs = parsePrimary();
      if ("error" in rhs) return rhs;
      return { value: tok.value === "-" ? -rhs.value : rhs.value };
    }
    return { error: "Expected a number or measurement." };
  }

  function parseTerm(): { value: number } | { error: string } {
    let left = parsePrimary();
    if ("error" in left) return left;
    while (true) {
      const opTok = peek();
      if (opTok?.kind !== "op" || (opTok.value !== "*" && opTok.value !== "/")) break;
      const op = take() as Extract<Tok, { kind: "op" }>;
      const right = parsePrimary();
      if ("error" in right) return right;
      if (op.value === "/" && right.value === 0) return { error: "Division by zero." };
      left = { value: op.value === "*" ? left.value * right.value : left.value / right.value };
    }
    return left;
  }

  function parseExpr(): { value: number } | { error: string } {
    let left = parseTerm();
    if ("error" in left) return left;
    while (true) {
      const opTok = peek();
      if (opTok?.kind !== "op" || (opTok.value !== "+" && opTok.value !== "-")) break;
      const op = take() as Extract<Tok, { kind: "op" }>;
      const right = parseTerm();
      if ("error" in right) return right;
      left = { value: op.value === "+" ? left.value + right.value : left.value - right.value };
    }
    return left;
  }

  const result = parseExpr();
  if ("error" in result) return result;
  if (pos < tokens.length) return { error: "Unexpected extra characters." };
  return result;
}

export function evaluateQuantityFormula(
  formula: string,
  vars: EagleviewFormulaVars,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = formula.trim();
  if (!trimmed) return { ok: false, error: "Formula is empty." };
  const tokens = tokenize(trimmed);
  if ("error" in tokens) return { ok: false, error: tokens.error };
  if (tokens.length === 0) return { ok: false, error: "Formula is empty." };
  const result = evalExpr(tokens, vars);
  if ("error" in result) return { ok: false, error: result.error };
  if (!Number.isFinite(result.value)) return { ok: false, error: "Formula did not produce a number." };
  const rounded = Math.round(Math.max(0, result.value) * 100) / 100;
  return { ok: true, value: rounded };
}

export function previewQuantityFormula(
  formula: string,
  sample?: Partial<EagleviewFormulaVars>,
) {
  const base = eagleviewFormulaVars(
    {
      totalSquares: 24,
      suggestedSquares: 27.6,
      wastePercent: 15,
      totalAreaSqFt: 2400,
      ridgesLf: 42,
      hipsLf: 28,
      valleysLf: 36,
      eavesLf: 120,
      rakesLf: 64,
      dripEdgeLf: 180,
      parapetWallsLf: 0,
      flashingLf: 18,
      stepFlashingLf: 24,
      facets: 8,
    },
    24,
    15,
  );
  return evaluateQuantityFormula(formula, {
    ...base,
    ...Object.fromEntries(
      Object.entries(sample ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
    ),
  });
}

export const EAGLEVIEW_COVERAGE_UNITS = [
  { value: "squares", label: "squares" },
  { value: "sqft", label: "sqft" },
  { value: "ft", label: "ft" },
  { value: "each", label: "each" },
] as const;

export type EagleviewCoverageUnit = (typeof EAGLEVIEW_COVERAGE_UNITS)[number]["value"];

export const EAGLEVIEW_MEASUREMENT_OPTIONS: Array<{
  key: string;
  label: string;
  /** Native unit of the measurement. */
  unit: EagleviewCoverageUnit;
  hint: string;
}> = [
  { key: "", label: "None", unit: "squares", hint: "No EagleView mapping — quantity stays as entered (or title match)." },
  { key: "squares", label: "Total squares (w/ waste)", unit: "squares", hint: "Suggested / waste-adjusted squares" },
  { key: "totalSquares", label: "Total squares (no waste)", unit: "squares", hint: "Report squares before waste" },
  { key: "areaSqFt", label: "Roof area", unit: "sqft", hint: "Total roof area in square feet" },
  { key: "ridges", label: "Ridges", unit: "ft", hint: "Ridge length (LF)" },
  { key: "hips", label: "Hips", unit: "ft", hint: "Hip length (LF)" },
  { key: "valleys", label: "Valleys", unit: "ft", hint: "Valley length (LF)" },
  { key: "eaves", label: "Eaves / starter", unit: "ft", hint: "Eave length (LF)" },
  { key: "rakes", label: "Rakes", unit: "ft", hint: "Rake length (LF)" },
  { key: "dripEdge", label: "Drip edge", unit: "ft", hint: "Drip edge length (LF)" },
  { key: "flashing", label: "Flashing", unit: "ft", hint: "Flashing length (LF)" },
  { key: "stepFlashing", label: "Step flashing", unit: "ft", hint: "Step flashing (LF)" },
  { key: "parapet", label: "Parapet", unit: "ft", hint: "Parapet walls (LF)" },
  { key: "facets", label: "Facets", unit: "each", hint: "Facet count" },
];

export function eagleviewMeasurementOption(key: string | null | undefined) {
  const normalized = (key ?? "").trim();
  return EAGLEVIEW_MEASUREMENT_OPTIONS.find((option) => option.key === normalized) ?? EAGLEVIEW_MEASUREMENT_OPTIONS[0];
}

export function defaultCoverageUnitForMeasurement(key: string | null | undefined): EagleviewCoverageUnit {
  return eagleviewMeasurementOption(key).unit;
}

/** Convert a measurement into the coverage unit so qty = measure / coverage. */
export function measurementInCoverageUnit(
  measurementKey: string,
  coverageUnit: string,
  vars: EagleviewFormulaVars,
): number | null {
  const key = measurementKey.trim();
  if (!key) return null;

  const squares = vars.squares ?? 0;
  const totalSquares = vars.totalSquares ?? 0;
  const areaSqFt = vars.areaSqFt ?? (vars.totalSquares ? vars.totalSquares * 100 : 0);
  const unit = coverageUnit.trim().toLowerCase();

  const lengthKeys: Record<string, number> = {
    ridges: vars.ridges ?? 0,
    hips: vars.hips ?? 0,
    valleys: vars.valleys ?? 0,
    eaves: vars.eaves ?? 0,
    rakes: vars.rakes ?? 0,
    dripEdge: vars.dripEdge ?? 0,
    flashing: vars.flashing ?? 0,
    stepFlashing: vars.stepFlashing ?? 0,
    parapet: vars.parapet ?? 0,
  };

  if (key === "squares" || key === "suggestedSquares") {
    if (unit === "squares") return squares;
    if (unit === "sqft") return squares * 100;
    return null;
  }
  if (key === "totalSquares") {
    if (unit === "squares") return totalSquares;
    if (unit === "sqft") return totalSquares * 100;
    return null;
  }
  if (key === "areaSqFt" || key === "area") {
    if (unit === "sqft") return areaSqFt;
    if (unit === "squares") return areaSqFt / 100;
    return null;
  }
  if (key in lengthKeys) {
    if (unit === "ft") return lengthKeys[key];
    return null;
  }
  if (key === "facets") {
    if (unit === "each") return vars.facets ?? 0;
    return null;
  }
  // Unknown key — try direct var lookup in same unit.
  if (key in vars) return vars[key];
  return null;
}


export function parseMeasurementKeys(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((key) => key.trim()).filter(Boolean))];
  }
  const raw = (value ?? "").trim();
  if (!raw) return [];
  return [...new Set(raw.split(/[,|]/).map((key) => key.trim()).filter(Boolean))];
}

export function serializeMeasurementKeys(keys: string[] | null | undefined): string {
  return parseMeasurementKeys(keys).join(",");
}

export function formatMeasurementMappingLabel(keys: string[] | null | undefined): string {
  const list = parseMeasurementKeys(keys);
  if (list.length === 0) return "None";
  if (list.length === 1) {
    return eagleviewMeasurementOption(list[0]).label || "1 Item";
  }
  return `${list.length} Items`;
}

export function defaultCoverageUnitForMeasurements(keys: string[] | null | undefined): EagleviewCoverageUnit {
  const list = parseMeasurementKeys(keys);
  if (list.length === 0) return "squares";
  return defaultCoverageUnitForMeasurement(list[0]);
}

export function quantityFromCoverage(input: {
  measurementKey?: string | null;
  measurementKeys?: string[] | string | null;
  coverageAmount?: number | null;
  coverageUnit?: string | null;
  vars: EagleviewFormulaVars;
}): { ok: true; value: number } | { ok: false; error: string } {
  const keys = parseMeasurementKeys(input.measurementKeys ?? input.measurementKey);
  if (keys.length === 0) return { ok: false, error: "No measurement mapped." };
  const amount = Number(input.coverageAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Coverage must be greater than zero." };
  }
  const unit =
    (input.coverageUnit ?? defaultCoverageUnitForMeasurements(keys)).trim() || "squares";
  let measure = 0;
  for (const key of keys) {
    const part = measurementInCoverageUnit(key, unit, input.vars);
    if (part == null || !Number.isFinite(part)) {
      const label = eagleviewMeasurementOption(key).label || key;
      return { ok: false, error: `Cannot convert ${label} to ${unit}.` };
    }
    measure += part;
  }
  const value = Math.round(Math.max(0, measure / amount) * 100) / 100;
  return { ok: true, value };
}

export function previewCoverageQuantity(input: {
  measurementKey?: string | null;
  measurementKeys?: string[] | string | null;
  coverageAmount?: number | null;
  coverageUnit?: string | null;
}) {
  const base = eagleviewFormulaVars(
    {
      totalSquares: 36.86,
      suggestedSquares: 36.86,
      wastePercent: 0,
      totalAreaSqFt: 3686,
      ridgesLf: 105,
      hipsLf: 50,
      valleysLf: 84.6,
      eavesLf: 120,
      rakesLf: 64,
      dripEdgeLf: 180,
      parapetWallsLf: 0,
      flashingLf: 18,
      stepFlashingLf: 24,
      facets: 8,
    },
    36.86,
    0,
  );
  return quantityFromCoverage({ ...input, vars: base });
}

export function formatCoverageLabel(amount: number | null | undefined, unit: string | null | undefined) {
  const qty = Number(amount);
  const safe = Number.isFinite(qty) ? qty : 1;
  const label = (unit ?? "squares").trim() || "squares";
  return `${safe} ${label}`;
}

