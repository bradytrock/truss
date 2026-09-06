"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { MarketingCanvas, materialPreviewModel } from "@/components/marketing/canvas";
import { EmptyState } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { useMarketing } from "@/lib/marketing/store";
import { marketingShareUrl } from "@/lib/marketing/storage";
import { MARKETING_TEMPLATE_KIND_LABELS } from "@/lib/marketing/types";

export default function MarketingMaterialDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const crm = useCrm();
  const marketing = useMarketing();
  const material = marketing.materials.find((item) => item.id === params.id);

  if (!material) {
    return (
      <EmptyState
        title="Material not found"
        description="It may have been removed from this browser’s marketing book."
        action={
          <Button nativeButton={false} render={<Link href="/marketing/materials" />} size="sm">
            Back to materials
          </Button>
        }
      />
    );
  }

  const shareUrl =
    typeof window === "undefined"
      ? marketingShareUrl(material.shareToken)
      : marketingShareUrl(material.shareToken, window.location.origin);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
      <div className="space-y-4">
        <div>
          <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            {MARKETING_TEMPLATE_KIND_LABELS[material.kind]} · {material.status}
          </p>
          <h2 className="font-heading text-2xl font-medium tracking-tight">{material.name}</h2>
          <p className="text-sm text-muted-foreground">
            Created by {material.createdByName} · {material.views} opens · {material.downloads} downloads ·{" "}
            {material.shares} shares
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(
                marketingShareUrl(material.shareToken, window.location.origin),
              );
              marketing.track(material.id, "share");
              toast.success("Share link copied");
            }}
          >
            Copy share link
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              marketing.track(material.id, "download");
              window.print();
            }}
          >
            Print / PDF
          </Button>
          <Button
            nativeButton={false}
            size="sm"
            variant="outline"
            render={<Link href={`/marketing/create?template=${material.templateId}`} />}
          >
            New from template
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              marketing.removeMaterial(material.id);
              toast.message("Material removed");
              router.push("/marketing/materials");
            }}
          >
            Delete
          </Button>
        </div>

        <div className="rounded-lg border bg-card p-4 text-sm leading-relaxed">
          <p className="font-heading text-lg font-medium">{material.headline}</p>
          {material.subhead ? <p className="mt-1 font-medium text-muted-foreground">{material.subhead}</p> : null}
          <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{material.body}</p>
          <p className="mt-4 font-medium text-primary">{material.cta}</p>
          <p className="mt-4 break-all text-xs text-muted-foreground">{shareUrl}</p>
        </div>
      </div>

      <MarketingCanvas model={materialPreviewModel(material, crm.company.name)} />
    </div>
  );
}
