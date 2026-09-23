export const ESTIMATE_PACKAGES = ["good", "better", "best"] as const;
export type ClassicPackage = (typeof ESTIMATE_PACKAGES)[number];
/** Selected option key. Classic books used good / better / best; new books use opt_1, opt_2, … */
export type EstimatePackage = string;

export const ESTIMATE_PACKAGE_MODES = ["", "gbb"] as const;
export type EstimatePackageMode = (typeof ESTIMATE_PACKAGE_MODES)[number];

export type LinePackage = string;

export type EstimateOption = {
  key: string;
  name: string;
};

export const PACKAGE_LABEL: Record<ClassicPackage, string> = {
  good: "Good",
  better: "Better",
  best: "Best",
};

export const PACKAGE_BLURB: Record<ClassicPackage, string> = {
  good: "Solid, code-compliant work with proven materials.",
  better: "The most popular pick — upgraded materials and finish.",
  best: "Premium materials and the longest-lasting result.",
};

export function parseEstimatePackageMode(value: string | null | undefined): EstimatePackageMode {
  return value === "gbb" ? "gbb" : "";
}

export function parseEstimatePackage(value: string | null | undefined): EstimatePackage {
  return (value ?? "").trim();
}

export function parseLinePackage(value: string | null | undefined): LinePackage {
  return (value ?? "").trim();
}

export function isGbbEstimate(estimate: { packageMode?: string | null }): boolean {
  return estimate.packageMode === "gbb";
}

export function isClassicPackage(value: string | null | undefined): value is ClassicPackage {
  return value === "good" || value === "better" || value === "best";
}

export function optionLabel(key: string, fallbackName?: string | null) {
  if (isClassicPackage(key)) return PACKAGE_LABEL[key];
  const name = fallbackName?.trim();
  return name || "Option";
}

export function optionBlurb(key: string) {
  if (isClassicPackage(key)) return PACKAGE_BLURB[key];
  return "This option plus the shared work on the proposal.";
}

export function sharedPackageLines<T extends { package?: string | null }>(lines: T[]): T[] {
  return lines.filter((line) => parseLinePackage(line.package) === "");
}

export function uniquePackageLines<T extends { package?: string | null }>(
  lines: T[],
  pkg: string,
): T[] {
  const key = parseLinePackage(pkg);
  if (!key) return [];
  return lines.filter((line) => parseLinePackage(line.package) === key);
}

export type GbbPrintSection<T> = {
  kind: "shared" | "option";
  key: string;
  name: string;
  lines: T[];
};

/** One document: shared work once, then every option as its own section. */
export function gbbPrintSections<T extends { package?: string | null; groupName?: string | null }>(
  lines: T[],
): GbbPrintSection<T>[] {
  const options = listEstimateOptions(lines);
  const shared = sharedPackageLines(lines);
  const sections: GbbPrintSection<T>[] = [];
  if (shared.length) {
    sections.push({
      kind: "shared",
      key: "",
      name: options.length ? "Included in every option" : "",
      lines: shared,
    });
  }
  for (const option of options) {
    sections.push({
      kind: "option",
      key: option.key,
      name: option.name,
      lines: uniquePackageLines(lines, option.key),
    });
  }
  return sections;
}

export function optionHighlightLabels(
  lines: Array<{ package?: string | null; title?: string | null; description?: string | null }>,
  pkg: string,
  limit = 4,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of uniquePackageLines(lines, pkg)) {
    const title = String(line.title ?? "").trim();
    const fromDescription = String(line.description ?? "")
      .replace(/<[^>]+>/g, " ")
      .split(/\r?\n/)
      .map((part) => part.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim())
      .find(Boolean);
    const label = title || fromDescription || "";
    const dedupe = label.toLowerCase();
    if (!label || seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

/** Better if present, otherwise the middle of three options. */
export function recommendedOptionKey(options: Array<{ key: string }>): string | null {
  if (options.length < 2) return null;
  const better = options.find((item) => item.key === "better");
  if (better) return better.key;
  if (options.length >= 3) return options[1]?.key ?? null;
  return null;
}

export function cheapestOptionKey(
  options: Array<{ key: string }>,
  totalFor: (key: string) => number,
): string | null {
  if (options.length === 0) return null;
  return options.reduce((best, item) => (totalFor(item.key) < totalFor(best.key) ? item : best)).key;
}

export function listEstimateOptions(
  lines: Array<{ package?: string | null; groupName?: string | null }>,
  pending: EstimateOption[] = [],
): EstimateOption[] {
  const out: EstimateOption[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = parseLinePackage(line.package);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name: optionLabel(key, line.groupName) });
  }
  for (const item of pending) {
    const key = parseLinePackage(item.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name: item.name.trim() || optionLabel(key) });
  }
  return out;
}

