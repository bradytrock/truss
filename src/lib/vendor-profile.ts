import type { VendorFeedback, VendorPrice, VendorProfile } from "./types.ts";

export function vendorNameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function vendorProfileName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function fillVendorProfile(
  profile: Partial<VendorProfile> & Pick<VendorProfile, "id" | "name">,
): VendorProfile {
  const name = vendorProfileName(profile.name);
  return {
    id: profile.id,
    name,
    nameKey: profile.nameKey || vendorNameKey(name),
    notes: profile.notes ?? "",
    updatedBy: profile.updatedBy ?? "",
    updatedAt: profile.updatedAt ?? new Date().toISOString(),
    createdAt: profile.createdAt ?? new Date().toISOString(),
  };
}

export function fillVendorFeedback(
  item: Partial<VendorFeedback> & Pick<VendorFeedback, "id" | "profileId" | "body">,
): VendorFeedback {
  return {
    id: item.id,
    profileId: item.profileId,
    body: item.body.trim(),
    createdBy: item.createdBy ?? "",
    createdAt: item.createdAt ?? new Date().toISOString(),
  };
}

export function fillVendorPrice(
  item: Partial<VendorPrice> & Pick<VendorPrice, "id" | "profileId" | "name">,
): VendorPrice {
  return {
    id: item.id,
    profileId: item.profileId,
    name: item.name.trim() || "Price",
    unit: item.unit?.trim() || "EA",
    unitCost: Number.isFinite(item.unitCost) ? Number(item.unitCost) : 0,
    notes: item.notes ?? "",
    sortOrder: item.sortOrder ?? 0,
  };
}

export function vendorFeedbackFor(profileId: string, items: VendorFeedback[]) {
  return items
    .filter((item) => item.profileId === profileId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function vendorPricesFor(profileId: string, items: VendorPrice[]) {
  return items
    .filter((item) => item.profileId === profileId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

export function findVendorProfile(
  profiles: VendorProfile[],
  input: { id?: string | null; name?: string | null },
) {
  if (input.id) {
    const byId = profiles.find((profile) => profile.id === input.id);
    if (byId) return byId;
  }
  const key = vendorNameKey(input.name ?? "");
  if (!key) return undefined;
  return profiles.find((profile) => profile.nameKey === key);
}

export function planVendorDirectory(input: {
  qbVendors: Array<{ id: string; name: string }>;
  profiles?: VendorProfile[];
  feedback?: VendorFeedback[];
  prices?: VendorPrice[];
  extraNames?: Array<{ name: string; kind: "trade" | "payee" }>;
}) {
  const profiles = input.profiles ?? [];
  const feedbackCounts = new Map<string, number>();
  for (const item of input.feedback ?? []) {
    feedbackCounts.set(item.profileId, (feedbackCounts.get(item.profileId) ?? 0) + 1);
  }
  const priceCounts = new Map<string, number>();
  for (const item of input.prices ?? []) {
    priceCounts.set(item.profileId, (priceCounts.get(item.profileId) ?? 0) + 1);
  }
  const profileByKey = new Map(profiles.map((profile) => [profile.nameKey, profile]));
  const rows = new Map<
    string,
    {
      nameKey: string;
      name: string;
      kind: "quickbooks" | "trade" | "payee";
      qbId: string | null;
      profileId: string | null;
      internalNotes: string;
      feedbackCount: number;
      priceCount: number;
    }
  >();

  for (const vendor of input.qbVendors) {
    const name = vendorProfileName(vendor.name);
    const nameKey = vendorNameKey(name);
    if (!nameKey) continue;
    const profile = profileByKey.get(nameKey);
    rows.set(nameKey, {
      nameKey,
      name,
      kind: "quickbooks",
      qbId: vendor.id,
      profileId: profile?.id ?? null,
      internalNotes: profile?.notes.trim() ?? "",
      feedbackCount: profile ? feedbackCounts.get(profile.id) ?? 0 : 0,
      priceCount: profile ? priceCounts.get(profile.id) ?? 0 : 0,
    });
  }

  for (const extra of input.extraNames ?? []) {
    const name = vendorProfileName(extra.name);
    const nameKey = vendorNameKey(name);
    if (!nameKey || rows.has(nameKey)) continue;
    rows.set(nameKey, {
      nameKey,
      name,
      kind: extra.kind,
      qbId: null,
      profileId: null,
      internalNotes: "",
      feedbackCount: 0,
      priceCount: 0,
    });
  }

  for (const profile of profiles) {
    const existing = rows.get(profile.nameKey);
    if (existing) {
      existing.profileId = profile.id;
      existing.internalNotes = profile.notes.trim();
      existing.feedbackCount = feedbackCounts.get(profile.id) ?? 0;
      existing.priceCount = priceCounts.get(profile.id) ?? 0;
      continue;
    }
    rows.set(profile.nameKey, {
      nameKey: profile.nameKey,
      name: profile.name,
      kind: "trade",
      qbId: null,
      profileId: profile.id,
      internalNotes: profile.notes.trim(),
      feedbackCount: feedbackCounts.get(profile.id) ?? 0,
      priceCount: priceCounts.get(profile.id) ?? 0,
    });
  }

  return [...rows.values()].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export function collectVendorNames(input: {
  qbNames?: string[];
  profileNames?: string[];
  expenseNames?: string[];
  materialOrderNames?: string[];
  tradeNames?: string[];
}) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of [
    ...(input.qbNames ?? []),
    ...(input.profileNames ?? []),
    ...(input.expenseNames ?? []),
    ...(input.materialOrderNames ?? []),
    ...(input.tradeNames ?? []),
  ]) {
    const name = vendorProfileName(value);
    const key = vendorNameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}
