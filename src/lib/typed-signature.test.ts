import assert from "node:assert/strict";
import { SIGNATURE_MAX_CHARS } from "./estimate-signature.ts";
import {
  DESKTOP_TYPE_SIGNATURE_QUERY,
  TYPED_SIGNATURE_MAX_CHARS,
  TYPED_SIGNATURE_PNG_MAX,
  fitTypedSignatureFontSize,
  normalizeTypedSignature,
} from "./typed-signature.ts";

assert.equal(TYPED_SIGNATURE_PNG_MAX, SIGNATURE_MAX_CHARS);

assert.match(DESKTOP_TYPE_SIGNATURE_QUERY, /hover:\s*hover/);
assert.match(DESKTOP_TYPE_SIGNATURE_QUERY, /pointer:\s*fine/);
assert.match(DESKTOP_TYPE_SIGNATURE_QUERY, /min-width:\s*1024px/);

assert.equal(normalizeTypedSignature("  Ada   Lovelace \n"), "Ada Lovelace");
assert.equal(normalizeTypedSignature("A"), "A");
assert.equal(normalizeTypedSignature("   "), "");
assert.equal(normalizeTypedSignature("x".repeat(120)).length, TYPED_SIGNATURE_MAX_CHARS);

assert.equal(
  fitTypedSignatureFontSize(200, (size) => size * 4),
  50,
);
assert.equal(
  fitTypedSignatureFontSize(40, () => 10, 30, 18),
  30,
);
assert.equal(
  fitTypedSignatureFontSize(10, () => 100, 40, 18),
  18,
);
