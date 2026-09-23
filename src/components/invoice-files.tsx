"use client";

import { DocumentFilesPanel } from "@/components/document-files-panel";
import { useCrm } from "@/lib/crm-store";

export function InvoiceFilesPanel({
  invoiceId,
  disabled,
}: {
  invoiceId: string;
  disabled?: boolean;
}) {
  const crm = useCrm();
  const files = (crm.invoiceFiles ?? []).filter((file) => file.invoiceId === invoiceId);

  return (
    <DocumentFilesPanel
      files={files}
      disabled={disabled}
      emptyHint="Attach from your device or copy a warranty, product sheet, or template from Settings → File directory."
      directoryTitle="Company file directory"
      directoryDescription="Copy a warranty, product sheet, or template onto this invoice. The original stays in Settings → File directory."
      onUpload={(list) => crm.addInvoiceFiles(invoiceId, list)}
      onPickDirectory={(file) => crm.attachCompanyFileToInvoice(invoiceId, file.id)}
      onRemove={(file) => crm.deleteInvoiceFile(file.id)}
      onOpened={(file) => {
        void crm.logAudit({
          entityType: "invoice_file",
          entityId: file.id,
          action: "opened",
          after: { name: file.name, url: file.url },
          label: file.name,
        });
      }}
    />
  );
}
