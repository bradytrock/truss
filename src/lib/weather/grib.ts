import { crc32, deflateSync, gunzipSync, inflateSync } from "node:zlib";
import type { BBox } from "./types.ts";

const USER_AGENT = "TheRoofingCRM (https://myroofingtools.com; storm desk)";
const GRID_TTL_MS = 20 * 60 * 1000;

export type CropGrid = {
  valid: string;
  originRow: number;
  originCol: number;
  width: number;
  height: number;
  lat0: number;
  lon0: number;
  dlat: number;
  dlon: number;
  values: Float32Array;
};

type CacheEntry = { at: number; grid: CropGrid };
const cropCache = new Map<string, CacheEntry>();
const latestCache = new Map<string, { at: number; url: string }>();

type GridHeader = {
  png: Buffer;
  ref: number;
  binaryScale: number;
  decimalScale: number;
  bitDepth: number;
  nx: number;
  ny: number;
  lat0: number;
  lon0: number;
  dlat: number;
  dlon: number;
  valid: string;
};

export async function loadCrop(directory: string, filePattern: RegExp, bbox: BBox, interpret: (value: number) => number | null) {
  const key = `${directory}|${bbox.west.toFixed(2)}|${bbox.south.toFixed(2)}|${bbox.east.toFixed(2)}|${bbox.north.toFixed(2)}`;
  const cached = cropCache.get(key);
  if (cached && Date.now() - cached.at < GRID_TTL_MS) return cached.grid;
  const url = await latestGrib(directory, filePattern);
  const compressed = await fetchBuffer(url);
  const grid = decodeCrop(gunzipSync(compressed), bbox, interpret);
  cropCache.set(key, { at: Date.now(), grid });
  return grid;
}

export function sampleCrop(grid: CropGrid, lat: number, lng: number) {
  const row = Math.round((grid.lat0 - lat) / grid.dlat);
  const col = Math.round((lng - grid.lon0) / grid.dlon);
  if (row < 0 || col < 0 || row >= grid.height || col >= grid.width) return null;
  const value = grid.values[row * grid.width + col] ?? Number.NaN;
  return Number.isFinite(value) ? value : null;
}

export function renderCropPng(grid: CropGrid, colorOf: (value: number) => [number, number, number, number] | null) {
  const maxEdge = 520;
  const step = Math.max(1, Math.ceil(Math.max(grid.width, grid.height) / maxEdge));
  const width = Math.max(1, Math.ceil(grid.width / step));
  const height = Math.max(1, Math.ceil(grid.height / step));
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = Math.min(grid.height - 1, y * step);
    const start = y * (1 + width * 4);
    raw[start] = 0;
    for (let x = 0; x < width; x++) {
      const col = Math.min(grid.width - 1, x * step);
      const value = grid.values[row * grid.width + col] ?? Number.NaN;
      const color = Number.isFinite(value) ? colorOf(value) : null;
      const pixel = start + 1 + x * 4;
      raw[pixel] = color?.[0] ?? 0;
      raw[pixel + 1] = color?.[1] ?? 0;
      raw[pixel + 2] = color?.[2] ?? 0;
      raw[pixel + 3] = color?.[3] ?? 0;
    }
  }
  return encodeRgbaPng(width, height, raw);
}

export function decodeCrop(grib: Buffer, bbox: BBox, interpret: (value: number) => number | null): CropGrid {
  const header = readGribPng(grib);
  const northRow = clamp(Math.floor((header.lat0 - bbox.north) / header.dlat), 0, header.ny - 1);
  const southRow = clamp(Math.ceil((header.lat0 - bbox.south) / header.dlat), 0, header.ny - 1);
  const westCol = clamp(Math.floor((bbox.west - header.lon0) / header.dlon), 0, header.nx - 1);
  const eastCol = clamp(Math.ceil((bbox.east - header.lon0) / header.dlon), 0, header.nx - 1);
  const originRow = Math.min(northRow, southRow);
  const endRow = Math.max(northRow, southRow);
  const originCol = Math.min(westCol, eastCol);
  const endCol = Math.max(westCol, eastCol);
  const fullWidth = endCol - originCol + 1;
  const fullHeight = endRow - originRow + 1;
  const storeStep = Math.max(1, Math.ceil(Math.max(fullWidth, fullHeight) / 900));
  const width = Math.ceil(fullWidth / storeStep);
  const height = Math.ceil(fullHeight / storeStep);
  const values = new Float32Array(width * height);
  values.fill(Number.NaN);
  decodeGrayPng(header.png, header.bitDepth, {
    originRow,
    endRow,
    originCol,
    endCol,
    storeStep,
    onPixel(row, col, raw) {
      const y = Math.floor((row - originRow) / storeStep);
      const x = Math.floor((col - originCol) / storeStep);
      if (y < 0 || x < 0 || y >= height || x >= width) return;
      const value = interpret(geophysical(raw, header));
      if (value == null) return;
      const index = y * width + x;
      const current = values[index] ?? Number.NaN;
      if (!Number.isFinite(current) || value > current) values[index] = value;
    },
  });
  return {
    valid: header.valid,
    originRow,
    originCol,
    width,
    height,
    lat0: header.lat0 - originRow * header.dlat,
    lon0: header.lon0 + originCol * header.dlon,
    dlat: header.dlat * storeStep,
    dlon: header.dlon * storeStep,
    values,
  };
}

