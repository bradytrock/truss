import { normalizeShareToken } from "@/lib/share";
import { loadSharedEstimate } from "@/lib/share-server";
import { ShareEstimateClient } from "./share-estimate-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SharedEstimatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trimmed = normalizeShareToken(token);
  const { payload, sender } = await loadSharedEstimate(trimmed);
  return <ShareEstimateClient token={trimmed} initial={payload} initialSender={sender} />;
}
