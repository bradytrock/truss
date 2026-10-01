/**
 * Receive webhook for Photon inbound texts.
 * Same ingest path as /api/messages/inbound/[token].
 * Field parsing matches src/lib/inbound-text.ts and src/lib/imessage.ts.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

/** Stable Photon iMessage add-ons: tapbacks and bubble or screen effects. */

const IMESSAGE_TAPBACKS = [
  { emoji: "❤️", label: "Love", verb: "Loved" },
  { emoji: "👍", label: "Like", verb: "Liked" },
  { emoji: "👎", label: "Dislike", verb: "Disliked" },
  { emoji: "😂", label: "Laugh", verb: "Laughed at" },
  { emoji: "‼️", label: "Emphasize", verb: "Emphasized" },
  { emoji: "❓", label: "Question", verb: "Questioned" },
] as const;

const IMESSAGE_EFFECTS = [
  { id: "com.apple.messages.effect.CKConfettiEffect", label: "Confetti" },
  { id: "com.apple.messages.effect.CKBalloonEffect", label: "Balloons" },
  { id: "com.apple.messages.effect.CKLasersEffect", label: "Lasers" },
  { id: "com.apple.messages.effect.CKFireworksEffect", label: "Fireworks" },
  { id: "com.apple.messages.effect.CKSparklesEffect", label: "Sparkles" },
  { id: "com.apple.messages.effect.CKSpotlightEffect", label: "Spotlight" },
  { id: "com.apple.messages.effect.CKHeartEffect", label: "Heart" },
  { id: "com.apple.messages.effect.CKEchoEffect", label: "Echo" },
  { id: "com.apple.messages.effect.CKHappyBirthdayEffect", label: "Celebration" },
  { id: "com.apple.MobileSMS.expressivesend.impact", label: "Slam" },
  { id: "com.apple.MobileSMS.expressivesend.loud", label: "Loud" },
  { id: "com.apple.MobileSMS.expressivesend.gentle", label: "Gentle" },
  { id: "com.apple.MobileSMS.expressivesend.invisibleink", label: "Invisible ink" },
] as const;

const TAPBACK_VERBS = new Map<string, string>([
  ...IMESSAGE_TAPBACKS.map((item) => [item.emoji, item.verb] as const),
  ["❤", "Loved"],
  ["❗", "Emphasized"],
]);

function imessageTapbackVerb(emoji: string) {
  return TAPBACK_VERBS.get(emoji.trim()) ?? "";
}

function imessageEffectLabel(value: string) {
  const raw = value.trim();
  const found = IMESSAGE_EFFECTS.find(
    (item) => item.id === raw || item.label.toLowerCase() === raw.toLowerCase(),
  );
  if (found) return found.label;
  if (!raw) return "Effect";
  const tail = raw.split(".").pop() ?? raw;
  const words = tail.replace(/^CK/, "").replace(/Effect$/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  return words || "Effect";
}

function imessageEffectId(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  return (
    IMESSAGE_EFFECTS.find((item) => item.id === raw || item.label.toLowerCase() === raw.toLowerCase())?.id ?? ""
  );
}

/** Words written into the thread for a tapback, including the quoted preview. */
function imessageReactionText(emoji: string, preview: string) {
  const verb = imessageTapbackVerb(emoji);
  const text = preview.trim().replace(/\s+/g, " ").slice(0, 160);
  const quoted = text ? `“${text}”` : "";
  if (verb && quoted) return { body: `${verb} ${quoted}`, detail: verb };
  if (verb) return { body: `${verb} a message`, detail: verb };
  if (emoji && quoted) return { body: `Reacted ${emoji} to ${quoted}`, detail: emoji };
  if (emoji) return { body: `Reacted ${emoji}`, detail: emoji };
  return { body: "Reacted to a message", detail: "Reaction" };
}

function asRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nestedMessage(body: Record<string, unknown>) {
  return asRecord(body.message);
}

function senderId(value: unknown) {
  const record = asRecord(value);
  if (!record) return "";
  return asString(record.id) || asString(record.address) || asString(record.phone);
}

function httpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim()) ? value.trim() : "";
}

/** Spectrum Stable delivers one event, `messages`. Older payloads used `message.received`. */
const ACCEPTED_EVENTS = new Set(["messages", "message.received"]);

