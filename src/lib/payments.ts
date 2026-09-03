export type PaymentRail = "venmo" | "zelle" | "cashapp" | "paypal";

export type CompanyPaymentFields = {
  paymentVenmo?: string;
  paymentZelle?: string;
  paymentCashapp?: string;
  paymentPaypal?: string;
  paymentNote?: string;
};

export type PaymentOption = {
  rail: PaymentRail;
  label: string;
  /** What the homeowner types or sees: a handle, email, or phone. */
  handle: string;
  /** Deep link when the rail has one. Zelle has none — the handle is copied. */
  href: string;
};

const PAYMENT_LABELS: Record<PaymentRail, string> = {
  venmo: "Venmo",
  zelle: "Zelle",
  cashapp: "Cash App",
  paypal: "PayPal",
};

export function paymentLabel(rail: PaymentRail) {
  return PAYMENT_LABELS[rail];
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^[\w-]+(\.[\w-]+)+\//.test(value);
}

function asUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * Accepts a handle or a pasted profile link. Handles keep their display form
 * (@dana, $dana) while the link is built from the bare username.
 */
function railLink(rail: PaymentRail, raw: string) {
  const value = raw.trim();
  if (!value) return { handle: "", href: "" };
  if (isUrl(value)) {
    return { handle: value.replace(/^https?:\/\//i, "").replace(/\/+$/, ""), href: asUrl(value) };
  }
  const bare = value.replace(/^[@$]/, "").trim();
  if (!bare) return { handle: "", href: "" };
  if (rail === "venmo") return { handle: `@${bare}`, href: `https://venmo.com/u/${encodeURIComponent(bare)}` };
  if (rail === "cashapp") return { handle: `$${bare}`, href: `https://cash.app/$${encodeURIComponent(bare)}` };
  if (rail === "paypal") return { handle: `@${bare}`, href: `https://paypal.me/${encodeURIComponent(bare)}` };
  // Zelle is an email or phone with no universal deep link.
  return { handle: value, href: "" };
}

export function paymentOptions(company: CompanyPaymentFields): PaymentOption[] {
  const raw: Array<[PaymentRail, string]> = [
    ["venmo", company.paymentVenmo ?? ""],
    ["zelle", company.paymentZelle ?? ""],
    ["cashapp", company.paymentCashapp ?? ""],
    ["paypal", company.paymentPaypal ?? ""],
  ];
  const options: PaymentOption[] = [];
  for (const [rail, value] of raw) {
    const { handle, href } = railLink(rail, value);
    if (!handle) continue;
    options.push({ rail, label: PAYMENT_LABELS[rail], handle, href });
  }
  return options;
}

export function hasPaymentOptions(company: CompanyPaymentFields) {
  return paymentOptions(company).length > 0 || Boolean(company.paymentNote?.trim());
}

/** A seat's own review link wins so multi-office teams collect to the right listing. */
export function resolveGoogleReviewUrl(
  company: { googleReviewUrl?: string } | null | undefined,
  person: { googleReviewUrl?: string } | null | undefined,
) {
  const own = person?.googleReviewUrl?.trim() ?? "";
  const fallback = company?.googleReviewUrl?.trim() ?? "";
  const chosen = own || fallback;
  return chosen ? asUrl(chosen) : "";
}
