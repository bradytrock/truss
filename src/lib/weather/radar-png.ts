import { inflateSync } from "node:zlib";

/** One pixel from a map PNG. Supports 8-bit gray, RGB, palette, and RGBA. */

export type Rgba = { r: number; g: number; b: number; a: number };

export function readPngPixel(bytes: Uint8Array, x: number, y: number): Rgba | null {
  const png = decodePng(bytes);
  if (!png) return null;
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return null;
  const index = (y * png.width + x) * 4;
  return {
    r: png.rgba[index] ?? 0,
    g: png.rgba[index + 1] ?? 0,
    b: png.rgba[index + 2] ?? 0,
    a: png.rgba[index + 3] ?? 0,
  };
}

export function latLngToTilePixel(lat: number, lng: number, zoom: number) {
  const z = Math.max(0, Math.min(8, Math.round(zoom)));
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  return {
    z,
    tileX,
    tileY,
    px: Math.min(255, Math.max(0, Math.floor((x - tileX) * 256))),
    py: Math.min(255, Math.max(0, Math.floor((y - tileY) * 256))),
  };
}

type DecodedPng = { width: number; height: number; rgba: Uint8Array };

function decodePng(bytes: Uint8Array): DecodedPng | null {
  if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idat: Uint8Array<ArrayBufferLike>[] = [];
  let palette: Uint8Array<ArrayBufferLike> = new Uint8Array();
  let transparency: Uint8Array<ArrayBufferLike> = new Uint8Array();
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4] ?? 0, bytes[offset + 5] ?? 0, bytes[offset + 6] ?? 0, bytes[offset + 7] ?? 0);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) return null;
    const data = bytes.subarray(start, end);
    if (type === "IHDR") {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      bitDepth = data[8] ?? 8;
      colorType = data[9] ?? 6;
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }
  if (!width || !height || bitDepth !== 8) return null;
  if (colorType !== 0 && colorType !== 2 && colorType !== 3 && colorType !== 6) return null;
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : 4;
  const compressed = concat(idat);
  let raw: Buffer;
  try {
    raw = inflateSync(compressed);
  } catch {
    return null;
  }
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  let cursor = 0;
  for (let row = 0; row < height; row++) {
    const filter = raw[cursor] ?? 0;
    cursor += 1;
    const scan = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? (scan[i - channels] ?? 0) : 0;
      const up = previous[i] ?? 0;
      const upLeft = i >= channels ? (previous[i - channels] ?? 0) : 0;
      const value = raw[cursor] ?? 0;
      cursor += 1;
      if (filter === 1) scan[i] = (value + left) & 255;
      else if (filter === 2) scan[i] = (value + up) & 255;
      else if (filter === 3) scan[i] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) scan[i] = (value + paeth(left, up, upLeft)) & 255;
      else scan[i] = value;
    }
    previous = scan;
    for (let col = 0; col < width; col++) {
      const out = (row * width + col) * 4;
      if (colorType === 6) {
        const i = col * 4;
        rgba[out] = scan[i] ?? 0;
        rgba[out + 1] = scan[i + 1] ?? 0;
        rgba[out + 2] = scan[i + 2] ?? 0;
        rgba[out + 3] = scan[i + 3] ?? 255;
      } else if (colorType === 2) {
        const i = col * 3;
        rgba[out] = scan[i] ?? 0;
        rgba[out + 1] = scan[i + 1] ?? 0;
        rgba[out + 2] = scan[i + 2] ?? 0;
        rgba[out + 3] = 255;
      } else if (colorType === 0) {
        const gray = scan[col] ?? 0;
        rgba[out] = gray;
        rgba[out + 1] = gray;
        rgba[out + 2] = gray;
        rgba[out + 3] = 255;
      } else {
        const index = scan[col] ?? 0;
        rgba[out] = palette[index * 3] ?? 0;
        rgba[out + 1] = palette[index * 3 + 1] ?? 0;
        rgba[out + 2] = palette[index * 3 + 2] ?? 0;
        rgba[out + 3] = transparency.length ? (transparency[index] ?? 255) : 255;
      }
    }
  }
  return { width, height, rgba };
}

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const pa = Math.abs(estimate - left);
  const pb = Math.abs(estimate - up);
  const pc = Math.abs(estimate - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}
