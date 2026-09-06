import { normalizeShareToken } from "@/lib/share";
import { MarketingShareClient } from "./share-client";

export const dynamic = "force-dynamic";

export default async function MarketingSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <MarketingShareClient token={normalizeShareToken(token)} />;
}
