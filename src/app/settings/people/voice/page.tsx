"use client";

import { PeopleSettingsChrome } from "@/components/people-settings-chrome";
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
    <PeopleSettingsChrome
      title="Voice"
      description="Give each project manager their own ElevenLabs agent. Missed calls log on the job or open a phone-seed lead. The correct PM is notified — homeowners are never texted."
    >
      <VoiceAgentsSettings staff={crm.book.staff} />
    </PeopleSettingsChrome>
  );
}
