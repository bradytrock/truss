import { digitsOnly } from "@/lib/phone";

export function formatPhone(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  const last10 = digitsOnly(trimmed).slice(-10);
  if (last10.length !== 10) return trimmed || "—";
  return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
}

export function formatCurrency(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const digits = millions >= 10 || Number.isInteger(millions) ? 0 : 1;
    return `${sign}$${millions.toFixed(digits)}M`;
  }
  if (abs >= 10_000) {
    return `${sign}$${Math.round(abs / 1_000)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCurrencyFull(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function localYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localYmdPlusDays(days: number, from = new Date()) {
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return localYmd(next);
}

export function defaultEstimateValidUntil(from = new Date()) {
  return localYmdPlusDays(30, from);
}

export function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  return next;
}

export function endOfWeek(date: Date) {
  const end = startOfWeek(date);
  end.setDate(end.getDate() + 6);
  return end;
}

/** ISO week: week 1 is the first week of the year (the week that contains 4 January). Monday–Sunday. */
export function isoWeekParts(date: Date) {
  const monday = startOfWeek(date);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const year = thursday.getFullYear();
  const week1Monday = startOfWeek(new Date(year, 0, 4));
  const week = Math.round((monday.getTime() - week1Monday.getTime()) / (7 * 86_400_000)) + 1;
  return { year, week };
}

export function startOfIsoWeek(year: number, week: number) {
  const monday = startOfWeek(new Date(year, 0, 4));
  monday.setDate(monday.getDate() + (week - 1) * 7);
  return monday;
}

export function shiftIsoWeek(year: number, week: number, delta: number) {
  const start = startOfIsoWeek(year, week);
  start.setDate(start.getDate() + delta * 7);
  return isoWeekParts(start);
}

export function formatIsoWeekParam(year: number, week: number) {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function parseIsoWeekParam(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-W?(\d{1,2})$/i.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isFinite(year) || week < 1 || week > 53) return null;
  return { year, week };
}

export function isoWeekRange(year: number, week: number) {
  const start = startOfIsoWeek(year, week);
  const end = endOfWeek(start);
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return {
    year,
    week,
    start,
    end,
    param: formatIsoWeekParam(year, week),
    title: `Week ${week}`,
    rangeLabel: `${startLabel} – ${endLabel}`,
    label: `Week ${week} · ${startLabel} – ${endLabel}`,
  };
}

export function currentIsoWeekRange(from = new Date()) {
  const { year, week } = isoWeekParts(from);
  return isoWeekRange(year, week);
}

export function resolveIsoWeekRange(param?: string | null, from = new Date()) {
  const parsed = parseIsoWeekParam(param);
  if (parsed) return isoWeekRange(parsed.year, parsed.week);
  return currentIsoWeekRange(from);
}

export function localDayInRange(iso: string, start: Date, end: Date) {
  const day = localYmd(parseDate(iso));
  return day >= localYmd(start) && day <= localYmd(end);
}

function parseDate(iso: string) {
  if (iso.includes("T")) return new Date(iso);
  return new Date(`${iso}T12:00:00`);
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return parseDate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateShort(iso: string | null | undefined) {
  if (!iso) return "—";
  return parseDate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatRelative(iso: string) {
  const date = parseDate(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (Math.abs(diffMin) < 1) return "just now";
  if (Math.abs(diffMin) < 60) {
    return diffMin > 0 ? `${diffMin}m ago` : `in ${-diffMin}m`;
  }
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) {
    return diffHr > 0 ? `${diffHr}h ago` : `in ${-diffHr}h`;
  }
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 14) {
    return diffDay > 0 ? `${diffDay}d ago` : `in ${diffDay === -1 ? "1 day" : `${-diffDay} days`}`;
  }
  return formatDate(iso);
}

export function formatInboxTime(iso: string) {
  const date = parseDate(iso);
  const today = localYmd(new Date());
  const day = localYmd(date);
  if (day === today) return formatTime(iso);
  const startToday = parseDate(`${today}T12:00:00`);
  const startThen = parseDate(`${day}T12:00:00`);
  const days = Math.round((startToday.getTime() - startThen.getTime()) / 86_400_000);
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  return formatDateShort(iso);
}

export function formatMessageStamp(iso: string) {
  const date = parseDate(iso);
  if (localYmd(date) === localYmd(new Date())) return formatTime(iso);
  return `${formatDateShort(iso)}, ${formatTime(iso)}`;
}

export function sameLocalDay(left: string, right: string) {
  return localYmd(parseDate(left)) === localYmd(parseDate(right));
}

export function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  const date = parseDate(iso);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  date.setHours(12, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatCompanyAddressLines(company: {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}) {
  const cityLine = [company.city, company.state].filter(Boolean).join(", ");
  const locality = [cityLine, company.postalCode].filter(Boolean).join(" ");
  return [company.street, locality].filter(Boolean);
}

export function formatCompanyAddress(company: {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}) {
  return formatCompanyAddressLines(company).join(" · ");
}

export function formatCompanyContact(company: { phone: string; email: string; website: string }) {
  return [company.phone, company.email, company.website].filter(Boolean).join(" · ");
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
