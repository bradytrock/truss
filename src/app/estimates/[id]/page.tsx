"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EstimateWriter } from "@/components/estimate-writer";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";

export default function EstimateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const estimate = crm.getEstimate(id);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!estimate) {
    return (
      <EmptyState
        title="Estimate not found"
        description="It may have been removed when demo data was reset."
        action={
          <Button nativeButton={false} render={<Link href="/estimates" />}>
            Back to estimates
          </Button>
        }
      />
    );
  }

  return <EstimateWriter estimate={estimate} />;
}
