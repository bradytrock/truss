import assert from "node:assert/strict";
import {
  COOKIE_SECTIONS,
  LEGAL_PAGES,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  isLegalPath,
} from "./legal.ts";

assert.deepEqual(
  LEGAL_PAGES.map((page) => page.href),
  ["/privacy", "/terms", "/cookies"],
);

for (const page of LEGAL_PAGES) {
  assert.equal(isLegalPath(page.href), true);
  assert.equal(isLegalPath(`${page.href}/`), true);
  assert.equal(isLegalPath(page.href.toUpperCase()), true);
}

assert.equal(isLegalPath("/login"), false);
assert.equal(isLegalPath("/privacy/extra"), true);
assert.equal(isLegalPath("/jobs"), false);

assert.ok(PRIVACY_SECTIONS.some((section) => /collect/i.test(section.heading)));
assert.ok(TERMS_SECTIONS.some((section) => /job book/i.test(section.heading)));
assert.ok(COOKIE_SECTIONS.some((section) => /sign-in/i.test(section.heading)));

console.log("legal.test.ts ok");
