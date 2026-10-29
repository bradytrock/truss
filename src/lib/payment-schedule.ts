import { normalizePaymentBlanks, parseMoneyInput, stripTermsMarkers } from "./document-terms";
import { roundMoney } from "./estimate-totals";

export type PaymentScheduleRow = {
  /** Token key inside the terms, e.g. `pay_1`. */
  key: string;
  index: number;
  /** Text before the token on its line, e.g. "Payment 1" or "At signing". */
  label: string;
  /** Text after the token on its line, e.g. "due at signing". */
  detail: string;
  /** Dollar amount typed on the line. Null prints as a blank. */
  amount: number | null;
};

const TOKEN = /\{\{\s*(pay_(\d+)|payment_(\d+))(?::([0-9.,]+))?\s*\}\}/gi;

function tidyLabel(raw: string) {
  return raw
    .replace(/^[\s\-–—•*·]+/, "")
    .replace(/[\s:\-–—,.]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tidyDetail(raw: string) {
  return raw
    .replace(/^[\s,;:\-–—]+/, "")
    .replace(/[\s.;,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every `Payment N` line in a contract, in document order, with the amount typed on it. */
export function paymentScheduleFromTerms(terms: string | null | undefined): PaymentScheduleRow[] {
  const src = normalizePaymentBlanks(stripTermsMarkers(terms ?? ""));
  if (!src.trim()) return [];
  const rows: PaymentScheduleRow[] = [];
  const seen = new Set<string>();
  for (const line of src.split("\n")) {
    TOKEN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN.exec(line))) {
      const key = match[1]!.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const index = Number(match[2] ?? match[3]) || rows.length + 1;
      const before = tidyLabel(line.slice(0, match.index));
      const after = tidyDetail(line.slice(match.index + match[0].length));
      const override = match[4];
      const amount = override ? parseMoneyInput(override) : null;
      rows.push({
        key,
        index,
        label: before || `Payment ${index}`,
        detail: after,
        amount: amount == null ? null : roundMoney(amount),
      });
    }
  }
  return rows.sort((a, b) => a.index - b.index);
}

/**
 * What each blank payment line would reasonably be: the deposit for the first line and
 * whatever is left of the total for the last. Middle lines have no suggestion.
 */
export function suggestedPaymentAmounts(
  rows: PaymentScheduleRow[],
  totals: { total: number; deposit: number },
): Record<string, number> {
  const out: Record<string, number> = {};
  if (rows.length === 0) return out;
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (first.amount == null && totals.deposit > 0 && rows.length > 1) {
    out[first.key] = roundMoney(totals.deposit);
  }
  if (rows.length > 1 && last.amount == null) {
    const committed = rows
      .slice(0, -1)
      .reduce((sum, row) => sum + (row.amount ?? out[row.key] ?? 0), 0);
    out[last.key] = Math.max(0, roundMoney(totals.total - committed));
  }
  if (rows.length === 1 && first.amount == null) {
    out[first.key] = roundMoney(totals.total);
  }
  return out;
}

export function blankPaymentRows(rows: PaymentScheduleRow[]) {
  return rows.filter((row) => row.amount == null);
}
