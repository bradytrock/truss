import assert from "node:assert/strict";
import { archivedPaper, archiveStamp, isArchivedPaper, livePaper } from "./paper-archive.ts";

assert.equal(isArchivedPaper(null), false);
assert.equal(isArchivedPaper({}), false);
assert.equal(isArchivedPaper({ archivedAt: null }), false);
assert.equal(isArchivedPaper({ archivedAt: "2026-09-16T12:00:00.000Z" }), true);

const docs = [
  { id: "live", archivedAt: null },
  { id: "gone", archivedAt: "2026-09-16T12:00:00.000Z" },
];
assert.deepEqual(livePaper(docs).map((item) => item.id), ["live"]);
assert.deepEqual(archivedPaper(docs).map((item) => item.id), ["gone"]);
assert.match(archiveStamp(new Date("2026-09-16T12:00:00.000Z")), /^2026-09-16T12:00:00/);

console.log("paper-archive tests passed");
