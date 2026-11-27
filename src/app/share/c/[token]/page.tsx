import type { Metadata } from "next";
import { loadSharedChangeOrder } from "@/lib/change-order-share";
import { normalizeShareToken } from "@/lib/share";
import { ShareChangeOrderClient } from "./share-change-order-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const payload = await loadSharedChangeOrder(normalizeShareToken(token));
  const title = payload ? `${payload.number} · ${payload.companyName || "Change order"}` : "Change order";
  return {
    title: { absolute: title },
    robots: { index: false, follow: false },
  };
}

export default async function SharedChangeOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trimmed = normalizeShareToken(token);
  const payload = await loadSharedChangeOrder(trimmed);
  return <ShareChangeOrderClient token={trimmed} initial={payload} />;
}
