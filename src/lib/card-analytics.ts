export const CARD_EVENT_KINDS = [
  "view",
  "save_contact",
  "review",
  "call",
  "text",
  "email",
  "website",
  "social",
  "payment",
] as const;

export type CardEventKind = (typeof CARD_EVENT_KINDS)[number];

export function isCardEventKind(value: string): value is CardEventKind {
  return (CARD_EVENT_KINDS as readonly string[]).includes(value);
}

export const CARD_METRICS: { kind: CardEventKind; label: string; short: string }[] = [
  { kind: "view", label: "Opens", short: "Opens" },
  { kind: "save_contact", label: "Contact saves", short: "Saves" },
  { kind: "review", label: "Review taps", short: "Reviews" },
  { kind: "call", label: "Calls", short: "Calls" },
  { kind: "text", label: "Texts", short: "Texts" },
  { kind: "email", label: "Emails", short: "Emails" },
  { kind: "website", label: "Website and social", short: "Web" },
  { kind: "payment", label: "Payment taps", short: "Pay" },
];

export type CardEventTotals = Record<string, number>;

export type CardTotalRow = { staffId: string; kind: string; total: number };

/** Website and social share a column; both are "they went to our pages". */
function metricKeyFor(kind: string) {
  return kind === "social" ? "website" : kind;
}

export function totalsByStaff(rows: CardTotalRow[]) {
  const byStaff = new Map<string, CardEventTotals>();
  for (const row of rows) {
    const key = metricKeyFor(row.kind);
    const current = byStaff.get(row.staffId) ?? {};
    current[key] = (current[key] ?? 0) + row.total;
    byStaff.set(row.staffId, current);
  }
  return byStaff;
}

export function sumTotals(rows: CardTotalRow[]) {
  const totals: CardEventTotals = {};
  for (const row of rows) {
    const key = metricKeyFor(row.kind);
    totals[key] = (totals[key] ?? 0) + row.total;
  }
  return totals;
}

export const CARD_RANGES = [
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "ytd", label: "Year to date", days: null },
] as const;

export type CardRange = (typeof CARD_RANGES)[number]["value"];

export function sinceForRange(range: CardRange, now = new Date()) {
  const match = CARD_RANGES.find((item) => item.value === range);
  if (!match) return null;
  if (match.days === null) return new Date(now.getFullYear(), 0, 1).toISOString();
  const since = new Date(now);
  since.setDate(since.getDate() - match.days);
  return since.toISOString();
}

/** Headline tiles on the card report, in display order, with the swatch each one wears. */
export const CARD_REPORT_TILES: { kind: CardEventKind; label: string; hint: string; color: string }[] = [
  { kind: "view", label: "Card opens", hint: "Link or QR views", color: "#1e4fd8" },
  { kind: "save_contact", label: "Contact saves", hint: "Saved to a phone", color: "#0f766e" },
  { kind: "review", label: "Review taps", hint: "Tapped leave-a-review", color: "#7c3aed" },
  { kind: "call", label: "Calls", hint: "Tap-to-call from card", color: "#c2410c" },
  { kind: "text", label: "Texts", hint: "Tap-to-text from card", color: "#b45309" },
];

/** Saves, review taps, calls, and texts — the taps that mean a prospect did something. */
export function cardActions(totals: CardEventTotals) {
  return (
    (totals.save_contact ?? 0) + (totals.review ?? 0) + (totals.call ?? 0) + (totals.text ?? 0)
  );
}

export function cardSaveRate(totals: CardEventTotals) {
  const opens = totals.view ?? 0;
  return opens > 0 ? (totals.save_contact ?? 0) / opens : 0;
}

export type CardPersonRow = {
  staffId: string;
  name: string;
  opens: number;
  saves: number;
  saveRate: number;
  reviews: number;
  calls: number;
  texts: number;
  actions: number;
};

export function cardPersonRows(
  people: { id: string; name: string }[],
  byStaff: Map<string, CardEventTotals>,
): CardPersonRow[] {
  return people
    .map((member) => {
      const totals = byStaff.get(member.id) ?? {};
      return {
        staffId: member.id,
        name: member.name,
        opens: totals.view ?? 0,
        saves: totals.save_contact ?? 0,
        saveRate: cardSaveRate(totals),
        reviews: totals.review ?? 0,
        calls: totals.call ?? 0,
        texts: totals.text ?? 0,
        actions: cardActions(totals),
      };
    })
    .sort((left, right) => right.opens - left.opens || left.name.localeCompare(right.name));
}

/**
 * Fire-and-forget from the public card. keepalive lets the request finish while
 * the browser is already following a tel:, mailto:, or external link.
 */
export function recordCardEvent(input: {
  company: string;
  person: string;
  kind: CardEventKind;
  detail?: string;
}) {
  if (typeof window === "undefined") return;
  if (!input.company || !input.person) return;
  try {
    void fetch("/api/cards/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    }).catch(() => {
      // Analytics must never interrupt the visitor.
    });
  } catch {
    // Ignore: a blocked request should not break the card.
  }
}
