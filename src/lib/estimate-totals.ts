import { seedShareToken } from "@/lib/share";
import { billingEstimate } from "@/lib/market";
import { normalizeLinePhotoIds } from "@/lib/estimate-line-photos";
import type { Estimate, EstimateLine, JobMarket } from "@/lib/types";

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

export function groupEstimateLines<T extends Pick<EstimateLine, "groupName" | "sortOrder">>(lines: T[]) {
  const order: string[] = [];
  const grouped = new Map<string, T[]>();
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

export function amountForEstimate(estimate: Estimate, lines: EstimateLine[], market?: JobMarket | "" | null) {
  return estimateTotals(billingEstimate(estimate, market), linesForEstimate(lines, estimate.id)).total;
}

export function acceptedAmountForJob(
  job: { id: string; opportunityId?: string | null },
  estimates: Estimate[],
  lines: EstimateLine[],
  market?: JobMarket | "" | null,
) {
  const related = estimates.filter(
    (estimate) =>
      estimate.status === "accepted" &&
      (estimate.jobId === job.id ||
        Boolean(job.opportunityId && estimate.opportunityId === job.opportunityId)),
  );
  if (related.length === 0) return 0;
  const preferred = [...related].sort((a, b) => (b.acceptedAt ?? "").localeCompare(a.acceptedAt ?? ""))[0];
  if (!preferred) return 0;
  return amountForEstimate(preferred, lines, market);
}

export function contractValueForOpportunity(
  opportunityId: string,
  estimates: Estimate[],
  lines: EstimateLine[],
  fallback = 0,
  market?: JobMarket | "" | null,
) {
  const related = estimates.filter(
    (estimate) => estimate.opportunityId === opportunityId && estimate.status !== "declined",
  );
  const preferred =
    related.find((estimate) => estimate.status === "accepted") ??
    related.find((estimate) => estimate.status === "sent" || estimate.status === "viewed") ??
    related[0];
  if (!preferred) return fallback;
  return amountForEstimate(preferred, lines, market);
}

export function lineLabel(line: Pick<EstimateLine, "title" | "description">) {
  const title = line.title.trim();
  const description = line.description.trim();
  if (title && description && title !== description) return `${title} — ${description}`;
  return title || description || "Item";
}

export function invoiceLinesFromEstimate(
  estimate: Estimate,
  lines: EstimateLine[],
  market?: JobMarket | "" | null,
) {
  const billedEstimate = billingEstimate(estimate, market);
  const billed = includedLines(linesForEstimate(lines, estimate.id));
  const totals = estimateTotals(billedEstimate, billed);
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
      description: `Tax (${billedEstimate.taxRate}%)`,
      quantity: 1,
      unit: "LS",
      unitCost: totals.tax,
      sortOrder: out.length,
    });
  }
  return out;
}

export const DEFAULT_ESTIMATE_TERMS = `1. Contract price
The contract price for the work in this proposal is {{contract_price}}. A deposit of {{deposit}} is due when you sign. The remaining balance of {{remaining}} is due as invoiced.

2. Scope of work
This proposal covers the included items listed above for {{job_site}}. Optional items are not in the contract price unless you select them before you sign.

3. Schedule
This proposal is good through {{valid_until}}. Sending it signs for the contractor. Work starts after you sign and pay any deposit.

4. Changes
Changes on site will be written as a change order with a price before we proceed.

5. Contractor
{{company}} is the contractor named on this proposal ({{estimate_number}}), prepared for {{customer}}.`;

export const COMMON_UNITS = ["LS", "ea", "sq", "sf", "lf", "cy", "hr", "day", "mo"];

export type EstimateDraft = Omit<
  Estimate,
  | "contactId"
  | "secondContactId"
  | "secondAcceptedAt"
  | "ownerSignedAt"
  | "ownerSignedName"
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
  | "secondShareToken"
  | "signatureName"
  | "signatureImage"
  | "secondSignatureName"
  | "secondSignatureImage"
> &
  Partial<
    Pick<
      Estimate,
      | "contactId"
      | "secondContactId"
      | "secondAcceptedAt"
      | "ownerSignedAt"
      | "ownerSignedName"
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
      | "secondShareToken"
      | "signatureName"
      | "signatureImage"
      | "secondSignatureName"
      | "secondSignatureImage"
    >
  >;

export type EstimateLineDraft = Omit<
  EstimateLine,
  "title" | "groupName" | "optional" | "selected" | "taxable" | "photoIds" | "photos"
> &
  Partial<
    Pick<EstimateLine, "title" | "groupName" | "optional" | "selected" | "taxable" | "photoIds" | "photos">
  >;

export function fillEstimate(estimate: EstimateDraft): Estimate {
  const contactId = estimate.contactId ?? null;
  const secondContactId =
    estimate.secondContactId && estimate.secondContactId !== contactId
      ? estimate.secondContactId
      : null;
  return {
    ...estimate,
    contactId,
    secondContactId,
    secondAcceptedAt: secondContactId ? (estimate.secondAcceptedAt ?? null) : null,
    ownerSignedAt:
      estimate.ownerSignedAt ??
      (estimate.status !== "draft" && estimate.sentAt ? estimate.sentAt : null),
    ownerSignedName: estimate.ownerSignedName ?? "",
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
    validUntil: estimate.validUntil ? String(estimate.validUntil).slice(0, 10) : null,
    shareToken: estimate.shareToken?.trim() || seedShareToken("e", estimate.number),
    secondShareToken: secondContactId ? (estimate.secondShareToken?.trim() ?? "") : "",
    signatureName: estimate.signatureName ?? "",
    signatureImage: estimate.signatureImage ?? "",
    secondSignatureName: secondContactId ? (estimate.secondSignatureName ?? "") : "",
    secondSignatureImage: secondContactId ? (estimate.secondSignatureImage ?? "") : "",
  };
}

export function fillEstimateLine(line: EstimateLineDraft): EstimateLine {
  const photoIds = normalizeLinePhotoIds(line.photoIds ?? line.photos?.map((photo) => photo.id));
  return {
    ...line,
    title: line.title?.trim() || line.description,
    groupName: line.groupName ?? "",
    optional: Boolean(line.optional),
    selected: line.selected ?? true,
    taxable: line.taxable ?? true,
    photoIds,
    photos: line.photos,
  };
}

export const ESTIMATE_RECORD_EXTRAS: Record<string, Partial<Estimate>> = {
  est_ellison: {
    contactId: "con_marcus",
    secondContactId: "con_jordan",
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
