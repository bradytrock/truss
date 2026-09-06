"use client";

import Link from "next/link";
import { EmptyState } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { useMarketing } from "@/lib/marketing/store";
import { MARKETING_TEMPLATE_KIND_LABELS } from "@/lib/marketing/types";

export default function MarketingMaterialsPage() {
  const marketing = useMarketing();

  if (marketing.materials.length === 0) {
    return (
      <EmptyState
        title="No materials yet"
        description="Generate a flyer, social post, door hanger, or partner kit from a template."
        action={
          <Button nativeButton={false} render={<Link href="/marketing/templates" />} size="sm">
            Browse templates
          </Button>
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Material</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Opens</th>
            <th className="px-3 py-2 font-medium">Shares</th>
          </tr>
        </thead>
        <tbody>
          {marketing.materials.map((material) => (
            <tr key={material.id} className="border-t">
              <td className="px-3 py-2">
                <Link href={`/marketing/materials/${material.id}`} className="font-medium hover:text-primary">
                  {material.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">{material.headline}</p>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {MARKETING_TEMPLATE_KIND_LABELS[material.kind]}
              </td>
              <td className="px-3 py-2 capitalize text-muted-foreground">{material.status}</td>
              <td className="px-3 py-2 tabular-nums">{material.views}</td>
              <td className="px-3 py-2 tabular-nums">{material.shares}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
