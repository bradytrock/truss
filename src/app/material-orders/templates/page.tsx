"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import {
  amountForMaterialOrderTemplate,
  materialOrderTemplateLinesFor,
} from "@/lib/material-order-templates";

export default function MaterialOrderTemplatesPage() {
  const crm = useCrm();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(crm.materialOrderTemplates ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((template) => {
        if (!needle) return true;
        return (
          template.name.toLowerCase().includes(needle) ||
          template.description.toLowerCase().includes(needle) ||
          template.vendor.toLowerCase().includes(needle)
        );
      });
  }, [crm.materialOrderTemplates, query]);

  async function createTemplate() {
    setCreating(true);
    try {
      const template = await crm.addMaterialOrderTemplate();
      toast.success("Template opened. Add the materials this job type always needs.");
      router.push(`/material-orders/templates/${template.id}`);
    } catch {
      // Store already toasted.
    } finally {
      setCreating(false);
    }
  }

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Field"
        title="Material order templates"
        description="Company starting points for a hail roof, kitchen, or bath. New orders copy the items, quantities, unit costs, supplier, and notes — then you attach the job."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates"
              className="sm:w-56"
            />
            <Button nativeButton={false} variant="outline" render={<Link href="/jobs" />}>
              Jobs
            </Button>
            <Button disabled={creating} onClick={() => void createTemplate()}>
              {creating ? "Creating…" : "New template"}
            </Button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title={query ? "No templates match that search" : "No company templates yet"}
          description={
            query
              ? "Clear the search."
              : "Build a template here, or open a material order and save it as a template so the next job is not from scratch."
          }
          action={<Button onClick={() => void createTemplate()}>New template</Button>}
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((template) => {
            const lines = materialOrderTemplateLinesFor(
              template.id,
              crm.materialOrderTemplateLines ?? [],
            );
            return (
              <Link
                key={template.id}
                href={`/material-orders/templates/${template.id}`}
                className="block rounded-md border bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{template.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {template.description || template.vendor || "No supplier set"}
                    </p>
                  </div>
                  <p className="font-heading text-base font-medium tabular-nums">
                    {formatMoney(amountForMaterialOrderTemplate(template.id, crm.materialOrderTemplateLines ?? []))}
                  </p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {lines.length} {lines.length === 1 ? "item" : "items"}
                  {template.vendor.trim() ? ` · ${template.vendor}` : ""}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
