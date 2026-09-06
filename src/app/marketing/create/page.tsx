"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MarketingGenerator } from "@/components/marketing/generator";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { marketingTemplateById } from "@/lib/marketing/templates";

function CreateInner() {
  const params = useSearchParams();
  const templateId = params.get("template") || "tpl-storm-flyer";
  const jobId = params.get("job") || "";
  const partnerId = params.get("partner") || "";
  const template = marketingTemplateById(templateId);

  if (!template) {
    return (
      <EmptyState
        title="Template not found"
        description="Pick another kit from the gallery."
        action={
          <Button nativeButton={false} render={<Link href="/marketing/templates" />} size="sm">
            Browse templates
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Generate</p>
        <h2 className="font-heading text-2xl font-medium tracking-tight">{template.name}</h2>
        <p className="text-sm text-muted-foreground">{template.summary}</p>
      </div>
      <MarketingGenerator template={template} initialJobId={jobId} initialPartnerId={partnerId} />
    </div>
  );
}

export default function MarketingCreatePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CreateInner />
    </Suspense>
  );
}
