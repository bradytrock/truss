import { normalizeShareToken } from "@/lib/share";
import { loadSharedPortal } from "@/lib/portal-server";
import { PortalClient } from "./portal-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trimmed = normalizeShareToken(token);
  const initial = await loadSharedPortal(trimmed);
  return <PortalClient token={trimmed} initial={initial} />;
}
