import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { appOrigin } from "@/lib/app-origin";
import { normalizeShareToken, sharePath } from "@/lib/share";
import { recordShareEvent } from "@/lib/share-estimate-audit";
import { estimateSharePreview } from "@/lib/share-preview";
import { loadSharedEstimate } from "@/lib/share-server";
import { ShareEstimateClient } from "./share-estimate-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const loadEstimate = cache((token: string) => loadSharedEstimate(token));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const trimmed = normalizeShareToken(token);
  const { payload } = await loadEstimate(trimmed);
  const origin = await appOrigin();
  // Texted and pasted links unfurl from these tags, so the base has to be absolute.
  const base = { metadataBase: new URL(origin) } satisfies Metadata;

  if (!payload) {
    const title = "This proposal isn’t available";
    return {
      ...base,
      title: { absolute: title },
      description: title,
      robots: { index: false, follow: false },
      openGraph: { title: { absolute: title }, description: title },
    };
  }

  const preview = estimateSharePreview(payload);
  const url = `${origin}${sharePath("e", trimmed)}`;
  const title = { absolute: preview.title };

  return {
    ...base,
    title,
    description: preview.description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title,
      description: preview.description,
      siteName: preview.siteName || undefined,
      url,
    },
    twitter: {
      card: "summary",
      title,
      description: preview.description,
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
  const { payload, sender } = await loadEstimate(trimmed);
  if (payload) {
    const hdrs = await headers();
    await recordShareEvent(trimmed, hdrs, { kind: "opened" });
  }
  return <ShareEstimateClient token={trimmed} initial={payload} initialSender={sender} />;
}
