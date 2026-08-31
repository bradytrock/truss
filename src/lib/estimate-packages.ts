export const ESTIMATE_PACKAGES = ["good", "better", "best"] as const;
export type EstimatePackage = (typeof ESTIMATE_PACKAGES)[number];

export const ESTIMATE_PACKAGE_MODES = ["", "gbb"] as const;
export type EstimatePackageMode = (typeof ESTIMATE_PACKAGE_MODES)[number];

export type LinePackage = EstimatePackage | "";

export const PACKAGE_LABEL: Record<EstimatePackage, string> = {
  good: "Good",
  better: "Better",
  best: "Best",
};

export const PACKAGE_BLURB: Record<EstimatePackage, string> = {
  good: "Solid, code-compliant work with proven materials.",
  better: "The most popular pick — upgraded materials and finish.",
  best: "Premium materials and the longest-lasting result.",
};

export function parseEstimatePackageMode(value: string | null | undefined): EstimatePackageMode {
  return value === "gbb" ? "gbb" : "";
}

export function parseEstimatePackage(value: string | null | undefined): EstimatePackage {
  return value === "good" || value === "best" ? value : "better";
}

export function parseLinePackage(value: string | null | undefined): LinePackage {
  return value === "good" || value === "better" || value === "best" ? value : "";
}

export function isGbbEstimate(estimate: { packageMode?: string | null }): boolean {
  return estimate.packageMode === "gbb";
}

export function lineInPackage(line: { package?: string | null }, pkg: EstimatePackage): boolean {
  const assigned = parseLinePackage(line.package);
  return assigned === "" || assigned === pkg;
}

export function scopedEstimateLines<T extends { package?: string | null }>(
  estimate: { packageMode?: string | null; selectedPackage?: string | null },
  lines: T[],
): T[] {
  if (!isGbbEstimate(estimate)) return lines;
  const pkg = parseEstimatePackage(estimate.selectedPackage);
  return lines.filter((line) => lineInPackage(line, pkg));
}

export function linePackageSelectValue(value: string | null | undefined): "all" | EstimatePackage {
  const parsed = parseLinePackage(value);
  return parsed || "all";
}

export function linePackageFromSelect(value: string | null | undefined): LinePackage {
  return parseLinePackage(value);
}
