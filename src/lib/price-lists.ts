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

export function priceListSupplierKey(vendor: string | null | undefined) {
  return (vendor ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function priceListSupplierName(vendor: string | null | undefined) {
  return (vendor ?? "").trim().replace(/\s+/g, " ");
}

/** Lists filed under this supplier. An empty name is the company book. */
export function priceListsForSupplier(lists: PriceList[], vendor: string | null | undefined) {
  const key = priceListSupplierKey(vendor);
  return lists.filter((list) => priceListSupplierKey(list.vendor) === key);
}

export function currentPriceList(lists: PriceList[]) {
  const live = lists.filter(isLivePriceList);
  if (live.length === 0) return undefined;
  return sortPriceLists(live)[0];
}

/** Newest live list for each supplier, including the company book. */
export function currentPriceLists(lists: PriceList[]) {
  const groups = new Map<string, PriceList[]>();
  for (const list of lists) {
    const key = priceListSupplierKey(list.vendor);
    const group = groups.get(key) ?? [];
    group.push(list);
    groups.set(key, group);
  }
  const current: PriceList[] = [];
  for (const group of groups.values()) {
    const list = currentPriceList(group);
    if (list) current.push(list);
  }
  return sortPriceLists(current);
}

export function isCurrentPriceList(list: PriceList, lists: PriceList[]) {
  return currentPriceList(priceListsForSupplier(lists, list.vendor))?.id === list.id;
}

/** Live lists a new book for this supplier replaces. Other suppliers stay current. */
export function listsReplacedByNewBook(lists: PriceList[], vendor: string | null | undefined) {
  return priceListsForSupplier(lists, vendor).filter(isLivePriceList);
}

/**
 * Supply lists to show while ordering from this supplier.
 * That supplier's own lists win. Until they have one, the company book still applies.
 */
export function orderSupplyLists(lists: PriceList[], vendor: string | null | undefined) {
  if (!priceListSupplierKey(vendor)) return [];
  const dedicated = priceListsForSupplier(lists, vendor);
  if (dedicated.length > 0) return sortPriceLists(dedicated);
  return sortPriceLists(priceListsForSupplier(lists, ""));
}

export function orderUsesCompanyBook(lists: PriceList[], vendor: string | null | undefined) {
  if (!priceListSupplierKey(vendor)) return false;
  return (
    priceListsForSupplier(lists, vendor).length === 0 && priceListsForSupplier(lists, "").length > 0
  );
}

/**
 * Items on this list. Rows with no list id count as the current company book
 * until they are backfilled, so a book that predates dated lists still shows.
 */
export function catalogForList(
  catalog: CatalogItem[],
  lists: PriceList[],
  listId: string | null | undefined,
) {
  if (lists.length === 0) return catalog;
  const companyCurrent = currentPriceList(priceListsForSupplier(lists, ""));
  const targetId = listId ?? companyCurrent?.id ?? currentPriceList(lists)?.id;
  if (!targetId) return [];
  return catalog.filter((item) => {
    if (item.priceListId === targetId) return true;
    if (!item.priceListId && companyCurrent?.id === targetId) return true;
    return false;
  });
}

/** Every supplier's current book. Estimators price a job from all of them. */
export function currentCatalog(catalog: CatalogItem[], lists: PriceList[]) {
  if (lists.length === 0) return catalog;
  const currents = currentPriceLists(lists);
  if (currents.length === 0) return [];
  const ids = new Set(currents.map((list) => list.id));
  const companyCurrentId = currentPriceList(priceListsForSupplier(lists, ""))?.id ?? null;
  return catalog.filter((item) => {
    if (item.priceListId && ids.has(item.priceListId)) return true;
    if (!item.priceListId && companyCurrentId && ids.has(companyCurrentId)) return true;
    return false;
  });
}

/** Items on the supply list selected for this order. */
export function catalogForOrder(
  catalog: CatalogItem[],
  lists: PriceList[],
  vendor: string | null | undefined,
  listId?: string | null,
) {
  const supply = orderSupplyLists(lists, vendor);
  if (supply.length === 0) return [];
  const target =
    listId && supply.some((list) => list.id === listId)
      ? listId
      : (currentPriceList(supply)?.id ?? supply[0]?.id);
  if (!target) return [];
  return catalogForList(catalog, lists, target);
}

export function copyCatalogItemToList(item: CatalogItem, priceListId: string): CatalogItem {
  return {
    ...item,
    id: crypto.randomUUID(),
    priceListId,
  };
}
