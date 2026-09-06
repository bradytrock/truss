"use client";

import { cn } from "@/lib/utils";
import type { MarketingMaterial, MarketingTemplate, MarketingTemplateKind } from "@/lib/marketing/types";

export type MarketingPreviewModel = {
  kind: MarketingTemplateKind;
  headline: string;
  subhead: string;
  body: string;
  cta: string;
  badge: string;
  accent: string;
  companyName?: string;
  photoUrls?: string[];
};

export function materialPreviewModel(
  material: Pick<
    MarketingMaterial,
    "kind" | "headline" | "subhead" | "body" | "cta" | "badge" | "accent" | "photoUrls"
  >,
  companyName?: string,
): MarketingPreviewModel {
  return { ...material, companyName, photoUrls: material.photoUrls };
}

export function templatePreviewModel(
  template: MarketingTemplate,
  companyName?: string,
): MarketingPreviewModel {
  return {
    kind: template.kind,
    headline: template.headline,
    subhead: template.subhead,
    body: template.body,
    cta: template.cta,
    badge: template.badge,
    accent: template.accent,
    companyName,
    photoUrls: [],
  };
}

export function MarketingCanvas({
  model,
  className,
  compact = false,
}: {
  model: MarketingPreviewModel;
  className?: string;
  compact?: boolean;
}) {
  const photos = model.photoUrls?.filter(Boolean) ?? [];
  const isStory = model.kind === "social_story";
  const isSquare = model.kind === "social_square";
  const isHanger = model.kind === "door_hanger";

  return (
    <div
      className={cn(
        "relative overflow-hidden border bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),transparent_40%),linear-gradient(165deg,#fff7ed,#f8fafc_50%,#fff)] text-stone-900 shadow-sm",
        isStory ? "aspect-[9/16]" : isSquare ? "aspect-square" : isHanger ? "aspect-[2/5]" : "aspect-[4/5]",
        compact ? "rounded-md" : "rounded-lg",
        className,
      )}
      style={{ ["--mk-accent" as string]: model.accent }}
    >
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: "var(--mk-accent)" }} />
      <div className={cn("flex h-full flex-col", compact ? "gap-2 p-3" : "gap-3 p-5")}>
        <div className="flex items-start justify-between gap-2">
          <span
            className="rounded-sm px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-white uppercase"
            style={{ background: "var(--mk-accent)" }}
          >
            {model.badge}
          </span>
          <span className="max-w-[50%] truncate text-right text-[10px] tracking-wide text-stone-500 uppercase">
            {model.companyName || "Company"}
          </span>
        </div>

        {photos[0] ? (
          <div
            className={cn(
              "overflow-hidden rounded-md bg-stone-200",
              isStory ? "min-h-0 flex-1" : "aspect-[16/10]",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[0]} alt="" className="size-full object-cover" />
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center justify-center rounded-md border border-dashed border-stone-300 bg-stone-100/80 text-[11px] text-stone-500",
              isStory ? "min-h-0 flex-1" : "aspect-[16/10]",
            )}
          >
            Photo from job gallery
          </div>
        )}

        <div className="space-y-1.5">
          <h3
            className={cn(
              "font-heading leading-tight font-semibold tracking-tight text-balance",
              compact ? "text-base" : "text-xl",
            )}
          >
            {model.headline || "Headline"}
          </h3>
          {model.subhead ? <p className="text-sm font-medium text-stone-600">{model.subhead}</p> : null}
          <p className={cn("leading-relaxed text-stone-600", compact ? "text-xs" : "text-sm")}>
            {model.body || "Body copy"}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span
            className="inline-flex rounded-md px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: "var(--mk-accent)" }}
          >
            {model.cta || "Call to action"}
          </span>
          {photos[1] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photos[1]} alt="" className="size-10 rounded-md object-cover" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
