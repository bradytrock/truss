import assert from "node:assert/strict";
import { pageCountFor, pageForIndex, pageSlice, parseListPageSize } from "./paging.ts";

const items = Array.from({ length: 3866 }, (_, i) => i);

assert.deepEqual(
  (({ page, pageCount, from, to, total, items: slice }) => ({ page, pageCount, from, to, total, len: slice.length }))(
    pageSlice(items, 1, 50),
  ),
  { page: 1, pageCount: 78, from: 1, to: 50, total: 3866, len: 50 },
);

const last = pageSlice(items, 78, 50);
assert.equal(last.from, 3851);
assert.equal(last.to, 3866);
assert.equal(last.items.length, 16);
assert.equal(last.items[0], 3850);

assert.equal(pageSlice(items, 999, 50).page, 78, "past the end clamps to the last page");
assert.equal(pageSlice(items, 0, 50).page, 1, "page 0 clamps to 1");
assert.equal(pageSlice(items, -4, 50).page, 1);
assert.equal(pageSlice(items, Number.NaN, 50).page, 1);
assert.equal(pageSlice(items, 2.7, 100).page, 2, "fractional pages floor");

assert.deepEqual(pageSlice([], 3, 50), { items: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });

assert.equal(pageSlice(items, 1, 250).items.length, 250);
assert.equal(pageCountFor(3866, 250), 16);
assert.equal(pageCountFor(250, 250), 1);
assert.equal(pageCountFor(251, 250), 2);
assert.equal(pageCountFor(0, 50), 1);

assert.equal(pageForIndex(0, 50), 1);
assert.equal(pageForIndex(49, 50), 1);
assert.equal(pageForIndex(50, 50), 2);
assert.equal(pageForIndex(3865, 50), 78);

assert.equal(parseListPageSize("100"), 100);
assert.equal(parseListPageSize(250), 250);
assert.equal(parseListPageSize("75"), 50, "unknown sizes fall back to the default");
assert.equal(parseListPageSize(null), 50);

console.log("paging.test.ts ok");
