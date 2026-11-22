import { permanentRedirect } from "next/navigation";
import { normalizeShareToken, sharePath } from "@/lib/share";

export const dynamic = "force-dynamic";

/** Links minted before the application moved to the short `/q/<code>` path. */
export default async function LegacyPayAtCloseApplicationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  permanentRedirect(sharePath("q", normalizeShareToken(token)));
}
