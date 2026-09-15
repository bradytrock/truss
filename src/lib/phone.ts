/** US-first E.164 helper for homeowner texts. */
export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

/** `(214) 555-0100` as you type. Leaves non-US `+` numbers alone. */
export function formatPhoneInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+") && !trimmed.startsWith("+1")) return trimmed;
  const digits = digitsOnly(trimmed);
  const national = digits.length >= 11 && digits.startsWith("1") ? digits.slice(1, 11) : digits.slice(0, 10);
  if (!national) return "";
  if (national.length <= 3) return `(${national}`;
  if (national.length <= 6) return `(${national.slice(0, 3)}) ${national.slice(3)}`;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/** Same as the input mask — use when persisting a phone. */
export function storedPhone(value: string | null | undefined) {
  return formatPhoneInput(value ?? "");
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

export function contactMatchesQuery(
  contact: { name: string; title: string; email: string; phone: string | null | undefined },
  query: string,
  extra: Array<string | null | undefined> = [],
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (phoneQueryMatches(contact.phone, query)) return true;
  const haystack = [
    contact.name,
    contact.title,
    contact.email,
    contact.phone,
    phoneSearchText(contact.phone),
    ...extra,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function firstName(name: string) {
  const token = name.trim().split(/\s+/)[0];
  return token || "there";
}
