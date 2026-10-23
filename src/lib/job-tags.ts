import { uniqueNames } from "@/lib/job-record";

/** Shown until a company has used its own wording. */
export const STARTER_JOB_TAGS = [
  "hail",
  "insurance",
  "roof",
  "restoration",
  "remodel",
  "referral",
  "water",
  "fire",
  "siding",
  "punch",
  "basement",
  "kitchen",
  "addition",
  "permit",
  "storm",
  "on hold",
] as const;

export function normalizeJobTag(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/** Tags already used on jobs, most common first, then starter tags nobody has used yet. */
export function jobTagSuggestions(used: readonly (readonly string[])[]) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const tags of used) {
    const seen = new Set<string>();
    for (const raw of tags) {
      const label = normalizeJobTag(raw);
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { label, count: 1 });
    }
  }
  const ranked = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((item) => item.label);
  return uniqueNames([...ranked, ...STARTER_JOB_TAGS]);
}

export function availableJobTags(suggestions: readonly string[], current: readonly string[]) {
  const taken = new Set(current.map((tag) => normalizeJobTag(tag).toLowerCase()).filter(Boolean));
  return suggestions.filter((tag) => !taken.has(tag.toLowerCase()));
}

export function filterJobTags(tags: readonly string[], query: string) {
  const needle = normalizeJobTag(query).toLowerCase();
  if (!needle) return [...tags];
  return tags.filter((tag) => tag.toLowerCase().includes(needle));
}

/** The typed tag, when it is not already a suggestion or already on the job. */
export function customJobTag(query: string, existing: readonly string[]) {
  const value = normalizeJobTag(query);
  if (!value) return null;
  const needle = value.toLowerCase();
  if (existing.some((tag) => normalizeJobTag(tag).toLowerCase() === needle)) return null;
  return value;
}
