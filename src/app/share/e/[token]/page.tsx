import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { appOrigin } from "@/lib/app-origin";
import { normalizeShareToken, sharePath } from "@/lib/share";
import { recordShareEvent } from "@/lib/share-estimate-audit";
import { loadSharedEstimate } from "@/lib/share-server";
import { estimateSharePreviewTitle, sharePreviewCompanyName } from "@/lib/share-preview";
import { ShareEstimateClient } from "./share-estimate-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DESCRIPTION = "Review and sign your estimate.";

const loadEstimateForRequest = cache((token: string) => loadSharedEstimate(token));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const trimmed = normalizeShareToken(token);
  const { payload, sender } = await loadEstimateForRequest(trimmed);
  const companyName = sharePreviewCompanyName(payload?.company.name || sender?.company.name);
  const title = estimateSharePreviewTitle(companyName);
  const origin = await appOrigin();
  // Texted links unfurl from these tags. Pin the URL to the request host so the
  // preview is not resolved against localhost.
  const url = `${origin}${sharePath("e", trimmed)}`;

  return {
    metadataBase: new URL(origin),
    title,
    description: DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: DESCRIPTION,
      url,
      siteName: companyName || undefined,
    },
    twitter: {
      card: "summary",
      title,
      description: DESCRIPTION,
    },
  };
}

export default async function SharedEstimatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trimmed = normalizeShareToken(token);
  const { payload, sender } = await loadEstimateForRequest(trimmed);
  if (payload) {
    const hdrs = await headers();
    await recordShareEvent(trimmed, hdrs, { kind: "opened" });
  }
  return <ShareEstimateClient token={trimmed} initial={payload} initialSender={sender} />;
}
