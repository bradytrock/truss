"use client";

import Link from "next/link";
import { CallEndpointsSettings } from "@/components/call-endpoints-settings";
import { SettingsPageHeader } from "@/components/settings-chrome";
import { useCrm } from "@/lib/crm-store";
import { canManageSettings } from "@/lib/visibility";

export default function PeopleCallingSettingsPage() {
  const crm = useCrm();
  const admin = Boolean(crm.viewer && canManageSettings(crm.viewer.role, crm.viewer));
  return (
    <div className="space-y-5">
      <SettingsPageHeader
        eyebrow="Communication"
        title="Direct lines"
        description="Per-seat softphone, cell, and app ring targets used by inbound queues and transfers."
        actions={
          <Link href="/settings/phone" className="text-sm font-medium text-primary hover:underline">
            Phone & texting
          </Link>
        }
      />
      {crm.effectiveStaff?.id || crm.user.staffId ? (
        <CallEndpointsSettings
          staff={crm.book.staff}
          currentStaffId={crm.effectiveStaff?.id || crm.user.staffId}
          admin={admin}
        />
      ) : (
        <p className="text-sm text-muted-foreground">This login needs a seat before endpoints can be set.</p>
      )}
    </div>
  );
}
