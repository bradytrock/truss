/** Toggle a catalog item in a multi-select picker. Order follows the order items were checked. */
export function toggleSelectedId(selectedIds: string[], id: string) {
  return selectedIds.includes(id)
    ? selectedIds.filter((item) => item !== id)
    : [...selectedIds, id];
}

/** Resolve checked ids against the catalog, skipping anything that disappeared. */
export function selectedCatalogItems<T extends { id: string }>(catalog: T[], selectedIds: string[]) {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  return selectedIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

/** Sequential sort orders after the current max, so a batch of lines stays in pick order. */
export function nextLineSortOrders(currentMax: number, count: number) {
  const start = Math.max(0, currentMax);
  return Array.from({ length: Math.max(0, count) }, (_, index) => start + index + 1);
}

export function addItemsLabel(count: number) {
  if (count <= 0) return "Add items";
  if (count === 1) return "Add 1 item";
  return `Add ${count} items`;
}

/** Typeahead matches for the estimate add row. Empty query returns the first page of the book. */
export function catalogItemsMatchingQuery<
  T extends { name: string; costCode?: string; description?: string },
>(items: T[], query: string, limit = 8) {
  const q = query.trim().toLowerCase();
  const matched = q
    ? items.filter((item) => {
        const name = item.name.toLowerCase();
        const code = (item.costCode ?? "").toLowerCase();
        const description = (item.description ?? "").toLowerCase();
        return name.includes(q) || code.includes(q) || description.includes(q);
      })
    : items;
  return matched.slice(0, Math.max(0, limit));
}