export function optionKeyForGroup(
  groupName: string,
  lines: Array<{ package?: string | null; groupName?: string | null }>,
  pending: EstimateOption[] = [],
) {
  const pendingHit = pending.find((item) => item.name === groupName);
  if (pendingHit) return parseLinePackage(pendingHit.key);
  const inGroup = lines.filter((line) => (line.groupName?.trim() || "Items") === groupName);
  const keys = [
    ...new Set(inGroup.map((line) => parseLinePackage(line.package)).filter(Boolean)),
  ];
  return keys.length === 1 ? keys[0]! : "";
}

export function groupHasMixedPackages(
  lines: Array<{ package?: string | null }>,
) {
  return new Set(lines.map((line) => parseLinePackage(line.package))).size > 1;
}

export function nextOptionKey(existing: Array<string | null | undefined>) {
  const used = new Set(existing.map((value) => parseLinePackage(value)).filter(Boolean));
  let n = 1;
  while (used.has(`opt_${n}`)) n += 1;
  return `opt_${n}`;
}

export function nextOptionName(existingNames: string[]) {
  const used = new Set(existingNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  let n = 1;
  while (used.has(`option ${n}`)) n += 1;
  return `Option ${n}`;
}

/** Prefer unused Good / Better / Best keys, then opt_n. */
export function nextClassicOrOptionKey(existing: Array<string | null | undefined>) {
  const used = new Set(existing.map((value) => parseLinePackage(value)).filter(Boolean));
  for (const key of ESTIMATE_PACKAGES) {
    if (!used.has(key)) return key;
  }
  return nextOptionKey(existing);
}

export function optionNameForKey(key: string, existingNames: string[]) {
  if (isClassicPackage(key)) return PACKAGE_LABEL[key];
  return nextOptionName(existingNames);
}

/** Empty Good / Better / Best sections still missing from a GBB template. */
export function pendingClassicPackages(
  lines: Array<{ package?: string | null; groupName?: string | null }>,
  pending: EstimateOption[] = [],
): EstimateOption[] {
  const existing = new Set(listEstimateOptions(lines, pending).map((item) => item.key));
  return ESTIMATE_PACKAGES.filter((key) => !existing.has(key)).map((key) => ({
    key,
    name: PACKAGE_LABEL[key],
  }));
}

export function resolveSelectedPackage(
  estimate: { selectedPackage?: string | null },
  lines: Array<{ package?: string | null; groupName?: string | null }>,
  pending: EstimateOption[] = [],
) {
  const selected = parseEstimatePackage(estimate.selectedPackage);
  const options = listEstimateOptions(lines, pending);
  if (selected && options.some((item) => item.key === selected)) return selected;
  if (selected && options.length === 0) return selected;
  return options[0]?.key || selected || "better";
}

export function lineInPackage(line: { package?: string | null }, pkg: EstimatePackage): boolean {
  const assigned = parseLinePackage(line.package);
  return assigned === "" || assigned === pkg;
}

export function scopedEstimateLines<T extends { package?: string | null; groupName?: string | null }>(
  estimate: { packageMode?: string | null; selectedPackage?: string | null },
  lines: T[],
): T[] {
  if (!isGbbEstimate(estimate)) return lines;
  const pkg = resolveSelectedPackage(estimate, lines);
  return lines.filter((line) => lineInPackage(line, pkg));
}

export function linePackageSelectValue(value: string | null | undefined): "all" | EstimatePackage {
  return parseLinePackage(value) || "all";
}

export function linePackageFromSelect(value: string | null | undefined): LinePackage {
  return value === "all" ? "" : parseLinePackage(value);
}
