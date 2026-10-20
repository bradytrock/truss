"use client";

import Link from "next/link";
import { SettingsPageHeader } from "@/components/settings-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";
import { VoiceAgentsSettings } from "@/components/voice-agents-settings";
import { useCrm } from "@/lib/crm-store";

export default function PeopleVoiceSettingsPage() {
  return (
    <SettingsAdminGate>
      <PeopleVoiceSettingsBody />
    </SettingsAdminGate>
  );
}

function PeopleVoiceSettingsBody() {
  const crm = useCrm();
  return (
    <div className="space-y-5">
      <SettingsPageHeader
        eyebrow="Communication"
        title="Voice agents"
        description="Give each project manager their own agent. Missed calls log on the job or open a phone-seed lead. The correct PM is notified — homeowners are never texted."
        actions={
          <Link href="/settings/phone" className="text-sm font-medium text-primary hover:underline">
            Phone & texting
          </Link>
        }
      />
      <VoiceAgentsSettings staff={crm.book.staff} />
    </div>
  );
}
