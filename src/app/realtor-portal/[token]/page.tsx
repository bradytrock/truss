import { normalizeShareToken } from "@/lib/share";
import { loadSharedRealtorPortal } from "@/lib/realtor-portal-server";
import { RealtorPortalClient } from "./realtor-portal-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function RealtorPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trimmed = normalizeShareToken(token);
  const initial = await loadSharedRealtorPortal(trimmed);
  return <RealtorPortalClient token={trimmed} initial={initial} />;
}
