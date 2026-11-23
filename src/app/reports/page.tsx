"use client";

import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { ReportsDashboard } from "@/components/reports-dashboard";
import { useCrm } from "@/lib/crm-store";
import { canViewReports } from "@/lib/visibility";

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ReportsPageInner />
    </Suspense>
  );
}

function ReportsPageInner() {
  const crm = useCrm();
  const viewer = crm.effectiveStaff;

  if (!crm.hydrated) return <LoadingScreen />;

  if (!viewer || !canViewReports(viewer.role)) {
    return (
      <EmptyState
        title="Reports are restricted"
        description="Project managers and field seats work from their own jobs. Company admin, directors, business development, team leads, and accounting run reports — each only on the book their seat can see."
        action={
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        }
      />
    );
  }

  return (
    <ReportsDashboard
      viewer={viewer}
      book={crm.book}
      companyName={crm.company.name}
      hydrateError={crm.hydrateError}
      onReload={() => void crm.reload()}
    />
  );
}
