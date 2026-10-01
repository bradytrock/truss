/** Photon message ids are unique per company. A tapback or reply often comes back with the id of the message it points at. */

export function isDuplicateMessageHandle(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "23505" && message.includes("messages_company_handle_idx");
}

export function distinctMessageHandle(handle: string, kind: string) {
  const base = handle.trim();
  const label = (kind.trim() || "text").replace(/[^a-z0-9]+/gi, "").slice(0, 24) || "text";
  return `${base}:${label}:${crypto.randomUUID().slice(0, 8)}`;
}

export function outboundMessageHandle(input: { returned?: string; occupied?: string; kind: string }) {
  const returned = input.returned?.trim() ?? "";
  const occupied = input.occupied?.trim() ?? "";
  const kind = input.kind.trim();
  if ((kind === "reaction" || kind === "reply") && occupied && (!returned || returned === occupied)) {
    return distinctMessageHandle(occupied, kind);
  }
  return returned;
}
