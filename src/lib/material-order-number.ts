export function materialOrderPropertySlug(address: string) {
  const slug = address
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "Job";
}

export function nextMaterialOrderSequence(existing: string[]) {
  return (
    existing.reduce((current, value) => {
      const match = value.match(/(\d+)$/);
      return match ? Math.max(current, Number(match[1])) : current;
    }, 1000) + 1
  );
}

export function nextMaterialOrderNumber(input: { address?: string; existing: string[] }) {
  return `MO-${materialOrderPropertySlug(input.address ?? "")}-${nextMaterialOrderSequence(input.existing)}`;
}
