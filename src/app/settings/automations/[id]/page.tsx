"use client";

import { useParams } from "next/navigation";
import { AutomationBuilder } from "@/components/automation-builder";
import { SettingsAdminGate } from "@/components/settings-nav";

export default function EditAutomationPage() {
  const params = useParams<{ id: string }>();
  return (
    <SettingsAdminGate
      allowAutomations
      title="Automations are restricted"
      description="Only a company admin, or someone granted manage automations, can build these rules."
    >
      <AutomationBuilder automationId={params.id} />
    </SettingsAdminGate>
  );
}
