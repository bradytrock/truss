import assert from "node:assert/strict";
import {
  companyFileSearchText,
  companyFilesList,
  fillCompanyFile,
  parseCompanyFileCategory,
} from "./company-files.ts";

assert.equal(parseCompanyFileCategory("Warranty"), "warranty");
assert.equal(parseCompanyFileCategory("nope"), "other");
assert.equal(parseCompanyFileCategory(null), "other");

const filled = fillCompanyFile({
  id: "f1",
  name: null as unknown as string,
  category: "legacy" as never,
  mimeType: undefined as unknown as string,
  notes: undefined as unknown as string,
});
assert.equal(filled.name, "Untitled");
assert.equal(filled.category, "other");
assert.equal(filled.mimeType, "application/octet-stream");
assert.equal(filled.notes, "");

const listed = companyFilesList([
  { id: "a", name: "Warranty.pdf", category: "warranty", createdAt: null },
  { id: "b", createdAt: "2026-01-02" },
  null,
  { name: "missing-id" },
]);
assert.equal(listed.length, 2);
assert.equal(listed[0]?.name, "Warranty.pdf");
assert.equal(listed[1]?.name, "Untitled");
const newestFirst = [...listed].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
assert.equal(newestFirst[0]?.id, "b");
assert.ok(companyFileSearchText(filled).includes("untitled"));

console.log("company-files.test.ts ok");
