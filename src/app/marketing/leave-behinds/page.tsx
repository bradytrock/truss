"use client";

import Link from "next/link";
import { MarketingCanvas, templatePreviewModel } from "@/components/marketing/canvas";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { MARKETING_TEMPLATES } from "@/lib/marketing/templates";

export default function MarketingLeaveBehindsPage() {
  const crm = useCrm();
  const leaveBehinds = MARKETING_TEMPLATES.filter(
    (template) => template.kind === "leave_behind" || template.kind === "case_study",
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-medium">Leave-behinds</h2>
        <p className="text-sm text-muted-foreground">
          Warranty, financing, and case-study one-pagers for estimates and walkthroughs.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {leaveBehinds.map((template) => (
          <div key={template.id} className="space-y-3 rounded-lg border p-3">
            <MarketingCanvas model={templatePreviewModel(template, crm.company.name)} compact />
            <div>
              <h3 className="font-medium tracking-tight">{template.name}</h3>
              <p className="text-sm text-muted-foreground">{template.summary}</p>
            </div>
            <Button
              nativeButton={false}
              size="sm"
              render={<Link href={`/marketing/create?template=${template.id}`} />}
            >
              Generate
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
