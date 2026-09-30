import { toE164 } from "./phone.ts";

export const WEBSITE_CHAT_GREETING = "Hi, I was on your website.";

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
