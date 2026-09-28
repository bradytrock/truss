import assert from "node:assert/strict";
import {
  ANTHROPIC_RECEIPT_MODELS,
  anthropicFileBlock,
  anthropicReceiptBody,
  anthropicUserError,
  explainReceiptFailure,
  isReceiptUpload,
  parseReceiptDataUrl,
  shouldRetryAnthropicModel,
} from "./receipt-extract.ts";

const jpeg = parseReceiptDataUrl("data:image/jpeg;base64,QUJD");
assert.equal(jpeg.ok && jpeg.kind, "image");
assert.equal(jpeg.ok && jpeg.mediaType, "image/jpeg");

const jpg = parseReceiptDataUrl("data:image/jpg;charset=utf-8;base64,QUJD");
assert.equal(jpg.ok && jpg.mediaType, "image/jpeg");

const pdf = parseReceiptDataUrl("data:application/pdf;base64,JVBERg==");
assert.equal(pdf.ok && pdf.kind, "pdf");
if (pdf.ok && pdf.kind === "pdf") {
  assert.deepEqual(anthropicFileBlock(pdf), {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: "JVBERg==" },
  });
}

assert.equal(parseReceiptDataUrl("data:image/heic;base64,QUJD").ok, false);
assert.equal(parseReceiptDataUrl("data:text/plain;base64,QUJD").ok, false);

assert.equal(ANTHROPIC_RECEIPT_MODELS.includes("claude-sonnet-4-20250514" as never), false);
assert.equal(ANTHROPIC_RECEIPT_MODELS[0], "claude-sonnet-4-6");

if (jpeg.ok) {
  const body = anthropicReceiptBody(ANTHROPIC_RECEIPT_MODELS[0], "Read this receipt.", jpeg);
  assert.equal(body.model, "claude-sonnet-4-6");
  assert.equal("thinking" in body, false);
  const content = (body.messages as Array<{ content: Array<{ type: string }> }>)[0].content;
  assert.deepEqual(
    content.map((part) => part.type),
    ["text", "image"],
  );
  const fallback = anthropicReceiptBody("claude-sonnet-5", "Read this receipt.", jpeg);
  assert.deepEqual(fallback.thinking, { type: "disabled" });
}

assert.equal(shouldRetryAnthropicModel(404, "model not found"), true);
assert.equal(shouldRetryAnthropicModel(400, "model claude-sonnet-4-20250514 was retired"), true);
assert.equal(shouldRetryAnthropicModel(401, "invalid x-api-key"), false);
assert.match(anthropicUserError(401, "authentication_error"), /ANTHROPIC_API_KEY/);

assert.match(
  explainReceiptFailure(
    { ok: false, error: "OpenAI could not read that photo.", missingKey: false },
    { ok: false, error: "Anthropic could not read that file.", missingKey: false },
  ),
  /^Anthropic could not read that file/,
);
assert.match(
  explainReceiptFailure(
    { ok: false, error: "OPENAI_API_KEY is not set on this host.", missingKey: true },
    { ok: false, error: "ANTHROPIC_API_KEY is not set on this host.", missingKey: true },
  ),
  /No AI key/,
);

assert.equal(isReceiptUpload({ type: "image/jpeg", name: "slip.jpg" }), true);
assert.equal(isReceiptUpload({ type: "application/pdf", name: "invoice.pdf" }), true);
assert.equal(isReceiptUpload({ type: "", name: "scan.PDF" }), true);
assert.equal(isReceiptUpload({ type: "text/plain", name: "notes.txt" }), false);
