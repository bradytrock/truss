import { normalizeShareToken } from "@/lib/share";
import {
  loadSharedRealtorPortal,
  realtorPortalJson,
  realtorPortalNotFoundJson,
} from "@/lib/realtor-portal-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6) return realtorPortalNotFoundJson(trimmed);
  const payload = await loadSharedRealtorPortal(trimmed);
  if (!payload) return realtorPortalNotFoundJson(trimmed);
  return realtorPortalJson(payload);
}