type InboundAction = "insert" | "edit" | "unsend";

type InboundText = {
  from: string;
  content: string;
  handle: string;
  mediaUrl: string;
  sentAt: string | null;
  kind: string;
  detail: string;
  action: InboundAction;
  targetHandle: string;
};

type Piece = {
  body: string;
  kind: string;
  detail: string;
  action: InboundAction;
  targetHandle: string;
};

function piece(body: string, extra?: Partial<Piece>): Piece {
  return { body, kind: "text", detail: "", action: "insert", targetHandle: "", ...extra };
}

function eventName(body: Record<string, unknown>) {
  return (asString(body.event) || asString(body.type)).toLowerCase();
}

/** Photon deliveries are inbound. Skip echoes marked outbound or from this line. */
function inboundSkipReason(body: Record<string, unknown>) {
  if (body.is_outbound === true || body.isFromMe === true) return "outbound";
  const direction = asString(body.direction).toLowerCase();
  if (direction === "outbound") return "outbound";
  const message = nestedMessage(body);
  if (message) {
    if (message.is_outbound === true || message.isFromMe === true) return "outbound";
    if (asString(message.direction).toLowerCase() === "outbound") return "outbound";
  }
  const event = eventName(body);
  if (event && !ACCEPTED_EVENTS.has(event)) return "ignored_event";
  return null;
}

function quoted(value: string) {
  const text = value.trim();
  return text ? `“${text}”` : "";
}

function targetOf(content: Record<string, unknown>) {
  return asRecord(content.target);
}

function reactionBody(content: Record<string, unknown>): Piece {
  const emoji = asString(content.emoji).trim();
  const target = targetOf(content);
  const text = imessageReactionText(emoji, asString(target?.contentPreview));
  return piece(text.body, {
    kind: "reaction",
    detail: text.detail,
    targetHandle: asString(target?.id),
  });
}

function attachmentBody(content: Record<string, unknown>) {
  const mime = asString(content.mimeType).toLowerCase();
  const name = asString(content.name).trim();
  const kind = mime.startsWith("image/")
    ? "Photo"
    : mime.startsWith("audio/")
      ? "Voice message"
      : mime.startsWith("video/")
        ? "Video"
        : "File";
  return name ? `${kind} · ${name}` : kind;
}

function contactBody(content: Record<string, unknown>) {
  const name = asRecord(content.name);
  const formatted =
    asString(name?.formatted).trim() ||
    [asString(name?.first), asString(name?.last)].filter((part) => part.trim()).join(" ");
  const phones = Array.isArray(content.phones) ? content.phones : [];
  const phone = asString(asRecord(phones[0])?.value).trim();
  const who = formatted || phone;
  return who ? `Shared a contact · ${who}` : "Shared a contact";
}

