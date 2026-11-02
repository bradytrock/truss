import { bufferTrack } from "./track.ts";
import type { LngLat } from "./types.ts";

/**
 * North Texas sample swaths so the storm map matches the desk prototype
 * before a season of MESH snapshots exists. The live MRMS directory only
 * keeps about a day. Dates are 2026 so "days ago" is real on 2 Nov 2026.
 */
export const SAMPLE_HAIL_POINT = { lat: 32.9692, lng: -97.2399 };

const OCT_27 = "a11a0001-2026-4027-8000-000000000027";
const OCT_14 = "a11a0001-2026-4014-8000-000000000014";
const SEP_22 = "a11a0001-2026-4022-8000-000000000922";
const AUG_30 = "a11a0001-2026-4030-8000-000000000830";

const oct27Track: LngLat[] = [
  [-97.62, 32.68],
  [-97.42, 32.84],
  [-97.2473, 32.9754],
  [-97.05, 33.14],
];

const oct27Core: LngLat[] = [
  [-97.268, 32.962],
  [-97.2473, 32.9754],
  [-97.22, 32.992],
];

export type SampleHailReport = {
  sizeIn: number;
  place: string;
  reportedAt: string;
  lat: number;
  lng: number;
};

export type SampleHailStorm = {
  id: string;
  stormDate: string;
  startedAt: string;
  endedAt: string;
  radarSite: string;
  stormMaxIn: number;
  source: "sample";
  track: LngLat[];
  bands: { sizeIn: number; radiusMeters: number; track: LngLat[] }[];
  report: SampleHailReport | null;
};

export const SAMPLE_HAIL_STORMS: SampleHailStorm[] = [
  {
    id: OCT_27,
    stormDate: "2026-10-27",
    startedAt: "2026-10-27T19:50:00.000Z",
    endedAt: "2026-10-27T22:20:00.000Z",
    radarSite: "KFWS",
    stormMaxIn: 1.75,
    source: "sample",
    track: oct27Track,
    bands: [
      { sizeIn: 0.75, radiusMeters: 20000, track: oct27Track },
      { sizeIn: 1, radiusMeters: 12000, track: oct27Track },
      { sizeIn: 1.25, radiusMeters: 7000, track: oct27Track },
      { sizeIn: 1.5, radiusMeters: 3200, track: oct27Track },
      { sizeIn: 1.75, radiusMeters: 700, track: oct27Core },
    ],
    report: {
      sizeIn: 1.75,
      place: "2 NW Flower Mound",
      reportedAt: "2026-10-27T21:31:00.000Z",
      lat: 33.002,
      lng: -97.255,
    },
  },
  {
    id: OCT_14,
    stormDate: "2026-10-14",
    startedAt: "2026-10-14T19:10:00.000Z",
    endedAt: "2026-10-14T21:20:00.000Z",
    radarSite: "KFWS",
    stormMaxIn: 1.25,
    source: "sample",
    track: [
      [-97.4, 32.4],
      [-97.18, 32.52],
      [-96.92, 32.66],
    ],
    bands: [
      { sizeIn: 0.75, radiusMeters: 16000, track: [
        [-97.4, 32.4],
        [-97.18, 32.52],
        [-96.92, 32.66],
      ] },
      { sizeIn: 1, radiusMeters: 9000, track: [
        [-97.4, 32.4],
        [-97.18, 32.52],
        [-96.92, 32.66],
      ] },
      { sizeIn: 1.25, radiusMeters: 3500, track: [
        [-97.28, 32.46],
        [-97.1, 32.56],
      ] },
    ],
    report: null,
  },
  {
    id: SEP_22,
    stormDate: "2026-09-22",
    startedAt: "2026-09-22T21:00:00.000Z",
    endedAt: "2026-09-22T23:40:00.000Z",
    radarSite: "KFWS",
    stormMaxIn: 2,
    source: "sample",
    track: [
      [-96.85, 32.62],
      [-96.5, 32.86],
      [-96.15, 33.08],
    ],
    bands: [
      { sizeIn: 0.75, radiusMeters: 18000, track: [
        [-96.85, 32.62],
        [-96.5, 32.86],
        [-96.15, 33.08],
      ] },
      { sizeIn: 1.25, radiusMeters: 9000, track: [
        [-96.85, 32.62],
        [-96.5, 32.86],
        [-96.15, 33.08],
      ] },
      { sizeIn: 1.75, radiusMeters: 4000, track: [
        [-96.6, 32.78],
        [-96.4, 32.94],
      ] },
      { sizeIn: 2, radiusMeters: 1200, track: [
        [-96.52, 32.84],
        [-96.46, 32.9],
      ] },
    ],
    report: {
      sizeIn: 2,
      place: "1 E Greenville",
      reportedAt: "2026-09-22T22:12:00.000Z",
      lat: 33.128,
      lng: -96.09,
    },
  },
  {
    id: AUG_30,
    stormDate: "2026-08-30",
    startedAt: "2026-08-30T22:15:00.000Z",
    endedAt: "2026-08-31T00:20:00.000Z",
    radarSite: "KFWS",
    stormMaxIn: 1,
    source: "sample",
    track: [
      [-98.1, 32.5],
      [-97.9, 32.68],
      [-97.68, 32.86],
    ],
    bands: [
      { sizeIn: 0.75, radiusMeters: 14000, track: [
        [-98.1, 32.5],
        [-97.9, 32.68],
        [-97.68, 32.86],
      ] },
      { sizeIn: 1, radiusMeters: 5000, track: [
        [-97.98, 32.58],
        [-97.82, 32.74],
      ] },
    ],
    report: null,
  },
];

export type HailReport = SampleHailReport;

export type HailBand = {
  sizeIn: number;
  geometry: ReturnType<typeof bufferTrack>;
};

export type HailStorm = {
  id: string;
  stormDate: string;
  startedAt: string;
  endedAt: string;
  radarSite: string;
  stormMaxIn: number;
  source: string;
  track: LngLat[];
  bands: HailBand[];
  report: HailReport | null;
};

export function materializeStorm(storm: SampleHailStorm): HailStorm {
  return {
    id: storm.id,
    stormDate: storm.stormDate,
    startedAt: storm.startedAt,
    endedAt: storm.endedAt,
    radarSite: storm.radarSite,
    stormMaxIn: storm.stormMaxIn,
    source: storm.source,
    track: storm.track,
    bands: storm.bands.map((band) => ({
      sizeIn: band.sizeIn,
      geometry: bufferTrack(band.track, band.radiusMeters),
    })),
    report: storm.report,
  };
}

export function sampleHailStorms(): HailStorm[] {
  return SAMPLE_HAIL_STORMS.map(materializeStorm);
}
