import assert from "node:assert/strict";
import { overlayById, replaceIfEmpty } from "./book-merge.ts";

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

console.log("book-merge.test.ts ok");
