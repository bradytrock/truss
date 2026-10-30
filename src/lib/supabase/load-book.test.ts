import assert from "node:assert/strict";
import { BOOK_PAGE_SIZE, isTransientRequestError, limitBookQuery, selectAllRows } from "./load-book.ts";

assert.equal(isTransientRequestError({ message: "TypeError: Failed to fetch" }), true);
assert.equal(isTransientRequestError({ message: "Could not find the table public.messages" }), false);
assert.equal(
  isTransientRequestError({
    code: "PGRST003",
    message: "Timed out acquiring connection from connection pool.",
  }),
  true,
);
assert.equal(isTransientRequestError(null), false);

async function main() {
  let active = 0;
  let max = 0;
  await Promise.all(
    Array.from({ length: 12 }, () =>
      limitBookQuery(async () => {
        active += 1;
        max = Math.max(max, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active -= 1;
        return true;
      }),
    ),
  );
  assert.equal(active, 0);
  assert.ok(max > 1 && max <= 4, `expected at most 4 book queries at once, saw ${max}`);

  // A table of 3,866 rows behind a server that caps every response at one page.
  function fakeTable(total: number, failOnPage = -1) {
    const rows = Array.from({ length: total }, (_, index) => ({ id: `c${index}` }));
    const ranges: Array<[number, number]> = [];
    const orders: string[] = [];
    const build = () => ({
      order: (column: "id") => {
        orders.push(column);
        return {
          range: (from: number, to: number) => {
            ranges.push([from, to]);
            if (ranges.length - 1 === failOnPage) {
              return Promise.resolve({ data: null, error: { message: "boom", code: "", details: "", hint: "", name: "" } });
            }
            return Promise.resolve({ data: rows.slice(from, Math.min(to, from + BOOK_PAGE_SIZE - 1) + 1), error: null });
          },
        };
      },
    });
    return { build, ranges, orders };
  }

  const big = fakeTable(3866);
  const all = await selectAllRows(big.build);
  assert.equal(all.error, null);
  assert.equal(all.data?.length, 3866);
  assert.equal(all.data?.[3865]?.id, "c3865");
  assert.deepEqual(big.ranges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
    [3000, 3999],
  ]);
  assert.ok(big.orders.every((column) => column === "id"), "pager adds an id tiebreak");

  const exact = fakeTable(2000);
  const exactAll = await selectAllRows(exact.build);
  assert.equal(exactAll.data?.length, 2000);
  assert.equal(exact.ranges.length, 3, "an exact multiple needs one short page to prove the end");

  const small = fakeTable(12);
  assert.equal((await selectAllRows(small.build)).data?.length, 12);
  assert.equal(small.ranges.length, 1);

  const empty = fakeTable(0);
  assert.deepEqual(await selectAllRows(empty.build), { data: [], error: null });

  const capped = fakeTable(5000);
  const cappedAll = await selectAllRows(capped.build, { max: 2000 });
  assert.equal(cappedAll.data?.length, 2000);
  assert.deepEqual(capped.ranges, [
    [0, 999],
    [1000, 1999],
  ]);

  const shortCap = fakeTable(5000);
  const shortCapAll = await selectAllRows(shortCap.build, { max: 500 });
  assert.equal(shortCapAll.data?.length, 500);
  assert.deepEqual(shortCap.ranges, [[0, 499]]);

  const broken = fakeTable(3000, 1);
  const brokenAll = await selectAllRows(broken.build);
  assert.equal(brokenAll.data, null);
  assert.equal(brokenAll.error?.message, "boom");
  assert.equal(broken.ranges.length, 2, "stops at the failed page");

  console.log("load-book.test.ts ok");
}

void main();
