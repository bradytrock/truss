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
