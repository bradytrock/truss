import { toClientFacingProposal } from "@/lib/estimate-totals";
import { parseSharedEstimate, type SharedEstimatePayload } from "@/lib/share";

export function clientFacingSharePayload(raw: unknown): SharedEstimatePayload | null {
  const payload = parseSharedEstimate(raw);
  if (!payload) return null;
  const client = toClientFacingProposal(payload.estimate, payload.lines);
  return {
    ...payload,
    estimate: { ...payload.estimate, ...client.estimate, marginPercent: 0 },
    lines: client.lines,
  };
}
