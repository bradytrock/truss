"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { QbwcPanel } from "@/components/qbwc-panel";
import { useCrm } from "@/lib/crm-store";
import { canManageSettings, canViewAccounting } from "@/lib/visibility";

export default function QuickBooksSettingsPage() {
  const crm = useCrm();
  const viewer = crm.effectiveStaff;

  if (!crm.hydrated) return <LoadingScreen />;

  const canOpen =
    Boolean(viewer && canViewAccounting(viewer.role)) ||
    Boolean(crm.viewer && canManageSettings(crm.viewer.role, crm.viewer));

  if (!canOpen) {
    return (
      <EmptyState
        title="QuickBooks settings are restricted"
        description="Company admin and the Accounting seat set up the Web Connector."
        action={
          <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
            Back to home
          </Button>
        }
      />
    );
  }

  const showSettings = Boolean(crm.viewer && canManageSettings(crm.viewer.role, crm.viewer));

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Settings"
        title="QuickBooks"
        description="The Web Connector posts approved invoices that already have line items onto the matching Customer:Job in QuickBooks Desktop, using the same quantities and rates from Truss."
        actions={
          <div className="flex flex-wrap gap-2">
            {showSettings ? (
              <Button nativeButton={false} variant="outline" render={<Link href="/settings" />}>
                All settings
              </Button>
            ) : null}
            <Button nativeButton={false} variant="outline" render={<Link href="/accounting" />}>
              Accounting
            </Button>
          </div>
        }
      />
      <QbwcPanel />
    </div>
  );
}
