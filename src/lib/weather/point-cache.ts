import type { HailPopupHit } from "./hail-point.ts";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; hits: HailPopupHit[] }>();

export function readJobHail(jobId: string) {
  const row = cache.get(jobId);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    cache.delete(jobId);
    return null;
  }
  return row.hits;
}

export function writeJobHail(jobId: string, hits: HailPopupHit[]) {
  cache.set(jobId, { at: Date.now(), hits });
}
