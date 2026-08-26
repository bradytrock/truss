import type { Expense, QbVendor } from "@/lib/types";

export function vendorChoices(qbVendors: QbVendor[], expenses: Expense[]) {
  const fromQb: QbVendor[] = [];
  const seen = new Set<string>();
  for (const vendor of [...qbVendors].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  )) {
    const name = vendor.name.trim();
    if (!vendor.isActive || !name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    fromQb.push({ ...vendor, name });
  }
  const extras: string[] = [];
  for (const expense of expenses) {
    const name = expense.vendor.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push(name);
  }
  extras.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return { fromQb, extras };
}

export function matchVendorName(raw: string, names: string[]) {
  const needle = raw.trim().toLowerCase();
  if (!needle) return "";
  const exact = names.find((name) => name.toLowerCase() === needle);
  if (exact) return exact;
  const starts = names.find(
    (name) => name.toLowerCase().startsWith(needle) || needle.startsWith(name.toLowerCase()),
  );
  return starts || raw.trim();
}
