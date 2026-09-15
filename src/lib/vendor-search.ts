export const VENDOR_SEARCH_MIN = 4;

export function vendorSearchNeedle(query: string) {
  return query.trim().toLowerCase();
}

export function canSearchVendors(query: string) {
  return vendorSearchNeedle(query).length >= VENDOR_SEARCH_MIN;
}

export function filterVendorNames<T extends { name: string }>(items: T[], query: string): T[] {
  if (!canSearchVendors(query)) return [];
  const needle = vendorSearchNeedle(query);
  return items.filter((item) => item.name.toLowerCase().includes(needle));
}
