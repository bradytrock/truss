"use client";

import Link from "next/link";
import { MarketingCanvas, templatePreviewModel } from "@/components/marketing/canvas";
import { EmptyState, Metric, MetricStrip } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { useMarketing } from "@/lib/marketing/store";
import { MARKETING_TEMPLATES } from "@/lib/marketing/templates";
import { MARKETING_TEMPLATE_KIND_LABELS } from "@/lib/marketing/types";

export default function MarketingHomePage() {
  const crm = useCrm();
  const marketing = useMarketing();
  const featured = MARKETING_TEMPLATES.filter((template) => template.featured).slice(0, 4);
  const recent = marketing.materials.slice(0, 4);
  const views = marketing.materials.reduce((sum, item) => sum + item.views, 0);
  const shares = marketing.materials.reduce((sum, item) => sum + item.shares, 0);

  return (
    <div className="space-y-8">
      <MetricStrip className="sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Templates" value={String(MARKETING_TEMPLATES.length)} hint="Company-approved starter kits" />
        <Metric label="My materials" value={String(marketing.materials.length)} hint="Generated for jobs and partners" />
        <Metric label="Opens" value={String(views)} hint="Public share-link views" />
        <Metric label="Shares" value={String(shares)} hint="Copied or sent links" />
      </MetricStrip>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-medium">Start from a template</h2>
            <p className="text-sm text-muted-foreground">
              Pick a kit, merge a job or realtor, then export or share.
            </p>
          </div>
          <Button nativeButton={false} render={<Link href="/marketing/templates" />} variant="outline" size="sm">
            All templates
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featured.map((template) => (
            <Link
              key={template.id}
              href={`/marketing/create?template=${template.id}`}
              className="group space-y-2 rounded-lg border p-3 transition-colors hover:bg-muted/40"
            >
              <MarketingCanvas
                model={templatePreviewModel(template, crm.company.name)}
                compact
              />
              <div>
                <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                  {MARKETING_TEMPLATE_KIND_LABELS[template.kind]}
                </p>
                <p className="font-medium tracking-tight group-hover:text-primary">{template.name}</p>
                <p className="text-xs text-muted-foreground">{template.summary}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-medium">My materials</h2>
            <Button nativeButton={false} render={<Link href="/marketing/materials" />} variant="ghost" size="sm">
              View all
            </Button>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              title="No materials yet"
              description="Generate a flyer, social post, or partner kit from a template."
              action={
                <Button nativeButton={false} render={<Link href="/marketing/templates" />} size="sm">
                  Browse templates
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {recent.map((material) => (
                <li key={material.id}>
                  <Link
                    href={`/marketing/materials/${material.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <span className="min-w-0 truncate font-medium">{material.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {material.views} opens · {material.shares} shares
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="font-heading text-lg font-medium">Quick actions</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { href: "/marketing/campaigns", label: "Storm / neighborhood campaign" },
              { href: "/marketing/partners", label: "Realtor co-brand kit" },
              { href: "/marketing/reviews", label: "Review ask pack" },
              { href: "/marketing/assets", label: "Asset library" },
              { href: "/marketing/social", label: "Social calendar" },
              { href: "/marketing/drips", label: "Email & SMS drips" },
              { href: "/marketing/leave-behinds", label: "Leave-behinds" },
              { href: "/marketing/create?template=tpl-case-study", label: "Case study from a job" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
