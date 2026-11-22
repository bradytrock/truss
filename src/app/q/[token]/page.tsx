import type { Metadata } from "next";
import { normalizeShareToken } from "@/lib/share";
import { PayAtCloseApplicationClient } from "./application-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Pay for your roof when your home sells",
  description: "A few questions about your sale so the repairs can be paid from your closing.",
  robots: { index: false, follow: false },
};

/**
 * The homeowner's side of Pay at Close, opened from the short link in their text
 * (`theroofingcrm.com/q/8Fk2Qx7m`). Everything here is written to the homeowner; the office
 * sees the same answers on the job's Pay at close tab.
 */
export default async function PayAtCloseApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string | string[] }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const preview = query.preview === "1" || query.preview === "true";
  return <PayAtCloseApplicationClient token={normalizeShareToken(token)} preview={preview} />;
}
