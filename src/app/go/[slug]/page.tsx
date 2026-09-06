"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { loadMarketingState } from "@/lib/marketing/storage";

export default function MarketingVanityRedirectPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  useEffect(() => {
    const slug = params.slug?.trim().toLowerCase();
    if (!slug) {
      router.replace("/marketing");
      return;
    }

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith("theroofingcrm.marketing.v1:")) continue;
      const companyId = key.slice("theroofingcrm.marketing.v1:".length);
      const state = loadMarketingState(companyId);
      const material = state.materials.find(
        (item) => item.vanitySlug.trim().toLowerCase() === slug || item.shareToken === slug,
      );
      if (material) {
        router.replace(`/share/m/${material.shareToken}`);
        return;
      }
    }

    router.replace("/marketing");
  }, [params.slug, router]);

  return (
    <main className="mx-auto flex min-h-full max-w-lg items-center justify-center p-6 text-sm text-muted-foreground">
      Opening campaign link…
    </main>
  );
}
