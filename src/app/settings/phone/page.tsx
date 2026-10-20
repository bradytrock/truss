"use client";

import Link from "next/link";
import { CallingSettingsForm } from "@/components/calling-settings";
import { CallingRoutingSettings } from "@/components/calling-routing-settings";
import { CallEndpointsSettings } from "@/components/call-endpoints-settings";
import { VoiceAgentsSettings } from "@/components/voice-agents-settings";
import { SettingsPageHeader } from "@/components/settings-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";
import { useCrm } from "@/lib/crm-store";
import { Button } from "@/components/ui/button";

export default function PhoneSettingsPage() {
  return (
    <SettingsAdminGate
      title="Phone settings are restricted"
      description="Only a company admin can configure the office line, softphone, and voice agents."
    >
      <PhoneSettingsBody />
    </SettingsAdminGate>
  );
}

function PhoneSettingsBody() {
  const crm = useCrm();
  const staffId = crm.effectiveStaff?.id || crm.user.staffId;
  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="Communication"
        title="Phone & texting"
        description="The office line, the softphone, who rings first, and the voice agents that pick up when nobody can."
        actions={
          <Button nativeButton={false} variant="outline" className="rounded-lg bg-white" render={<Link href="/settings/photon" />}>
            Office texts
          </Button>
        }
      />
      <CallingSettingsForm />
      <CallingRoutingSettings staff={crm.book.staff} />
      <VoiceAgentsSettings staff={crm.book.staff} />
      {staffId ? (
        <CallEndpointsSettings staff={crm.book.staff} currentStaffId={staffId} admin />
      ) : (
        <p className="text-sm text-muted-foreground">This login needs a seat before direct lines can be set.</p>
      )}
    </div>
  );
}
