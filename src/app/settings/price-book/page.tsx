"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { PriceBookPanel } from "@/components/price-book-panel";
import { useCrm } from "@/lib/crm-store";
import { canManageSettings } from "@/lib/visibility";

export default function PriceBookSettingsPage() {
  const crm = useCrm();

  if (!crm.hydrated) return <LoadingScreen />;

  if (!crm.viewer || !canManageSettings(crm.viewer.role, crm.viewer)) {
    return (
      <EmptyState
        title="Price book is restricted"
        description="Only a company admin can add, edit, or mass-upload the catalog. Estimators still drop items onto a proposal."
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
        title="Price book"
        description="Company catalog of labor, material, equipment, allowances, and subcontract packages. Each item can carry a margin. Upload a CSV to load the book at once, or add items one at a time."
        actions={
          <Button nativeButton={false} variant="outline" render={<Link href="/settings" />}>
            All settings
          </Button>
        }
      />
      <PriceBookPanel />
    </div>
  );
}