function namesOf(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => (typeof item === "string" ? item : asString(asRecord(item)?.id)))
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function describeContent(content: unknown, fallback: string): Piece | null {
  if (typeof content === "string") return piece(content.trim() || fallback.trim());
  const record = asRecord(content);
  if (!record) {
    const body = fallback.trim();
    return body ? piece(body) : null;
  }
  const type = asString(record.type);
  if (type === "typing") return null;
  if (!type || type === "text") {
    const subject = asString(record.subject).trim();
    const text = asString(record.text).trim() || asString(record.body).trim() || fallback.trim();
    const body = subject && text ? `${subject}\n${text}` : subject || text;
    return body ? piece(body) : null;
  }
  if (type === "markdown") {
    const body = asString(record.markdown).trim() || asString(record.text).trim();
    return body ? piece(body, { kind: "markdown" }) : null;
  }
  if (type === "attachment") {
    return piece(attachmentBody(record), { kind: "attachment", detail: asString(record.mimeType) });
  }
  if (type === "reaction") return reactionBody(record);
  if (type === "contact") return piece(contactBody(record), { kind: "contact" });
  if (type === "richlink") {
    return piece(asString(record.url).trim() || "Shared a link", { kind: "richlink" });
  }
  if (type === "read") return piece("Read a message", { kind: "read" });
  if (type === "effect") {
    const inner = describeContent(record.content, fallback);
    const label = imessageEffectLabel(asString(record.effect));
    if (!inner) return piece(label, { kind: "effect", detail: label });
    return piece(inner.body, { kind: "effect", detail: label });
  }
  if (type === "reply") {
    const inner = describeContent(record.content ?? record.text, fallback);
    const preview = quoted(asString(targetOf(record)?.contentPreview));
    return piece(inner?.body || fallback.trim() || "Reply", {
      kind: "reply",
      detail: preview ? `Reply to ${preview}` : "Reply",
      targetHandle: asString(targetOf(record)?.id),
    });
  }
  if (type === "edit") {
    const inner = describeContent(record.content ?? record.text, fallback);
    return piece(inner?.body || "Edited a message", {
      kind: "edit",
      detail: "Edited",
      action: "edit",
      targetHandle: asString(targetOf(record)?.id),
    });
  }
  if (type === "unsend") {
    return piece("Message unsent", {
      kind: "unsend",
      detail: "Unsent",
      action: "unsend",
      targetHandle: asString(targetOf(record)?.id) || asString(record.id),
    });
  }
  if (type === "poll") {
    const options = Array.isArray(record.options)
      ? record.options.map((item) => asString(asRecord(item)?.title).trim()).filter(Boolean)
      : [];
    return piece(asString(record.title).trim() || "Poll", {
      kind: "poll",
      detail: options.join(" · "),
    });
  }
  if (type === "poll_option") {
    return piece(asString(record.title).trim() || "Voted", { kind: "poll", detail: "Vote" });
  }
  if (type === "rename") {
    const name = asString(record.displayName).trim();
    return piece(name ? `Renamed the chat to ${name}` : "Renamed the chat", { kind: "rename", detail: name });
  }
  if (type === "addMember") {
    const names = namesOf(record.members);
    return piece(names ? `Added ${names}` : "Added someone to the chat", { kind: "membership" });
  }
  if (type === "removeMember") {
    const names = namesOf(record.members);
    return piece(names ? `Removed ${names}` : "Removed someone from the chat", { kind: "membership" });
  }
  if (type === "leaveSpace") return piece("Left the conversation", { kind: "membership" });
  if (type === "avatar") return piece("Changed the group photo", { kind: "avatar" });
  const text = asString(record.text).trim() || asString(record.body).trim();
  if (text) return piece(text, { kind: type || "text" });
  if (type) return piece(type, { kind: type });
  return null;
}

function mediaFrom(raw: Record<string, unknown>, message: Record<string, unknown> | null) {
  return httpUrl(asString(message?.media_url)) || httpUrl(asString(raw.media_url));
}

function oneMessage(
  raw: Record<string, unknown>,
  message: Record<string, unknown> | null,
  content: unknown,
  fallbackFrom: string,
  fallbackHandle: string,
  fallbackSentAt: string | null,
): InboundText | null {
  const described = describeContent(content, asString(raw.text) || asString(message?.text));
  const mediaUrl = mediaFrom(raw, message);
  if (!described && !mediaUrl) return null;
  const from =
    senderId(message?.sender) ||
    senderId(raw.sender) ||
    asString(raw.from_number) ||
    asString(message?.from_number) ||
    asString(raw.number) ||
    asString(message?.number) ||
    fallbackFrom;
  const handle =
    asString(message?.id) ||
    asString(message?.guid) ||
    asString(raw.message_handle) ||
    asString(raw.id) ||
    fallbackHandle;
  const sentAt =
    asString(message?.timestamp) ||
    asString(raw.date_sent) ||
    asString(raw.occurredAt) ||
    asString(message?.date_sent) ||
    asString(message?.occurredAt) ||
    fallbackSentAt ||
    null;
  const row = described ?? piece("(photo or attachment)");
  return {
    from,
    content: row.body || "(photo or attachment)",
    handle,
    mediaUrl,
    sentAt: sentAt || null,
    kind: row.kind,
    detail: row.detail,
    action: row.action,
    targetHandle: row.targetHandle,
  };
}

