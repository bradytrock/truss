import assert from "node:assert/strict";
import { overlayById, preferIdList, preferRows, replaceIfEmpty } from "./book-merge.ts";

assert.deepEqual(
  overlayById([{ id: "local" }], [{ id: "server" }, { id: "local" }]).map((item) => item.id),
  ["local", "server"],
);
assert.deepEqual(
  overlayById([], [{ id: "server" }]).map((item) => item.id),
  ["server"],
);
assert.deepEqual(
  overlayById([{ id: "local" }], []).map((item) => item.id),
  ["local"],
);
assert.deepEqual(replaceIfEmpty([], [{ owner: "a" }]), [{ owner: "a" }]);
assert.deepEqual(replaceIfEmpty([{ owner: "local" }], [{ owner: "server" }]), [{ owner: "local" }]);

const dirty = new Set(["line-1"]);
assert.deepEqual(
  preferIdList(
    [
      { id: "line-1", quantity: 1 },
      { id: "line-2", quantity: 2 },
    ],
    [
      { id: "line-1", quantity: 9 },
      { id: "line-2", quantity: 2 },
    ],
    dirty,
  ),
  [
    { id: "line-1", quantity: 9 },
    { id: "line-2", quantity: 2 },
  ],
);
assert.deepEqual(
  preferIdList([{ id: "line-1", quantity: 1 }], [], dirty).map((item) => item.id),
  [],
);
assert.deepEqual(
  preferIdList([], [{ id: "line-1", quantity: 9 }], dirty).map((item) => item.id),
  ["line-1"],
);

const merged = preferRows(
  {
    estimateLines: [{ id: "line-1", quantity: 1 }],
    notes: "server",
  },
  {
    estimateLines: [{ id: "line-1", quantity: 9 }],
    notes: "local",
  },
  ["line-1"],
);
assert.equal(merged.estimateLines[0]?.quantity, 9);
assert.equal(merged.notes, "server");
const untouched = { estimateLines: [{ id: "a", n: 1 }] };
assert.equal(preferRows(untouched, { estimateLines: [{ id: "a", n: 2 }] }, []), untouched);

console.log("book-merge.test.ts ok");
