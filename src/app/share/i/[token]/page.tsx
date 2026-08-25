import { normalizeShareToken } from "@/lib/share";
import { loadSharedInvoice } from "@/lib/share-server";
import { ShareInvoiceClient } from "./share-invoice-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SharedInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trimmed = normalizeShareToken(token);
  const { payload, sender } = await loadSharedInvoice(trimmed);
  return <ShareInvoiceClient token={trimmed} initial={payload} initialSender={sender} />;
}
