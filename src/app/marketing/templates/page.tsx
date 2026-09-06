"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MarketingCanvas, templatePreviewModel } from "@/components/marketing/canvas";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { MARKETING_TEMPLATES } from "@/lib/marketing/templates";
import {
  MARKETING_TEMPLATE_KIND_LABELS,
  MARKETING_TEMPLATE_KINDS,
  type MarketingTemplateKind,
} from "@/lib/marketing/types";
import { cn } from "@/lib/utils";

export default function MarketingTemplatesPage() {
  const crm = useCrm();
  const [kind, setKind] = useState<MarketingTemplateKind | "all">("all");
  const templates = useMemo(
    () => (kind === "all" ? MARKETING_TEMPLATES : MARKETING_TEMPLATES.filter((item) => item.kind === kind)),
    [kind],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setKind("all")}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs",
            kind === "all" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
          )}
        >
          All
        </button>
        {MARKETING_TEMPLATE_KINDS.filter((item) => item !== "email_drip" && item !== "sms_drip").map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setKind(item)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs",
              kind === item ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {MARKETING_TEMPLATE_KIND_LABELS[item]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <div key={template.id} className="space-y-3 rounded-lg border p-3">
            <MarketingCanvas model={templatePreviewModel(template, crm.company.name)} compact />
            <div className="space-y-1">
              <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                {MARKETING_TEMPLATE_KIND_LABELS[template.kind]}
                {template.printReady ? " · Print-ready" : ""}
              </p>
              <h2 className="font-heading text-lg font-medium tracking-tight">{template.name}</h2>
              <p className="text-sm text-muted-foreground">{template.summary}</p>
            </div>
            <Button
              nativeButton={false}
              size="sm"
              render={<Link href={`/marketing/create?template=${template.id}`} />}
            >
              Use template
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