/** Every inbound row in one Photon delivery. Albums become one row per photo. */
function inboundMessages(raw: Record<string, unknown>): InboundText[] {
  const message = nestedMessage(raw);
  const content = message?.content ?? raw.content;
  const record = asRecord(content);
  if (record && asString(record.type) === "group" && Array.isArray(record.items)) {
    const parent = oneMessage(raw, message, null, "", "", null);
    const items = record.items.flatMap((item, index) => {
      const row = asRecord(item);
      if (!row) return [];
      const parsed = oneMessage(
        raw,
        row,
        row.content,
        parent?.from ?? "",
        parent?.handle ? `${parent.handle}:${index}` : "",
        parent?.sentAt ?? null,
      );
      return parsed ? [parsed] : [];
    });
    if (items.length > 0) return items;
  }
  const parsed = oneMessage(raw, message, content, "", "", null);
  return parsed ? [parsed] : [];
}

const EMPTY_INBOUND: InboundText = {
  from: "",
  content: "",
  handle: "",
  mediaUrl: "",
  sentAt: null,
  kind: "text",
  detail: "",
  action: "insert",
  targetHandle: "",
};

function inboundTextFields(raw: Record<string, unknown>): InboundText {
  return inboundMessages(raw)[0] ?? EMPTY_INBOUND;
}


function schemaMissing(status: number, payload: unknown) {
  const message = payload && typeof payload === "object" && "message" in payload ? String((payload as { message?: unknown }).message ?? "") : "";
  const code = payload && typeof payload === "object" && "code" in payload ? String((payload as { code?: unknown }).code ?? "") : "";
  return status === 404 || code.startsWith("PGRST20") || message.includes("Could not find the");
}

async function rpc(supabaseUrl: string, serviceKey: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const payload = await response.json().catch(() => ({ ok: true }));
  return { response, payload };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (request.method === "GET") {
    return json({ ok: true });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() || "";
  if (token.length < 24) {
    return json(
      { error: "Use this company's webhook URL from Settings → Photon. A shared webhook cannot receive texts." },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Missing Supabase service credentials." }, 500);
  }

  let raw: Record<string, unknown> = {};
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: true, skipped: true });
  }

  const company = await rpc(supabaseUrl, serviceKey, "photon_inbound_company", { p_token: token });
  const companyPayload = company.payload as { ok?: boolean; companyId?: string; error?: string };
  const companyId = companyPayload?.ok === true && typeof companyPayload.companyId === "string" ? companyPayload.companyId : "";
  if (!company.response.ok || !companyId) {
    return json({ error: companyPayload?.error || "Unknown webhook." }, 401);
  }

  const skip = inboundSkipReason(raw);
  if (skip) return json({ ok: true, skipped: true, reason: skip });

  const messages = inboundMessages(raw);
  if (messages.length === 0) return json({ ok: true, skipped: true, reason: "empty" });

  const saved = [];
  for (const fields of messages) {
    if ((fields.action === "edit" || fields.action === "unsend") && fields.targetHandle) {
      const revised = await rpc(supabaseUrl, serviceKey, "apply_imessage_revision", {
        p_company_id: companyId,
        p_handle: fields.targetHandle,
        p_body: fields.content,
        p_kind: fields.kind,
        p_detail: fields.detail,
      });
      if (!revised.response.ok) {
        if (schemaMissing(revised.response.status, revised.payload)) {
          return json({ ok: true, skipped: true, reason: "run_messages_sql" });
        }
        return json(revised.payload, 500);
      }
      const revision = revised.payload as { reason?: string };
      if (revision?.reason !== "not_found") {
        saved.push(revised.payload);
        continue;
      }
    }

    const inserted = await rpc(supabaseUrl, serviceKey, "ingest_inbound_text", {
      p_from: fields.from,
      p_body: fields.content,
      p_handle: fields.handle,
      p_media_url: fields.mediaUrl,
      p_sent_at: fields.sentAt,
      p_company_id: companyId,
      p_kind: fields.kind,
      p_detail: fields.detail,
    });
    if (!inserted.response.ok) {
      if (schemaMissing(inserted.response.status, inserted.payload)) {
        return json({ ok: true, skipped: true, reason: "run_messages_sql" });
      }
      return json(inserted.payload, 500);
    }
    saved.push(inserted.payload);
  }

  return json(saved.length === 1 ? saved[0] : { ok: true, count: saved.length, messages: saved });
});
