"use client";

import { DocumentFilesPanel } from "@/components/document-files-panel";
import { useCrm } from "@/lib/crm-store";

export function EstimateFilesPanel({
  estimateId,
  disabled,
}: {
  estimateId: string;
  disabled?: boolean;
}) {
  const crm = useCrm();
  const files = (crm.estimateFiles ?? []).filter((file) => file.estimateId === estimateId);

  return (
    <DocumentFilesPanel
      files={files}
      disabled={disabled}
      emptyHint="Attach from your device or copy a warranty, product sheet, or template from Settings → File directory. Files show on the client proposal."
      audienceHint="shown on the client proposal"
      directoryTitle="Company file directory"
      directoryDescription="Copy a warranty, product sheet, or template onto this estimate. The original stays in Settings → File directory."
      onUpload={(list) => crm.addEstimateFiles(estimateId, list)}
      onPickDirectory={(file) => crm.attachCompanyFileToEstimate(estimateId, file.id)}
      onRemove={(file) => crm.deleteEstimateFile(file.id)}
      onOpened={(file) => {
        void crm.logAudit({
          entityType: "estimate_file",
          entityId: file.id,
          action: "opened",
          after: { name: file.name, url: file.url },
          label: file.name,
        });
      }}
    />
  );
}
