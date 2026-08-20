import { seedShareToken } from "@/lib/share";
import type { Estimate, EstimateLine } from "@/lib/types";

export type AdjustmentKind = "percent" | "amount";

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function lineAmount(line: Pick<EstimateLine, "quantity" | "unitCost">) {
  return roundMoney(line.quantity * line.unitCost);
}

export function lineIncluded(line: Pick<EstimateLine, "optional" | "selected">) {
  return !line.optional || line.selected;
}

export function includedLines<T extends Pick<EstimateLine, "optional" | "selected">>(lines: T[]) {
  return lines.filter(lineIncluded);
}

export function estimateTotals(
  estimate: Pick<Estimate, "taxRate" | "discountKind" | "discountValue" | "depositKind" | "depositValue">,
  lines: Array<Pick<EstimateLine, "quantity" | "unitCost" | "optional" | "selected" | "taxable">>,
) {
  const included = includedLines(lines);
  const optionalOpen = lines.filter((line) => line.optional && !line.selected);
  const subtotal = roundMoney(included.reduce((sum, line) => sum + lineAmount(line), 0));
  const optionalTotal = roundMoney(optionalOpen.reduce((sum, line) => sum + lineAmount(line), 0));
  const discount =
    estimate.discountKind === "percent"
      ? roundMoney(subtotal * (Number(estimate.discountValue) || 0) / 100)
      : roundMoney(Math.min(subtotal, Number(estimate.discountValue) || 0));
  const afterDiscount = Math.max(0, roundMoney(subtotal - discount));
  const taxableSubtotal = roundMoney(
    included.filter((line) => line.taxable).reduce((sum, line) => sum + lineAmount(line), 0),
  );
  const taxableShare = subtotal > 0 ? taxableSubtotal / subtotal : 0;
  const taxableAfterDiscount = Math.max(0, roundMoney(taxableSubtotal - discount * taxableShare));
  const tax = roundMoney(taxableAfterDiscount * (Number(estimate.taxRate) || 0) / 100);
  const total = roundMoney(afterDiscount + tax);
  const deposit =
    estimate.depositKind === "percent"
      ? roundMoney(total * (Number(estimate.depositValue) || 0) / 100)
      : roundMoney(Math.min(total, Number(estimate.depositValue) || 0));
  return {
    includedCount: included.length,
    optionalCount: optionalOpen.length,
    subtotal,
    discount,
    afterDiscount,
    tax,
    total,
    deposit,
    optionalTotal,
  };
}

export function groupEstimateLines(lines: EstimateLine[]) {
  const order: string[] = [];
  const grouped = new Map<string, EstimateLine[]>();
  const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const line of sorted) {
    const key = line.groupName.trim() || "Items";
    if (!grouped.has(key)) {
      grouped.set(key, []);
      order.push(key);
    }
    grouped.get(key)?.push(line);
  }
  return order.map((name) => ({ name, lines: grouped.get(name) ?? [] }));
}

