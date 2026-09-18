"use client";

import { useParams } from "next/navigation";
import { AutomationRuns } from "@/components/automation-runs";
import { SettingsAdminGate } from "@/components/settings-nav";

export default function AutomationRunsPage() {
  const params = useParams<{ id: string }>();
  return (
    <SettingsAdminGate
      allowAutomations
      title="Automations are restricted"
      description="Only a company admin, or someone granted manage automations, can open run history."
    >
      <AutomationRuns automationId={params.id} />
    </SettingsAdminGate>
  );
}
