import { looksLikePhone, storedPhone, toE164 } from "./phone.ts";

export const WEBSITE_CHAT_GREETING = "Hi, I was on your website.";

export const CHAT_ASK_NAME = "What's your name?";
export const CHAT_ASK_PHONE = "What's the best phone number to reach you?";
export const CHAT_ASK_STREET = "What's the street address?";
export const CHAT_ASK_CHANNEL = "Thanks. You can keep talking here, or move this over to a text.";

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

/** Phones open Messages. Tablets and desktops stay in the chat box. */
export function isPhoneUserAgent(userAgent: string) {
  const ua = userAgent || "";
  if (/iPad|Tablet/i.test(ua)) return false;
  return /iPhone|iPod|Android.+Mobile|Mobile.+Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

/**
 * Opens the phone's Messages app. iPhone uses `&body=`; other phones use `?body=`.
 * The destination is the company main phone, not a separate texting project.
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

export function websiteChatAdminText(input: {
  name: string;
  phone: string;
  street: string;
  companyName: string;
}) {
  const office = input.companyName.trim() || "the office";
  return [
    `${input.name.trim() || "A visitor"} started a website chat with ${office}.`,
    `Phone: ${input.phone.trim() || "—"}`,
    `Street: ${input.street.trim() || "—"}`,
    "The lead is unassigned. Assign it when you are ready, and that project manager is notified.",
  ].join("\n");
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
