import type { CatalogItem, PriceList } from "@/lib/types";

export function isLivePriceList(list: PriceList) {
  return !list.outdatedAt;
}

/** Live lists first, then later effective date, then later created. */
export function comparePriceLists(a: PriceList, b: PriceList) {
  const aLive = isLivePriceList(a) ? 1 : 0;
  const bLive = isLivePriceList(b) ? 1 : 0;
  if (aLive !== bLive) return bLive - aLive;
  if (a.effectiveOn !== b.effectiveOn) return a.effectiveOn < b.effectiveOn ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id.localeCompare(b.id);
}

export function sortPriceLists(lists: PriceList[]) {
  return [...lists].sort(comparePriceLists);
}

export function currentPriceList(lists: PriceList[]) {
  const live = lists.filter(isLivePriceList);
  if (live.length === 0) return undefined;
  return sortPriceLists(live)[0];
}

export function isCurrentPriceList(list: PriceList, lists: PriceList[]) {
  return currentPriceList(lists)?.id === list.id;
}

/**
 * Items on this list. Rows with no list id count as the current list until
 * they are backfilled, so a book that predates dated lists still shows.
 */
export function catalogForList(
  catalog: CatalogItem[],
  lists: PriceList[],
  listId: string | null | undefined,
) {
  if (lists.length === 0) return catalog;
  const current = currentPriceList(lists);
  const targetId = listId ?? current?.id;
  if (!targetId) return [];
  return catalog.filter((item) => {
    if (item.priceListId === targetId) return true;
    if (!item.priceListId && current?.id === targetId) return true;
    return false;
  });
}

export function currentCatalog(catalog: CatalogItem[], lists: PriceList[]) {
  return catalogForList(catalog, lists, currentPriceList(lists)?.id);
}

export function copyCatalogItemToList(item: CatalogItem, priceListId: string): CatalogItem {
  return {
    ...item,
    id: crypto.randomUUID(),
    priceListId,
  };
}
