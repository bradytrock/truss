"use client";

import { SettingsAdminGate } from "@/components/settings-nav";
import { CompanyAuditPanel } from "@/components/company-audit-panel";

export default function CompanyAuditSettingsPage() {
  return (
    <SettingsAdminGate>
      <CompanyAuditPanel />
    </SettingsAdminGate>
  );
}
