"use client";

import { CallingSettingsForm } from "@/components/calling-settings";
import { CallingRoutingSettings } from "@/components/calling-routing-settings";
import { PageHeader } from "@/components/page-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";
import { useCrm } from "@/lib/crm-store";

export default function CallingSettingsPage() {
  return (
    <SettingsAdminGate
      title="Calling settings are restricted"
      description="Only a company admin can configure Photon + LiveKit calling."
    >
      <CallingSettingsBody />
    </SettingsAdminGate>
  );
}

function CallingSettingsBody() {
  const crm = useCrm();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Calling"
        description="Photon Spectrum Voice over LiveKit Cloud SIP. Web softphones, staff cells, and queues share one office line."
      />
      <CallingSettingsForm />
      <CallingRoutingSettings staff={crm.book.staff} />
    </div>
  );
}
