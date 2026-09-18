"use client";

import { AutomationBuilder } from "@/components/automation-builder";
import { SettingsAdminGate } from "@/components/settings-nav";

export default function NewAutomationPage() {
  return (
    <SettingsAdminGate
      allowAutomations
      title="Automations are restricted"
      description="Only a company admin, or someone granted manage automations, can build these rules."
    >
      <AutomationBuilder />
    </SettingsAdminGate>
  );
}
