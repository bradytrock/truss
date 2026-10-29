"use client";

import { HubSpotContactsImportWizard } from "@/components/hubspot-contacts-import-wizard";
import { IntegrationSettingsChrome } from "@/components/integration-settings-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";

export default function HubSpotContactsImportPage() {
  return (
    <SettingsAdminGate
      title="HubSpot contacts import is restricted"
      description="Only a company admin can bring another CRM's contacts into this book."
    >
      <IntegrationSettingsChrome
        title="HubSpot contacts import"
        description="Upload a HubSpot contacts export. Match owners to seats and companies to types, check every row, then import — quietly, with each relationship tracked on a business development seat."
      >
        <HubSpotContactsImportWizard />
      </IntegrationSettingsChrome>
    </SettingsAdminGate>
  );
}
