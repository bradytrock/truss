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

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Settings"
        title="QuickBooks"
        description="The Web Connector posts approved invoices onto Customer:Job, and job expenses as a check or credit card charge on that same Customer:Job, using the vendor, account, and amount from Truss."
        actions={
          <Button nativeButton={false} variant="outline" render={<Link href="/accounting" />}>
            Accounting
          </Button>
        }
      />
      <QbwcPanel />
    </div>
  );
}
