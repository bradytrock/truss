import assert from "node:assert/strict";
import {
  editorHtmlToStorage,
  firstPlainLine,
  invoiceLineDescription,
  linePlainText,
  proposalLineSummary,
  lineTextToSafeHtml,
  parseLineFormat,
  shouldShowLineDescription,
} from "./line-format.ts";

const markdown = parseLineFormat(
  "A **TAMKO Heritage** system.\n- Tear-off to the deck\n- Synthetic underlayment\n- Hip and ridge",
);
assert.equal(markdown[0]?.type, "p");
assert.deepEqual(markdown[0]?.runs, [
  { text: "A " },
  { text: "TAMKO Heritage", bold: true },
  { text: " system." },
]);
assert.equal(markdown.filter((block) => block.type === "li").length, 3);

const html = lineTextToSafeHtml(
  "A **TAMKO Heritage** system.\n- Tear-off to the deck\n- Synthetic underlayment",
);
assert.match(html, /<strong>TAMKO Heritage<\/strong>/);
assert.match(html, /<ul><li>Tear-off to the deck<\/li><li>Synthetic underlayment<\/li><\/ul>/);
assert.doesNotMatch(html, /<script/i);

const pasted = lineTextToSafeHtml(
  `<p>A <b>complete system</b></p><ul><li>Ice and water</li><li onclick="alert(1)">Ridge vent</li></ul><script>alert(1)</script>`,
);
assert.match(pasted, /<strong>complete system<\/strong>/);
assert.match(pasted, /<ul><li>Ice and water<\/li><li>Ridge vent<\/li><\/ul>/);
assert.doesNotMatch(pasted, /onclick|script/i);

assert.equal(editorHtmlToStorage("<p>Keep the <b>attic</b> dry</p><ul><li>New pipe boots</li></ul>"), [
  "Keep the **attic** dry",
  "- New pipe boots",
].join("\n"));

assert.equal(linePlainText("**Bold** roof\n- One\n- Two"), "Bold roof\nOne\nTwo");
assert.equal(firstPlainLine("Roofing System\n- One"), "Roofing System");

assert.equal(
  shouldShowLineDescription({ title: "Roofing System", description: "Roofing System" }),
  false,
);
assert.equal(
  shouldShowLineDescription({
    title: "Roofing System",
    description: "A **TAMKO Heritage** system.\n- Tear-off",
  }),
  true,
);

assert.equal(
  invoiceLineDescription({
    title: "Roofing System",
    description: "- Tear-off\n- Underlayment",
  }),
  "Roofing System\n\n- Tear-off\n- Underlayment",
);

assert.equal(
  proposalLineSummary({ title: "Architectural shingles", quantity: 32, unit: "sq" }),
  "Architectural shingles · 32 sq",
);
assert.equal(
  proposalLineSummary({ title: "Tear-off & disposal", quantity: 1, unit: "LS" }),
  "Tear-off & disposal",
);
assert.equal(
  proposalLineSummary({ title: "Ridge vent", quantity: 38.5, unit: "ft" }),
  "Ridge vent · 38.5 ft",
);

console.log("line-format tests passed");
