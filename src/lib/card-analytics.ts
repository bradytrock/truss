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
  { value: "all", label: "All time", days: null },
] as const;

export type CardRange = (typeof CARD_RANGES)[number]["value"];

export function sinceForRange(range: CardRange) {
  const match = CARD_RANGES.find((item) => item.value === range);
  if (!match?.days) return null;
  const since = new Date();
  since.setDate(since.getDate() - match.days);
  return since.toISOString();
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
