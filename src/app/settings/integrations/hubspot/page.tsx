"use client";

import { HubSpotImportWizard } from "@/components/hubspot-import-wizard";
import { IntegrationSettingsChrome } from "@/components/integration-settings-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";

export default function HubSpotImportPage() {
  return (
    <SettingsAdminGate
      title="HubSpot import is restricted"
      description="Only a company admin can bring another CRM's deals into this book."
    >
      <IntegrationSettingsChrome
        title="HubSpot import"
        description="Upload a HubSpot deals export. Map its stages and owners to this board, check every row, then import — quietly, with each deal on the right person's book and anyone else named on the job."
      >
        <HubSpotImportWizard />
      </IntegrationSettingsChrome>
    </SettingsAdminGate>
  );
}
