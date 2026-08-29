import { normalizeShareToken } from "@/lib/share";
import { loadShareAudit, recordShareEvent } from "@/lib/share-estimate-audit";
import { loadSharedEstimate } from "@/lib/share-server";
import { ShareEstimateClient } from "./share-estimate-client";
import { headers } from "next/headers";

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
  if (payload) {
    const hdrs = await headers();
    await recordShareEvent(trimmed, hdrs, { kind: "opened" });
    payload.signatureEvents = await loadShareAudit(trimmed);
  }
  return <ShareEstimateClient token={trimmed} initial={payload} initialSender={sender} />;
}
