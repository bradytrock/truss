import { normalizeShareToken } from "@/lib/share";
import {
  loadSharedPortal,
  portalJson,
  portalNotFoundJson,
  submitPortalReferral,
} from "@/lib/portal-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6) return portalNotFoundJson(trimmed);
  const payload = await loadSharedPortal(trimmed);
  if (!payload) return portalNotFoundJson(trimmed);
  return portalJson(payload);
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6) return portalNotFoundJson(trimmed);

  let body: {
    referredName?: string;
    referredPhone?: string;
    referredEmail?: string;
    notes?: string;
    jobId?: string | null;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return portalJson({ error: "Add the neighbor’s name." }, 400);
  }

  const result = await submitPortalReferral({
    token: trimmed,
    referredName: body.referredName ?? "",
    referredPhone: body.referredPhone,
    referredEmail: body.referredEmail,
    notes: body.notes,
    jobId: body.jobId,
  });
  if (!result.payload) {
    return portalJson({ error: result.error ?? "Could not send that referral." }, 400);
  }
  return portalJson(result.payload);
}