function geophysical(raw: number, header: GridHeader) {
  return (header.ref + raw * 2 ** header.binaryScale) / 10 ** header.decimalScale;
}

function readGribPng(data: Buffer): GridHeader {
  if (data.subarray(0, 4).toString("ascii") !== "GRIB") throw new Error("Weather grid was not a GRIB file.");
  const total = Number(data.readBigUInt64BE(8));
  let offset = 16;
  let png: Buffer | null = null;
  let ref = 0;
  let binaryScale = 0;
  let decimalScale = 0;
  let bitDepth = 16;
  let nx = 0;
  let ny = 0;
  let lat0 = 0;
  let lon0 = 0;
  let dlat = 0.01;
  let dlon = 0.01;
  let valid = "";
  const end = Math.min(data.length, total);
  while (offset + 5 <= end) {
    const length = data.readUInt32BE(offset);
    const section = data[offset + 4];
    if (length < 5) break;
    if (section === 1 && length >= 19) {
      const year = data.readUInt16BE(offset + 12);
      const month = data[offset + 14];
      const day = data[offset + 15];
      const hour = data[offset + 16];
      const minute = data[offset + 17];
      if (year > 2000 && month && day) {
        valid = `${year}-${pad(month)}-${pad(day)}T${pad(hour ?? 0)}:${pad(minute ?? 0)}:00Z`;
      }
    }
    if (section === 3 && length >= 72) {
      nx = data.readUInt32BE(offset + 30);
      ny = data.readUInt32BE(offset + 34);
      lat0 = data.readInt32BE(offset + 46) / 1e6;
      lon0 = data.readInt32BE(offset + 50) / 1e6;
      if (lon0 > 180) lon0 -= 360;
      dlon = data.readUInt32BE(offset + 63) / 1e6;
      dlat = data.readUInt32BE(offset + 67) / 1e6;
    }
    if (section === 5 && length >= 21) {
      const template = data.readUInt16BE(offset + 9);
      if (template !== 41) throw new Error(`Weather grid packing ${template} is not PNG.`);
      ref = data.readFloatBE(offset + 11);
      binaryScale = data.readInt16BE(offset + 15);
      decimalScale = data.readInt16BE(offset + 17);
      bitDepth = data[offset + 19] ?? 16;
    }
    if (section === 7) png = data.subarray(offset + 5, offset + length);
    if (section === 8) break;
    offset += length;
  }
  if (!png || !nx || !ny) throw new Error("Weather grid did not include a PNG field.");
  return { png, ref, binaryScale, decimalScale, bitDepth, nx, ny, lat0, lon0, dlat, dlon, valid };
}

type PixelWindow = {
  originRow: number;
  endRow: number;
  originCol: number;
  endCol: number;
  storeStep: number;
  onPixel: (row: number, col: number, raw: number) => void;
};

function decodeGrayPng(png: Buffer, bitDepth: number, window: PixelWindow) {
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Weather grid PNG was unreadable.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const chunk = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      depth = chunk[8] ?? 0;
      colorType = chunk[9] ?? 0;
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (colorType !== 0 || depth !== bitDepth) {
    throw new Error(`Weather grid PNG is ${depth}-bit color ${colorType}.`);
  }
  const bpp = Math.max(1, Math.ceil(depth / 8));
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart] ?? 0;
    cur.set(raw.subarray(rowStart + 1, rowStart + 1 + stride));
    unfilter(filter, cur, prev, bpp);
    if (y >= window.originRow && y <= window.endRow && (y - window.originRow) % window.storeStep === 0) {
      for (let x = window.originCol; x <= window.endCol; x += window.storeStep) {
        const byte = x * bpp;
        let value = 0;
        for (let b = 0; b < bpp; b++) value = (value << 8) | (cur[byte + b] ?? 0);
        window.onPixel(y, x, value);
      }
    }
    prev.set(cur);
    if (y > window.endRow) break;
  }
  return true;
}

function unfilter(filter: number, cur: Uint8Array, prev: Uint8Array, bpp: number) {
  if (filter === 0) return;
  for (let i = 0; i < cur.length; i++) {
    const left = i >= bpp ? (cur[i - bpp] ?? 0) : 0;
    const up = prev[i] ?? 0;
    const upLeft = i >= bpp ? (prev[i - bpp] ?? 0) : 0;
    let predictor = 0;
    if (filter === 1) predictor = left;
    else if (filter === 2) predictor = up;
    else if (filter === 3) predictor = (left + up) >> 1;
    else if (filter === 4) {
      const p = left + up - upLeft;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - upLeft);
      predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
    } else {
      throw new Error(`PNG filter ${filter} is not supported.`);
    }
    cur[i] = (cur[i]! + predictor) & 255;
  }
}

function encodeRgbaPng(width: number, height: number, raw: Buffer) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

async function latestGrib(directory: string, pattern: RegExp) {
  const cached = latestCache.get(directory);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.url;
  const html = await fetchText(directory);
  const names = [...html.matchAll(pattern)].map((match) => match[1] || match[0]);
  const name = names.at(-1);
  if (!name) throw new Error("No current hail grid was published.");
  const url = `${directory.replace(/\/$/, "")}/${name}`;
  latestCache.set(directory, { at: Date.now(), url });
  return url;
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Weather grid list answered ${response.status}.`);
  return response.text();
}

async function fetchBuffer(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Weather grid answered ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
