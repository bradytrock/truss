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

/** Digit-only match so "(303) 555-0142" hits a search for 3035550142 or 555-0142. */
export function phoneQueryMatches(phone: string | null | undefined, query: string) {
  const needle = digitsOnly(query);
  if (needle.length < 3) return false;
  const stored = digitsOnly(phone ?? "");
  if (!stored) return false;
  if (stored.includes(needle) || needle.includes(stored)) return true;
  const stored10 = stored.length >= 10 ? stored.slice(-10) : stored;
  const needle10 = needle.length >= 10 ? needle.slice(-10) : needle;
  if (needle10.length >= 3 && stored10.includes(needle10)) return true;
  if (stored10.length >= 3 && needle10.includes(stored10)) return true;
  return false;
}

/** Formatted number plus digits for command-palette / substring indexes. */
export function phoneSearchText(phone: string | null | undefined) {
  const raw = (phone ?? "").trim();
  const digits = digitsOnly(raw);
  const last10 = digits.length >= 10 ? digits.slice(-10) : "";
  return [raw, digits, last10].filter(Boolean).join(" ");
}

export function firstName(name: string) {
  const token = name.trim().split(/\s+/)[0];
  return token || "there";
}
