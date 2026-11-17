import { toE164 } from "./phone.ts";

export const CASSIO_SILENCE =
  "Stay silent. Do not mention the book, any person, a job, an estimate, or any amount.";

export type CassioAudience = "owner_dm" | "group" | "other" | "unknown";

export type CassioMessage = {
  chatId: string;
  handle: string;
  text: string;
  direction: string;
  ts: number;
};

const YES = /^(yes|yep|yeah|confirm|confirmed|save|save it|do it)[.!]?$/i;
const MONEY =
  /\$\s?\d|\b(?:contract value|balance due|invoice total|amount due|gross margin|net profit|dollar amount)\b/i;

export function phonesMatch(left: string, right: string) {
  const a = toE164(left);
  const b = toE164(right);
  if (!a || !b) return false;
  return a === b || a.slice(-10) === b.slice(-10);
}

export function isOwnerHandle(handle: string, ownerPhones: string[]) {
  return ownerPhones.some((phone) => phonesMatch(handle, phone));
}

export function isCassioYes(text: string) {
  return YES.test(text.trim());
}

export function textHasFinancials(text: string) {
  return MONEY.test(text);
}

/** A Seeds-group line. Empty when the text mentions money, so the group gets nothing. */
export function publicSeedLine(text: string) {
  const stripped = text.replace(/\s+/g, " ").trim();
  if (!stripped || textHasFinancials(stripped)) return "";
  return stripped;
}

export function parseZerosettleMessages(payload: unknown): CassioMessage[] {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const lists = [root.messages, root.data, Array.isArray(payload) ? payload : null];
  const found: CassioMessage[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const ts = typeof row.ts_ms === "number" ? row.ts_ms : 0;
      found.push({
        chatId: typeof row.chat_id === "string" ? row.chat_id : "",
        handle: typeof row.handle === "string" ? row.handle : "",
        text: typeof row.text === "string" ? row.text : "",
        direction: typeof row.direction === "string" ? row.direction : "",
        ts,
      });
    }
  }
  return found;
}

function audienceOf(message: CassioMessage, ownerPhones: string[]): CassioAudience {
  if (message.chatId) return "group";
  if (!message.handle) return "unknown";
  return isOwnerHandle(message.handle, ownerPhones) ? "owner_dm" : "other";
}

/**
 * Book answers require a private text from the account owner.
 * Mixed or missing context stays unknown, which means no reply.
 */
export function cassioAudience(input: {
  messages: CassioMessage[];
  ownerPhones: string[];
  now?: number;
}): CassioAudience {
  const now = input.now ?? Date.now();
  const inbound = input.messages
    .filter((message) => message.direction === "in")
    .sort((a, b) => b.ts - a.ts);
  const newest = inbound[0];
  if (!newest) return "unknown";
  const fresh = (message: CassioMessage) => message.ts <= 0 || now - message.ts <= 120_000;
  if (!fresh(newest)) return "unknown";
  const recent = inbound.filter((message) => message.ts <= 0 || now - message.ts <= 20_000);
  const sample = recent.length > 0 ? recent : [newest];
  const kinds = new Set(sample.map((message) => audienceOf(message, input.ownerPhones)));
  if (kinds.size !== 1) return "unknown";
  return kinds.values().next().value ?? "unknown";
}

export function cassioMayAnswer(audience: CassioAudience) {
  return audience === "owner_dm";
}

export function guardToolText(audience: CassioAudience, text: string) {
  if (!cassioMayAnswer(audience)) return CASSIO_SILENCE;
  if (textHasFinancials(text)) return CASSIO_SILENCE;
  return text;
}
