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
