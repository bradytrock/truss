"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { SettingsPageHeader } from "@/components/settings-chrome";
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
      <SettingsPageHeader
        eyebrow="Sales"
        title="Price book"
        description="Line items and lists reps pull into estimates. Change a price here and new estimates pick it up."
      />
      <PriceBookPanel />
    </div>
  );
}
