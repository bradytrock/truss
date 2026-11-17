import { ASSISTANT_NAME } from "./product.ts";

/** ZeroSettle portal. Office client texts do not use this host. */
export const ZEROSETTLE_BASE = "https://portal.zerosettle.io";
export const ZEROSETTLE_CONSOLE = `${ZEROSETTLE_BASE}/imessage`;

/** The assistant on a personal line is ZeroSettle's hosted agent. */
export const CASSIO_MANAGED_BY = "zerosettle" as const;

export type CassioLineChoice = {
  id: string;
  number: string;
  groupId: string;
};

export type ParsedCassioLine = {
  active: boolean;
  handle: string;
  yourNumber: string;
  profileName: string;
  lines: CassioLineChoice[];
  creditsLeft: number | null;
};

export type CassioAgentBody = {
  managed_by: typeof CASSIO_MANAGED_BY;
  personality: "professional";
  response_time: "instant";
  business_context: string;
  first_message_enabled: true;
  first_message: string[];
  goal_enabled: false;
  triggers: [];
  timezone: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function looksLikeZerosettleToken(value: string) {
  const token = value.trim();
  if (token.length < 16 || token.length > 512) return false;
  return !/\s/.test(token);
}

export function zerosettleTokenHint(value: string) {
  const token = value.trim();
  if (token.length < 4) return "";
  return token.slice(-4);
}

/** A seat time zone when it is a real IANA name. Otherwise the ZeroSettle default. */
export function cassioTimezone(value: string) {
  const zone = value.trim();
  if (!zone) return "America/New_York";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "America/New_York";
  }
}

export function cassioBusinessContext(input: { companyName: string; seatName: string }) {
  const company = input.companyName.trim() || "their company";
  const seat = input.seatName.trim() || "this person";
  return [
    `You are ${ASSISTANT_NAME}, the private texting assistant for ${seat} at ${company}.`,
    `You text only ${seat}, on this number. This number is not the office line. You do not text homeowners, realtors, or anyone else, and you do not join group chats.`,
    `${seat} uses you to think through their book: jobs, homeowners, estimates, and what to do next.`,
    "You cannot change jobs, estimates, invoices, or other records from this thread yet. When they need something saved, sent, or voided, tell them to do it in Truss, where you can show the change before it is saved.",
    "Do not invent job codes, invoice numbers, or dollar amounts. If this conversation did not give you a fact, say you do not have it.",
    "Write short plain texts. No markdown. One or two bubbles. Calm and direct.",
    "If they ask you to message a client, refuse and tell them client texts stay on the office line.",
    "If they want no more texts, they can send STOP.",
  ].join("\n");
}

export function cassioFirstMessages(input: { companyName: string; seatName: string }) {
  const company = input.companyName.trim() || "your company";
  const seat = input.seatName.trim() || "you";
  return [
    `This is ${ASSISTANT_NAME}, for ${seat} at ${company}.`,
    "Text me here when you want a hand with your book. I only answer you. Homeowner texts stay on the office line.",
  ];
}

export function cassioAgentBody(input: { companyName: string; seatName: string; timeZone: string }): CassioAgentBody {
  return {
    managed_by: CASSIO_MANAGED_BY,
    personality: "professional",
    response_time: "instant",
    business_context: cassioBusinessContext(input),
    first_message_enabled: true,
    first_message: cassioFirstMessages(input),
    goal_enabled: false,
    triggers: [],
    timezone: cassioTimezone(input.timeZone),
  };
}

/** Query that pins agent and profile calls to one line group. Empty on a single-number account. */
export function cassioLineQuery(choice: CassioLineChoice) {
  if (choice.groupId) return `?group=${encodeURIComponent(choice.groupId)}`;
  if (choice.id) return `?line_id=${encodeURIComponent(choice.id)}`;
  return "";
}

export function parseCassioLine(payload: unknown): ParsedCassioLine {
  const data = asRecord(payload) ?? {};
  const profile = asRecord(data.profile);
  const credits = asRecord(data.ai_credits);
  const listed = Array.isArray(data.lines) ? data.lines : [];
  const lines = listed
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      id: asString(item.id),
      number: asString(item.number),
      groupId: asString(item.group_id),
    }))
    .filter((item) => item.number);
  const handle = asString(data.handle);
  const choices = lines.length ? lines : handle ? [{ id: "", number: handle, groupId: "" }] : [];
  const left = credits?.left;
  return {
    active: data.active === true,
    handle,
    yourNumber: asString(data.your_number),
    profileName: asString(profile?.name),
    lines: choices,
    creditsLeft: typeof left === "number" && Number.isFinite(left) ? left : null,
  };
}

export function resolveCassioLine(line: ParsedCassioLine, requestedId: string) {
  const requested = requestedId.trim();
  if (!line.lines.length) {
    return { ok: false as const, code: "no_line" as const, message: "This ZeroSettle account has no iMessage number yet." };
  }
  const match = requested ? line.lines.find((item) => item.id === requested || item.number === requested) : undefined;
  if (line.lines.length > 1 && !match) {
    return { ok: false as const, code: "choose_line" as const, lines: line.lines };
  }
  const choice = match ?? line.lines[0];
  const sharesSender = Boolean(
    choice.groupId && line.lines.some((item) => item.groupId === choice.groupId && item.number !== choice.number),
  );
  return { ok: true as const, choice, sharesSender };
}

export function zerosettleFailure(status: number, payload: unknown) {
  const error = asRecord(asRecord(payload)?.error);
  const code = asString(error?.code);
  const message = asString(error?.message);
  if (status === 402 || code === "payment_required") {
    return {
      code: code || "payment_required",
      message: `This ZeroSettle line is not paid yet. Subscribe at ${ZEROSETTLE_CONSOLE}, then connect again.`,
    };
  }
  if (status === 401 || code === "unauthorized") {
    return { code: code || "unauthorized", message: "That ZeroSettle token was rejected. Mint a new one in the console and paste it again." };
  }
  return { code: code || "zerosettle", message: message || `ZeroSettle returned ${status}.` };
}
