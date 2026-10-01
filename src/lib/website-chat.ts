import { looksLikePhone, storedPhone, toE164 } from "./phone.ts";

export const WEBSITE_CHAT_GREETING = "Hi, I was on your website.";

export const CHAT_ASK_NAME = "What's your name?";
export const CHAT_ASK_MARKET = "Is this residential or commercial?";
export const CHAT_ASK_TRADES = "Which trades are involved?";
export const CHAT_ASK_FIRST = "What's your first name?";
export const CHAT_ASK_LAST = "What's your last name?";
export const CHAT_ASK_PHONE = "What's the best phone number to reach you?";
export const CHAT_ASK_EMAIL = "What's your email?";
export const CHAT_ASK_STREET = "What's the street address?";
export const CHAT_ASK_CITY = "What city?";
export const CHAT_ASK_STATE = "What state?";
export const CHAT_ASK_ZIP = "What's the ZIP code?";
export const CHAT_ASK_CHANNEL = "Thanks. You can keep talking here, or move this over to a text.";
export const CHAT_EMAIL_SKIP = "No email";

/** Same trade chips as a new lead. Order is the order they are stored. */
export const CHAT_TRADES = ["Fencing", "Roofing", "Gutters", "Siding", "Flooring", "Other"] as const;

export type ChatTrade = (typeof CHAT_TRADES)[number];
export type ChatMarket = "residential" | "commercial";

const STATE_BY_NAME: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

export type WebsiteChatMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
};

export type WebsiteChatThread = {
  id: string;
  label: string;
  updatedAt: string;
  preview: string;
  jobId?: string | null;
  channel?: string;
  messages: WebsiteChatMessage[];
};

function chatText(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** Office list rows can arrive with a blank label or a missing message list. */
export function officeWebsiteChats(value: unknown): WebsiteChatThread[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const chat = item as Record<string, unknown>;
    const id = chatText(chat.id);
    if (!id) return [];
    const messages = Array.isArray(chat.messages)
      ? chat.messages.flatMap((message) => {
          if (!message || typeof message !== "object") return [];
          const row = message as Record<string, unknown>;
          const messageId = chatText(row.id);
          if (!messageId) return [];
          return [
            {
              id: messageId,
              direction: row.direction === "outbound" ? ("outbound" as const) : ("inbound" as const),
              body: chatText(row.body),
              createdAt: chatText(row.createdAt),
            },
          ];
        })
      : [];
    const label = chatText(chat.label).trim();
    return [
      {
        id,
        label: label || "Website visitor",
        updatedAt: chatText(chat.updatedAt),
        preview: chatText(chat.preview),
        jobId: chatText(chat.jobId) || null,
        channel: chatText(chat.channel) || undefined,
        messages,
      },
    ];
  });
}

/** Phones open Messages. Tablets and desktops stay in the chat box. */
export function isPhoneUserAgent(userAgent: string) {
  const ua = userAgent || "";
  if (/iPad|Tablet/i.test(ua)) return false;
  return /iPhone|iPod|Android.+Mobile|Mobile.+Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

/**
 * Opens the phone's Messages app. iPhone uses `&body=`; other phones use `?body=`.
 * The destination is this office's Photon line.
 */
export function messagesAppLink(phone: string, body: string, iphone: boolean) {
  const e164 = toE164(phone);
  if (!e164) return "";
  const text = body.trim();
  if (!text) return `sms:${e164}`;
  const joiner = iphone ? "&" : "?";
  return `sms:${e164}${joiner}body=${encodeURIComponent(text)}`;
}

export function parseChatName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80 || !/[A-Za-z]/.test(name)) return "";
  return name;
}

export function parseChatPersonName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40 || !/[A-Za-z]/.test(name)) return "";
  return name;
}

export function parseChatMarket(value: string): ChatMarket | "" {
  const text = value.trim().toLowerCase();
  if (text === "residential" || text === "home" || text === "house") return "residential";
  if (text === "commercial") return "commercial";
  return "";
}

export function chatMarketLabel(market: ChatMarket) {
  return market === "commercial" ? "Commercial" : "Residential";
}

export function parseChatTrades(value: string) {
  const picked = new Set<ChatTrade>();
  for (const part of value.split(/[,/]| and /i)) {
    const text = part.trim().toLowerCase();
    if (!text) continue;
    const match = CHAT_TRADES.find((trade) => trade.toLowerCase() === text);
    if (!match) return "";
    picked.add(match);
  }
  return formatChatTrades([...picked]);
}

