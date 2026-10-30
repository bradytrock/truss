export const LIST_PAGE_SIZES = [50, 100, 250] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZES)[number];
export const DEFAULT_LIST_PAGE_SIZE: ListPageSize = 50;

export function parseListPageSize(value: unknown): ListPageSize {
  const size = typeof value === "string" ? Number(value) : value;
  return LIST_PAGE_SIZES.includes(size as ListPageSize) ? (size as ListPageSize) : DEFAULT_LIST_PAGE_SIZE;
}

export type ListPage<T> = {
  items: T[];
  /** 1-based, clamped into range. An empty list is page 1 of 1. */
  page: number;
  pageCount: number;
  /** 1-based inclusive bounds of this page within the whole list; 0–0 when empty. */
  from: number;
  to: number;
  total: number;
};

export function pageCountFor(total: number, size: number) {
  return Math.max(1, Math.ceil(total / Math.max(1, size)));
}

/** Which page an item at `index` (0-based) falls on. */
export function pageForIndex(index: number, size: number) {
  return Math.floor(Math.max(0, index) / Math.max(1, size)) + 1;
}

export function pageSlice<T>(items: T[], requestedPage: number, size: number): ListPage<T> {
  const total = items.length;
  const pageCount = pageCountFor(total, size);
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page,
    pageCount,
    from: slice.length ? start + 1 : 0,
    to: slice.length ? start + slice.length : 0,
    total,
  };
}
