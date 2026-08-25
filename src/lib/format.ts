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

export function formatCompanyAddress(company: {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}) {
  const cityLine = [company.city, company.state].filter(Boolean).join(", ");
  const locality = [cityLine, company.postalCode].filter(Boolean).join(" ");
  return [company.street, locality].filter(Boolean).join(" · ");
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
