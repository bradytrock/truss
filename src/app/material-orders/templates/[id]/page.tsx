"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MaterialOrderTemplateWriter } from "@/components/material-order-template-writer";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";

export default function MaterialOrderTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const template = crm.getMaterialOrderTemplate(id);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!template) {
    return (
      <EmptyState
        title="Template not found"
        description="It may have been deleted, or the company templates table has not been added in Postgres yet."
        action={
          <Button nativeButton={false} render={<Link href="/material-orders/templates" />}>
            Back to templates
          </Button>
        }
      />
    );
  }

  return <MaterialOrderTemplateWriter template={template} />;
}