export function formatChatTrades(trades: readonly string[]) {
  const picked = new Set(trades);
  return CHAT_TRADES.filter((trade) => picked.has(trade)).join(", ");
}

export function parseChatEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return "";
  return email;
}

export function isChatEmailSkip(value: string) {
  return /^(skip|none|no|no email|n\/a|na)$/i.test(value.trim());
}

export function parseChatCity(value: string) {
  const city = value.trim().replace(/\s+/g, " ");
  if (city.length < 2 || city.length > 80 || !/[A-Za-z]/.test(city)) return "";
  return city;
}

export function parseChatState(value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
  return STATE_BY_NAME[text.toLowerCase()] || "";
}

export function parseChatZip(value: string) {
  const zip = value.trim();
  if (!/^\d{5}(?:-\d{4})?$/.test(zip)) return "";
  return zip;
}

/** Project type stored on the lead. Commercial stays commercial. A single trade can name the work. */
export function chatProjectType(market: ChatMarket, trades: string) {
  if (market === "commercial") return "commercial";
  const list = trades.split(", ").filter(Boolean);
  if (list.length === 1 && list[0] === "Roofing") return "roofing";
  if (list.length === 1 && list[0] === "Flooring") return "remodel";
  if (list.length > 0 && list.every((item) => item === "Fencing" || item === "Gutters" || item === "Siding")) {
    return "exterior";
  }
  return "restoration";
}

export function parseChatPhone(value: string) {
  if (!looksLikePhone(value)) return "";
  return storedPhone(value);
}

export function parseChatStreet(value: string) {
  const street = value.trim().replace(/\s+/g, " ");
  if (street.length < 5 || street.length > 160) return "";
  return street;
}

export function textHandoffBody(name: string, street: string) {
  const who = name.trim() || "a visitor";
  const place = street.trim();
  return place
    ? `Hi, this is ${who}. I was on your website about ${place}.`
    : `Hi, this is ${who}. I was on your website.`;
}

export function websiteChatAdminSubject(name: string, street: string) {
  const place = street.trim() || name.trim() || "a visitor";
  return `New website conversation — ${place}`;
}

/** Office chats email every admin. A personal chat emails only that person. */
export function websiteChatNotifyAdmins<T extends { name?: string }>(admins: T[], ownerName?: string): T[] {
  const owner = ownerName?.trim().toLowerCase() ?? "";
  if (!owner) return admins;
  return admins.filter((admin) => (admin.name ?? "").trim().toLowerCase() === owner);
}

export function websiteChatAdminText(input: {
  name: string;
  phone: string;
  street: string;
  companyName: string;
  ownerName?: string;
  email?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  market?: string;
  trades?: string;
}) {
  const office = input.companyName.trim() || "the office";
  const owner = input.ownerName?.trim() ?? "";
  const place = [input.street, input.city, [input.state, input.postalCode].filter(Boolean).join(" ")]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(", ");
  return [
    `${input.name.trim() || "A visitor"} started a website chat with ${office}.`,
    `Market: ${input.market?.trim() || "—"}`,
    `Trades: ${input.trades?.trim() || "—"}`,
    `Phone: ${input.phone.trim() || "—"}`,
    `Email: ${input.email?.trim() || "—"}`,
    `Address: ${place || "—"}`,
    owner
      ? `The lead is in ${owner}'s pipeline.`
      : "The lead is unassigned. Assign it when you are ready, and that project manager is notified.",
  ].join("\n");
}

/** One header tag. A person id assigns new leads to that seat. */
export function websiteChatEmbedCode(origin: string, company: string, personId = "") {
  const root = origin.replace(/\/$/, "");
  const office = company.trim().replace(/"/g, "");
  const person = personId.trim().replace(/"/g, "");
  const personAttr = person ? ` data-person="${person}"` : "";
  return `<script src="${root}/api/chat/widget.js" data-company="${office}"${personAttr} async></script>`;
}

export function fallbackChatReplies() {
  return [
    "Thanks for reaching out. What address is the roof at?",
    "We can take a look. What day works for a visit?",
  ];
}

export function parseSuggestedReplies(raw: string) {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as { replies?: unknown };
    if (!Array.isArray(parsed.replies)) return [];
    return parsed.replies
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim().slice(0, 240))
      .slice(0, 3);
  } catch {
    return [];
  }
}
