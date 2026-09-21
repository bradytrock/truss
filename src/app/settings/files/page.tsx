"use client";

import { SettingsAdminGate } from "@/components/settings-nav";
import { CompanyFilesPanel } from "@/components/company-files";
import { RecordErrorBoundary } from "@/components/record-error-boundary";

export default function CompanyFilesSettingsPage() {
  return (
    <SettingsAdminGate>
      <RecordErrorBoundary
        fallbackTitle="File directory would not open"
        fallbackDescription="A directory row had a bad field. Reload Settings → File directory. Existing files on jobs are unchanged."
      >
        <CompanyFilesPanel />
      </RecordErrorBoundary>
    </SettingsAdminGate>
  );
}
