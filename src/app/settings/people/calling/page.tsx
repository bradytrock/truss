"use client";

import { CallEndpointsSettings } from "@/components/call-endpoints-settings";
import { PeopleSettingsChrome } from "@/components/people-settings-chrome";
import { useCrm } from "@/lib/crm-store";
import { canManageSettings } from "@/lib/visibility";

export default function PeopleCallingSettingsPage() {
  const crm = useCrm();
  const admin = Boolean(crm.viewer && canManageSettings(crm.viewer.role, crm.viewer));
  return (
    <PeopleSettingsChrome
      title="Calling endpoints"
      description="Per-seat softphone, cell, and app ring targets used by inbound queues and transfers."
    >
      {crm.effectiveStaff?.id || crm.user.staffId ? (
        <CallEndpointsSettings
          staff={crm.book.staff}
          currentStaffId={crm.effectiveStaff?.id || crm.user.staffId}
          admin={admin}
        />
      ) : (
        <p className="text-sm text-muted-foreground">This login needs a seat before endpoints can be set.</p>
      )}
    </PeopleSettingsChrome>
  );
}
