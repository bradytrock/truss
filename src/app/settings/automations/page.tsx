"use client";

import { AutomationList } from "@/components/automation-list";
import { SettingsAdminGate } from "@/components/settings-nav";

export default function AutomationsSettingsPage() {
  return (
    <SettingsAdminGate
      allowAutomations
      title="Automations are restricted"
      description="Only a company admin, or someone granted manage automations, can build these rules."
    >
      <AutomationList />
    </SettingsAdminGate>
  );
}
