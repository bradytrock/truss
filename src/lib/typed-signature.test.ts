import assert from "node:assert/strict";
import { SIGNATURE_MAX_CHARS } from "./estimate-signature.ts";
import {
  TYPED_SIGNATURE_MAX_CHARS,
  TYPED_SIGNATURE_PNG_MAX,
  desktopCanTypeSignature,
  fitTypedSignatureFontSize,
  normalizeTypedSignature,
} from "./typed-signature.ts";

assert.equal(TYPED_SIGNATURE_PNG_MAX, SIGNATURE_MAX_CHARS);

assert.equal(
  desktopCanTypeSignature({
    finePointer: true,
    hover: true,
    coarsePointer: false,
    wide: true,
    touchPoints: 0,
  }),
  true,
);
assert.equal(
  desktopCanTypeSignature({
    finePointer: true,
    hover: true,
    coarsePointer: false,
    wide: false,
    touchPoints: 0,
  }),
  true,
);
assert.equal(
  desktopCanTypeSignature({
    finePointer: false,
    hover: false,
    coarsePointer: true,
    wide: true,
    touchPoints: 5,
  }),
  false,
);
assert.equal(
  desktopCanTypeSignature({
    finePointer: false,
    hover: false,
    coarsePointer: false,
    wide: true,
    touchPoints: 0,
  }),
  true,
);
assert.equal(
  desktopCanTypeSignature({
    finePointer: false,
    hover: false,
    coarsePointer: false,
    wide: false,
    touchPoints: 0,
  }),
  false,
);

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
