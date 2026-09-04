"use client";

import { SettingsAdminGate } from "@/components/settings-nav";
import { CompanyFilesPanel } from "@/components/company-files";

export default function CompanyFilesSettingsPage() {
  return (
    <SettingsAdminGate>
      <CompanyFilesPanel />
    </SettingsAdminGate>
  );
}
