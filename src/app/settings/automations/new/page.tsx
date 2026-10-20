"use client";

import { AutomationBuilder } from "@/components/automation-builder";
import { SettingsAdminGate } from "@/components/settings-nav";

export default function NewAutomationPage() {
  return (
    <SettingsAdminGate
      flush
      allowAutomations
      title="Automations are restricted"
      description="Only a company admin, a director, or someone granted manage automations, can build these rules."
    >
      <AutomationBuilder />
    </SettingsAdminGate>
  );
}
