import { normalizeShareToken } from "@/lib/share";
import { loadSharedPage } from "@/lib/share-server";
import { SharePageClient } from "./share-page-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SharedPageDocument({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trimmed = normalizeShareToken(token);
  const { payload, sender } = await loadSharedPage(trimmed);
  return <SharePageClient token={trimmed} initial={payload} initialSender={sender} />;
}
