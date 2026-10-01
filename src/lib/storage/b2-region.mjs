/**
 * Backblaze application key IDs (the long ones, not the 12-character master
 * key) start with the account's cluster number. The S3 API only accepts a
 * key on that cluster's endpoint. Calling any other region returns
 * `InvalidAccessKeyId`: The key '005…' is not valid.
 *
 * Cluster numbers are not formally documented; they match the friendly
 * download host (`f005.backblazeb2.com`) and the S3 region suffix.
 */
const B2_CLUSTER_REGIONS = {
  "000": "us-west-000",
  "001": "us-west-001",
  "002": "us-west-002",
  "003": "eu-central-003",
  "004": "us-west-004",
  "005": "us-east-005",
  "006": "ca-east-006",
};

/** This product's bucket is on cluster 005 (`f005.backblazeb2.com`). */
export const DEFAULT_B2_REGION = "us-east-005";

export function regionFromB2KeyId(keyId) {
  const id = String(keyId || "").trim();
  // Master application key IDs are 12 hex characters and are rejected by the
  // S3-compatible API. Only the longer non-master key IDs encode a cluster.
  if (id.length <= 12) return "";
  const cluster = id.slice(0, 3);
  if (!/^\d{3}$/.test(cluster)) return "";
  return B2_CLUSTER_REGIONS[cluster] || "";
}

function endpointMatchesRegion(endpoint, region) {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    if (!host.endsWith(".backblazeb2.com")) return true;
    return host === `s3.${region}.backblazeb2.com`;
  } catch {
    return false;
  }
}

/**
 * Pick the S3 region and endpoint for a key.
 * A key ID prefix wins over `B2_REGION` / `B2_ENDPOINT` when those still
 * point at another Backblaze cluster (the old `us-west-004` default).
 * Non-Backblaze endpoints (a private proxy) are left alone.
 */
export function resolveB2Location(input = {}) {
  const fromKey = regionFromB2KeyId(input.keyId || "");
  const configured = String(input.region || "").trim();
  const region = fromKey || configured || DEFAULT_B2_REGION;
  const expected = `https://s3.${region}.backblazeb2.com`;
  const endpoint = String(input.endpoint || "").trim().replace(/\/+$/, "");
  if (endpoint && endpointMatchesRegion(endpoint, region)) {
    return { region, endpoint };
  }
  return { region, endpoint: expected };
}
