import { toClientFacingProposal } from "@/lib/estimate-totals";
import { parseSharedEstimate, type SharedEstimatePayload } from "@/lib/share";
import { withStorageShareAccessDeep } from "@/lib/storage/share-access";

export function clientFacingSharePayload(
  raw: unknown,
  shareToken?: string,
): SharedEstimatePayload | null {
  const payload = parseSharedEstimate(raw);
  if (!payload) return null;
  const client = toClientFacingProposal(payload.estimate, payload.lines);
  const next: SharedEstimatePayload = {
    ...payload,
    estimate: { ...payload.estimate, ...client.estimate, marginPercent: 0 },
    lines: client.lines,
  };
  const token = shareToken?.trim() || next.estimate.shareToken?.trim() || "";
  return token
    ? (withStorageShareAccessDeep(next, token) as SharedEstimatePayload)
    : next;
}
