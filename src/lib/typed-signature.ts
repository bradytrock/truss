/** Matches SIGNATURE_MAX_CHARS in estimate-signature.ts. A typed mark is stored as the same PNG. */
export const TYPED_SIGNATURE_PNG_MAX = 180_000;

/** Mouse and trackpad computers. Phones and tablets stay on the drawing pad. */
export const DESKTOP_TYPE_SIGNATURE_QUERY =
  "(hover: hover) and (pointer: fine) and (min-width: 1024px)";

export const TYPED_SIGNATURE_MAX_CHARS = 80;

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 220;
const CANVAS_PAD_X = 28;

export function normalizeTypedSignature(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, TYPED_SIGNATURE_MAX_CHARS);
}

export function fitTypedSignatureFontSize(
  maxWidth: number,
  measure: (size: number) => number,
  start = 96,
  min = 18,
) {
  let size = start;
  while (size > min && measure(size) > maxWidth) size -= 2;
  return size;
}

function scriptFontStack() {
  if (typeof document === "undefined") return '"Great Vibes", cursive';
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--font-great-vibes").trim();
  if (!raw) return '"Great Vibes", cursive';
  return `${raw}, "Great Vibes", cursive`;
}

function firstFontFamily(stack: string) {
  const first = stack.split(",")[0]?.trim() ?? "";
  return first.replace(/^["']+|["']+$/g, "");
}

async function ensureScriptFont(stack: string) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const family = firstFontFamily(stack);
  if (!family) return;
  try {
    await document.fonts.load(`96px "${family}"`);
    await document.fonts.ready;
  } catch {
    // The canvas falls through to the next family in the stack.
  }
}

export async function renderTypedSignaturePng(value: string): Promise<string | null> {
  const text = normalizeTypedSignature(value);
  if (text.length < 2 || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const dpr = 2;
  canvas.width = CANVAS_WIDTH * dpr;
  canvas.height = CANVAS_HEIGHT * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const stack = scriptFontStack();
  await ensureScriptFont(stack);
  const maxWidth = CANVAS_WIDTH - CANVAS_PAD_X * 2;
  const size = fitTypedSignatureFontSize(maxWidth, (px) => {
    ctx.font = `${px}px ${stack}`;
    return ctx.measureText(text).width;
  });
  ctx.font = `${size}px ${stack}`;
  ctx.fillStyle = "#1c1c1c";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || size * 0.8;
  const descent = metrics.actualBoundingBoxDescent || size * 0.25;
  const y = (CANVAS_HEIGHT - (ascent + descent)) / 2 + ascent;
  const measured = metrics.width;
  if (measured > maxWidth && measured > 0) {
    ctx.translate(CANVAS_PAD_X, y);
    ctx.scale(maxWidth / measured, maxWidth / measured);
    ctx.fillText(text, 0, 0);
  } else {
    ctx.fillText(text, CANVAS_PAD_X, y);
  }
  const url = canvas.toDataURL("image/png");
  if (!url.startsWith("data:image/png;base64,") || url.length < 100 || url.length > TYPED_SIGNATURE_PNG_MAX) {
    return null;
  }
  return url;
}
