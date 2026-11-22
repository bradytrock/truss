import type { Metadata } from "next";
import { normalizeShareToken } from "@/lib/share";
import { PayAtCloseApplicationClient } from "./application-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Pay at Close application",
  description: "Answer a few questions about your sale and sign so the repairs can be paid from your closing.",
  robots: { index: false, follow: false },
};

export default async function PayAtCloseApplicationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PayAtCloseApplicationClient token={normalizeShareToken(token)} />;
}
