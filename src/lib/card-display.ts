export type CardAddressLines = {
  street: string;
  locality: string;
};

/** Host only, uppercased, for the line at the bottom of a card. */
export function cardWebsiteHost(website: string) {
  const trimmed = website.trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname.replace(/^www\./i, "");
    return host ? host.toUpperCase() : "";
  } catch {
    const bare = trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0] ?? "";
    return bare.toUpperCase();
  }
}

export function cardAddressLines(company: {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}): CardAddressLines {
  const street = (company.street ?? "").trim();
  const city = (company.city ?? "").trim();
  const state = (company.state ?? "").trim();
  const postal = (company.postalCode ?? "").trim();
  const cityState = [city, state].filter(Boolean).join(", ");
  const locality = [cityState, postal].filter(Boolean).join(" ");
  return { street, locality };
}

export function cardMapsHref(lines: CardAddressLines) {
  const query = [lines.street, lines.locality].filter(Boolean).join(", ");
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export type CardNoteRow = {
  title: string;
  detail: string;
};

/**
 * The payment note becomes the Check row on the card when it is a payable line.
 * Anything else stays a note, so a free-text reminder is not labeled as a check.
 */
export function cardCheckRow(note: string): CardNoteRow | null {
  const text = note.trim().replace(/\s+/g, " ");
  if (!text) return null;
  const payable = text.match(/^(?:checks?\s+)?payable\s+to\s+(.+?)\.?$/i);
  if (payable?.[1]) {
    return { title: "Check", detail: `Payable to ${payable[1].trim()}` };
  }
  if (/^checks?\b/i.test(text)) {
    const rest = text.replace(/^checks?\b[\s:;,\-—–]*/i, "").replace(/\.+$/, "").trim();
    if (!rest) return { title: "Check", detail: "" };
    const detail = /^payable\s+to\b/i.test(rest) ? rest.replace(/^payable/i, "Payable") : rest;
    return { title: "Check", detail };
  }
  return { title: "Note", detail: text.replace(/\.+$/, "") };
}