export function linesForEstimate(lines: EstimateLine[], estimateId: string) {
  return lines
    .filter((line) => line.estimateId === estimateId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function amountForEstimate(estimate: Estimate, lines: EstimateLine[]) {
  return estimateTotals(estimate, linesForEstimate(lines, estimate.id)).total;
}

export function lineLabel(line: Pick<EstimateLine, "title" | "description">) {
  const title = line.title.trim();
  const description = line.description.trim();
  if (title && description && title !== description) return `${title} — ${description}`;
  return title || description || "Item";
}

export function invoiceLinesFromEstimate(estimate: Estimate, lines: EstimateLine[]) {
  const billed = includedLines(linesForEstimate(lines, estimate.id));
  const totals = estimateTotals(estimate, billed);
  const out = billed.map((line, index) => ({
    description: lineLabel(line),
    quantity: line.quantity,
    unit: line.unit,
    unitCost: line.unitCost,
    sortOrder: index,
  }));
  if (totals.discount > 0) {
    out.push({
      description:
        estimate.discountKind === "percent"
          ? `Discount (${estimate.discountValue}%)`
          : "Discount",
      quantity: 1,
      unit: "LS",
      unitCost: -totals.discount,
      sortOrder: out.length,
    });
  }
  if (totals.tax > 0) {
    out.push({
      description: `Tax (${estimate.taxRate}%)`,
      quantity: 1,
      unit: "LS",
      unitCost: totals.tax,
      sortOrder: out.length,
    });
  }
  return out;
}

export const DEFAULT_ESTIMATE_TERMS =
  "This proposal is good through the valid-until date. Work starts after you accept and pay any deposit. Changes on site will be written as a change order before we proceed.";

export const COMMON_UNITS = ["LS", "ea", "sq", "sf", "lf", "cy", "hr", "day", "mo"];

export type EstimateDraft = Omit<
  Estimate,
  | "contactId"
  | "taxRate"
  | "discountKind"
  | "discountValue"
  | "depositKind"
  | "depositValue"
  | "intro"
  | "terms"
  | "street"
  | "city"
  | "state"
  | "postalCode"
  | "shareToken"
> &
  Partial<
    Pick<
      Estimate,
      | "contactId"
      | "taxRate"
      | "discountKind"
      | "discountValue"
      | "depositKind"
      | "depositValue"
      | "intro"
      | "terms"
      | "street"
      | "city"
      | "state"
      | "postalCode"
      | "shareToken"
    >
  >;

export type EstimateLineDraft = Omit<
  EstimateLine,
  "title" | "groupName" | "optional" | "selected" | "taxable"
> &
  Partial<Pick<EstimateLine, "title" | "groupName" | "optional" | "selected" | "taxable">>;

export function fillEstimate(estimate: EstimateDraft): Estimate {
  return {
    ...estimate,
    contactId: estimate.contactId ?? null,
    taxRate: estimate.taxRate ?? 0,
    discountKind: estimate.discountKind ?? "percent",
    discountValue: estimate.discountValue ?? 0,
    depositKind: estimate.depositKind ?? "percent",
    depositValue: estimate.depositValue ?? 0,
    intro: estimate.intro ?? "",
    terms: estimate.terms ?? DEFAULT_ESTIMATE_TERMS,
    street: estimate.street ?? "",
    city: estimate.city ?? "",
    state: estimate.state ?? "",
    postalCode: estimate.postalCode ?? "",
    shareToken: estimate.shareToken?.trim() || seedShareToken("e", estimate.number),
  };
}

export function fillEstimateLine(line: EstimateLineDraft): EstimateLine {
  return {
    ...line,
    title: line.title?.trim() || line.description,
    groupName: line.groupName ?? "",
    optional: Boolean(line.optional),
    selected: line.selected ?? true,
    taxable: line.taxable ?? true,
  };
}

export const ESTIMATE_RECORD_EXTRAS: Record<string, Partial<Estimate>> = {
  est_ellison: {
    contactId: "con_marcus",
    taxRate: 8.31,
    depositKind: "percent",
    depositValue: 30,
    street: "860 S Washington St",
    city: "Denver",
    state: "CO",
    postalCode: "80209",
    intro: "Kitchen remodel at Wash Park. Island is held until the engineer letter lands.",
  },
  est_pell: {
    contactId: "con_drew",
    taxRate: 0,
    depositKind: "percent",
    depositValue: 25,
    street: "1190 S Kipling St",
    city: "Lakewood",
    state: "CO",
    postalCode: "80232",
    intro: "Insurance roof and gutters. Leaf guards are optional — check them if you want them in this number.",
  },
  est_alvarez: {
    contactId: "con_dana",
    taxRate: 0,
    depositKind: "percent",
    depositValue: 30,
    street: "2841 Forest St",
    city: "Denver",
    state: "CO",
    postalCode: "80207",
    intro: "Park Hill hail roof. Tear-off and architectural shingles. Dumpster is optional if you prefer us to haul.",
  },
  est_marsh: {
    contactId: "con_theo",
    taxRate: 8.31,
    depositKind: "percent",
    depositValue: 40,
    street: "2215 16th St",
    city: "Denver",
    state: "CO",
    postalCode: "80211",
    intro: "Primary bath at LoHi. Tile allowance is in the finishes section.",
  },
  est_hart_kit: {
    contactId: "con_owen",
    taxRate: 0,
    depositKind: "percent",
    depositValue: 25,
    street: "3428 Osceola St",
    city: "Denver",
    state: "CO",
    postalCode: "80211",
    intro: "Kitchen rebuild after the dry-out. Do not send until Nina’s contents list lands.",
  },
  est_whitfield_kit: {
    contactId: "con_ben",
    taxRate: 8.31,
    depositKind: "percent",
    depositValue: 30,
    street: "860 S University Blvd",
    city: "Denver",
    state: "CO",
    postalCode: "80209",
    intro: "Kitchen after the basement punches. Same crew stays on site.",
  },
  est_park: {
    contactId: "con_joy",
    taxRate: 8.31,
    depositKind: "percent",
    depositValue: 30,
    street: "210 Krameria St",
    city: "Denver",
    state: "CO",
    postalCode: "80220",
    intro: "Hilltop kitchen. Cabinets and quartz as drawn. References attached separately.",
  },
  est_blake: {
    contactId: "con_nora",
    taxRate: 8.31,
    depositKind: "percent",
    depositValue: 40,
    street: "1374 Madison St",
    city: "Denver",
    state: "CO",
    postalCode: "80206",
    intro: "Congress Park kitchen. Cabinets owner-selected; we install.",
  },
  est_calder_win: {
    contactId: "con_ivy",
    taxRate: 8.31,
    depositKind: "percent",
    depositValue: 50,
    street: "1844 Grove St",
    city: "Boulder",
    state: "CO",
    postalCode: "80302",
    intro: "Four west windows while the siding crew is still on site.",
  },
  est_redmond: {
    contactId: "con_cleo",
    taxRate: 8.31,
    depositKind: "percent",
    depositValue: 20,
    street: "255 Steele St",
    city: "Denver",
    state: "CO",
    postalCode: "80206",
    intro: "Rear addition. Framing, footings, and drywall as drawn. Permit set with Hale + Moss.",
  },
};

export const ESTIMATE_LINE_EXTRAS: Record<string, Partial<EstimateLine>> = {
  el_e1: { groupName: "Demo", title: "Kitchen demo" },
  el_e2: { groupName: "Cabinets & tops", title: "Cabinets" },
  el_e3: { groupName: "Cabinets & tops", title: "Quartz — island and walls" },
  el_e4: { groupName: "Electrical", title: "Electrical rough & trim" },
  el_m1: { groupName: "Demo", title: "Bath demo" },
  el_m2: { groupName: "Finishes", title: "Tile floors & wet walls" },
  el_m3: { groupName: "MEP", title: "Plumbing rough" },
  el_p1: { groupName: "Roof", title: "Tear-off" },
  el_p2: { groupName: "Roof", title: "Architectural shingles" },
  el_p3: { groupName: "Gutters", title: "Gutters & downspouts" },
  el_p4: {
    groupName: "Gutters",
    title: "Leaf guards",
    optional: true,
    selected: false,
    taxable: false,
  },
  el_a1: { groupName: "Roof", title: "Tear-off" },
  el_a2: { groupName: "Roof", title: "Shingles" },
  el_a3: {
    groupName: "Haul-off",
    title: "Dumpster",
    optional: true,
    selected: true,
  },
  el_h1: { groupName: "Millwork", title: "Replacement cabinets" },
  el_h2: { groupName: "Drywall", title: "Drywall after dry-out" },
  el_w1: { groupName: "Cabinets & tops", title: "Kitchen cabinets" },
  el_w2: { groupName: "Cabinets & tops", title: "Quartz tops" },
  el_pk1: { groupName: "Cabinets & tops", title: "Cabinets" },
  el_pk2: { groupName: "Cabinets & tops", title: "Quartz" },
  el_b1: { groupName: "Cabinets & tops", title: "Cabinets install" },
  el_b2: { groupName: "Cabinets & tops", title: "Quartz" },
  el_c1: { groupName: "Windows", title: "West elevation windows" },
  el_r1: { groupName: "Structure", title: "Addition framing" },
  el_r2: { groupName: "Structure", title: "Footings" },
  el_r3: { groupName: "Finishes", title: "Drywall" },
};
