/** US-first E.164 helper for homeowner texts. */
export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function toE164(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    const rest = digitsOnly(trimmed.slice(1));
    return rest ? `+${rest}` : "";
  }
  const digits = digitsOnly(trimmed);
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return "";
}

export function looksLikePhone(value: string) {
  return toE164(value).length >= 12;
}

export function firstName(name: string) {
  const token = name.trim().split(/\s+/)[0];
  return token || "there";
}
