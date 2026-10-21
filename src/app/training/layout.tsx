"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { canViewTraining } from "@/lib/visibility";

export default function TrainingLayout({ children }: { children: ReactNode }) {
  const crm = useCrm();
  if (!crm.hydrated) return <LoadingScreen />;
  if (!canViewTraining(crm.effectiveStaff?.role)) {
    return (
      <EmptyState
        title="Training stays with the field"
        description="Business development works the pipeline. Training resources are for ops seats."
        action={
          <Link href="/jobs" className="text-sm font-medium text-primary hover:underline">
            Back to jobs
          </Link>
        }
      />
    );
  }
  return children;
}
