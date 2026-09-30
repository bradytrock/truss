/** Numeric draft while typing. Keeps one decimal and at most two cents digits. */
export function moneyDraft(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned.replace(/^0+(?=\d)/, "");
  const whole = cleaned.slice(0, dot).replace(/^0+(?=\d)/, "") || "0";
  const frac = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${whole}.${frac}`;
}

/** Canonical draft for a stored amount. Numbers always include cents. */
export function moneyDraftFromValue(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return value.toFixed(2);
  }
  return moneyDraft(value);
}

/** `$1,441.20` once the amount is complete. */
export function formatMoneyField(value: string | number | null | undefined) {
  const draft = typeof value === "number" ? moneyDraftFromValue(value) : moneyDraft(String(value ?? ""));
  if (!draft || draft === ".") return "";
  const amount = Number(draft.endsWith(".") ? draft.slice(0, -1) : draft);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** `$1,441.2` while the cents are still being typed. */
export function formatMoneyDraft(draft: string) {
  if (!draft) return "";
  const [whole, frac] = draft.split(".");
  const grouped = Number(whole || "0").toLocaleString("en-US");
  if (frac === undefined) return `$${grouped}`;
  return `$${grouped}.${frac}`;
}

/** `1,441.2` without a dollar sign, for fields that draw `$` themselves. */
export function formatMoneyGrouping(raw: string) {
  const draft = moneyDraft(raw);
  if (!draft) return "";
  return formatMoneyDraft(draft).slice(1);
}

export function completeMoneyDraft(draft: string) {
  if (!draft || draft === ".") return "";
  const amount = Number(draft.endsWith(".") ? draft.slice(0, -1) : draft);
  if (!Number.isFinite(amount)) return "";
  return amount.toFixed(2);
}

export function moneyAmount(raw: string) {
  const draft = moneyDraft(raw);
  if (!draft || draft === ".") return null;
  const amount = Number(draft.endsWith(".") ? draft.slice(0, -1) : draft);
  return Number.isFinite(amount) ? amount : null;
}

/** Caret index in a formatted currency string after `count` digits or a decimal point. */
export function caretAfterMoneyChars(formatted: string, count: number) {
  if (count <= 0) return formatted.startsWith("$") ? 1 : 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d.]/.test(formatted[i] ?? "")) {
      seen += 1;
      if (seen >= count) return i + 1;
    }
  }
  return formatted.length;
}
