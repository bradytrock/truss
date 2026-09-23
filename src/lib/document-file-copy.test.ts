import assert from "node:assert/strict";
import { documentFileRelativePath, fileExtensionFromName } from "./document-file-copy.ts";

assert.equal(fileExtensionFromName("Warranty.pdf"), "pdf");
assert.equal(fileExtensionFromName("spec.DOCX"), "docx");
assert.equal(fileExtensionFromName("no-extension"), "bin");
assert.equal(fileExtensionFromName("weird.toolongextension"), "bin");
assert.equal(
  documentFileRelativePath("est-1", "file-1", "Product sheet.pdf"),
  "est-1/file-1.pdf",
);

console.log("document-file-copy.test.ts ok");
