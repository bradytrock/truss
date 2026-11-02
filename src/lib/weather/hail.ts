/** Coin sizes adjusters already say out loud. MESH is a radar estimate, so the label stays an estimate. */

export const HAIL_BINS = [
  { inches: 0.75, label: "Penny", color: "#16a34a" },
  { inches: 1, label: "Quarter", color: "#ca8a04" },
  { inches: 1.25, label: "Half dollar", color: "#ea580c" },
  { inches: 1.5, label: "Ping pong", color: "#dc2626" },
  { inches: 1.75, label: "Golf ball", color: "#7e22ce" },
  { inches: 2, label: "Hen egg", color: "#db2777" },
] as const;

export const HAIL_SWATH_NOTE =
  "Radar-estimated hail (NOAA MRMS MESH). About a kilometer across. Not a measurement in the driveway.";

export function hailBin(inches: number) {
  let chosen: (typeof HAIL_BINS)[number] | null = null;
  for (const bin of HAIL_BINS) {
    if (inches + 1e-6 >= bin.inches) chosen = bin;
  }
  return chosen;
}

export function formatInches(inches: number) {
  return `${inches.toFixed(2)} in`;
}

export function hailLabel(inches: number | null | undefined) {
  if (inches == null || !Number.isFinite(inches) || inches < 0.75) return "";
  const bin = hailBin(inches);
  return bin ? `${formatInches(inches)} · ${bin.label}` : formatInches(inches);
}

/** GRIB PNG value to millimeters. Missing and no-coverage stay negative. */
export function geophysicalValue(raw: number, ref: number, binaryScale: number, decimalScale: number) {
  return (ref + raw * 2 ** binaryScale) / 10 ** decimalScale;
}

export function meshInchesFromMillimeters(mm: number) {
  if (!Number.isFinite(mm) || mm < 19) return 0;
  return mm / 25.4;
}

export function swathColor(inches: number): [number, number, number, number] | null {
  const bin = hailBin(inches);
  if (!bin) return null;
  const hex = bin.color.slice(1);
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return [r, g, b, 168];
}

export function rotationVisible(value: number) {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (value >= 10) return true;
  return value >= 0.01 && value < 5;
}
