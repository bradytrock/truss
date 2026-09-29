"use client";

import { CompanyStripeSettings } from "@/components/company-stripe-settings";
import { IntegrationSettingsChrome } from "@/components/integration-settings-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";

export default function StripeIntegrationPage() {
  return (
    <SettingsAdminGate
      title="Stripe settings are restricted"
      description="Only a company admin can connect this office's card payments."
    >
      <IntegrationSettingsChrome
        title="Stripe"
        description="Card payments for invoices and optional deposits. Keys lock after they are saved."
      >
        <CompanyStripeSettings />
      </IntegrationSettingsChrome>
    </SettingsAdminGate>
  );
}
