"use client";

import { useEffect, useState } from "react";
import { MarketingCanvas, materialPreviewModel } from "@/components/marketing/canvas";
import { Button } from "@/components/ui/button";
import { loadMarketingState, marketingStorageKey } from "@/lib/marketing/storage";
import type { MarketingMaterial } from "@/lib/marketing/types";

type SharedPayload = {
  id: string;
  name: string;
  kind: MarketingMaterial["kind"];
  headline: string;
  subhead: string;
  body: string;
  cta: string;
  badge: string;
  accent: string;
  photoUrls: string[];
  companyName: string;
  shareToken: string;
};

function materialFromLocal(token: string): SharedPayload | null {
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith("theroofingcrm.marketing.v1:")) continue;
    const companyId = key.slice("theroofingcrm.marketing.v1:".length);
    const state = loadMarketingState(companyId);
    const material = state.materials.find((item) => item.shareToken === token);
    if (!material) continue;
    return {
      id: material.id,
      name: material.name,
      kind: material.kind,
      headline: material.headline,
      subhead: material.subhead,
      body: material.body,
      cta: material.cta,
      badge: material.badge,
      accent: material.accent,
      photoUrls: material.photoUrls,
      companyName: "Your contractor",
      shareToken: material.shareToken,
    };
  }
  return null;
}

export function MarketingShareClient({ token }: { token: string }) {
  const [payload, setPayload] = useState<SharedPayload | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/marketing/material/${encodeURIComponent(token)}`);
        if (response.ok) {
          const body = (await response.json()) as SharedPayload;
          if (!cancelled) setPayload(body);
          void fetch("/api/marketing/event", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, kind: "view" }),
            keepalive: true,
          });
          return;
        }
      } catch {
        // fall through
      }

      const local = materialFromLocal(token);
      if (local) {
        if (!cancelled) setPayload(local);
        return;
      }
      if (!cancelled) setMissing(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (missing) {
    return (
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-3 p-6">
        <h1 className="font-heading text-2xl font-medium">Link not found</h1>
        <p className="text-sm text-muted-foreground">
          This marketing piece isn’t available. Ask your contractor for a fresh link.
        </p>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="mx-auto flex min-h-full max-w-lg items-center justify-center p-6 text-sm text-muted-foreground">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          {payload.companyName}
        </p>
        <h1 className="font-heading text-3xl font-medium tracking-tight">{payload.name}</h1>
      </div>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <div className="space-y-4 rounded-lg border bg-card p-5">
          <h2 className="font-heading text-2xl font-medium">{payload.headline}</h2>
          {payload.subhead ? <p className="font-medium text-muted-foreground">{payload.subhead}</p> : null}
          <p className="whitespace-pre-wrap text-muted-foreground">{payload.body}</p>
          <p className="font-medium text-primary">{payload.cta}</p>
          <Button
            type="button"
            onClick={() => {
              void fetch("/api/marketing/event", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token, kind: "cta" }),
                keepalive: true,
              });
            }}
          >
            {payload.cta || "Get in touch"}
          </Button>
        </div>
        <MarketingCanvas model={materialPreviewModel(payload, payload.companyName)} />
      </div>
    </main>
  );
}

void marketingStorageKey;
