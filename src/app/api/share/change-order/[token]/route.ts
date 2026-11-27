import { declineSharedChangeOrder, signSharedChangeOrder } from "@/lib/change-order-share";
import { normalizeShareToken } from "@/lib/share";
import { shareJson, shareNotFoundJson } from "@/lib/share-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6) return shareNotFoundJson(trimmed);
  const body = (await request.json().catch(() => null)) as { name?: string; image?: string; action?: string } | null;
  const result =
    body?.action === "decline"
      ? await declineSharedChangeOrder(trimmed)
      : await signSharedChangeOrder(trimmed, body?.name?.trim() ?? "", body?.image ?? "");
  if (!result.payload) {
    return shareJson({ error: result.error || "Could not save the signature." }, 400);
  }
  return shareJson(result.payload);
}
