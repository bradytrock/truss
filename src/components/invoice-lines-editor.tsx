"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EstimateAddLine } from "@/components/estimate-add-line";
import { LineCard, PriceBookSheet } from "@/components/estimate-writer";
import { useCrm } from "@/lib/crm-store";
import { invoiceLineEditorModel, invoiceLineStoredFromEditor, splitInvoiceLine } from "@/lib/invoice-lines";

export function InvoiceLinesEditor({ invoiceId }: { invoiceId: string }) {
  const crm = useCrm();
  const [bookOpen, setBookOpen] = useState(false);
  const lines = crm.invoiceLines
    .filter((line) => line.invoiceId === invoiceId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-3">
      {lines.length === 0 ? (
        <div className="border border-dashed px-4 py-8">
          <p className="font-medium">No lines yet</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Search the price book or type a custom item. The sell price is the price book cost plus margin.
          </p>
          <div className="mt-4 max-w-lg">
            <EstimateAddLine
              onPickCatalog={async (id) => {
                const added = await crm.addInvoiceLineFromCatalog(invoiceId, id);
                if (added) toast.success(`Added ${splitInvoiceLine(added.description).title}.`);
              }}
              onCustom={async (title) => {
                await crm.addCustomInvoiceLine(invoiceId, { title });
              }}
              onBrowse={() => setBookOpen(true)}
            />
          </div>
        </div>
      ) : (
        lines.map((line) => (
          <LineCard
            key={line.id}
            line={invoiceLineEditorModel(line)}
            editable
            showTax={false}
            showOptional={false}
            onPatch={(patch) => {
              const stored = invoiceLineStoredFromEditor(line, patch);
              if (Object.keys(stored).length === 0) return;
              void crm.updateInvoiceLine(line.id, stored);
            }}
            onMove={(direction) => void crm.reorderInvoiceLine(line.id, direction)}
            onRemove={() => void crm.removeInvoiceLine(line.id)}
          />
        ))
      )}
      {lines.length > 0 ? (
        <EstimateAddLine
          onPickCatalog={async (id) => {
            const added = await crm.addInvoiceLineFromCatalog(invoiceId, id);
            if (added) toast.success(`Added ${splitInvoiceLine(added.description).title}.`);
          }}
          onCustom={async (title) => {
            await crm.addCustomInvoiceLine(invoiceId, { title });
          }}
          onBrowse={() => setBookOpen(true)}
        />
      ) : null}
      <PriceBookSheet
        open={bookOpen}
        onOpenChange={setBookOpen}
        onPick={async (catalogItemIds) => {
          const added = await crm.addInvoiceLinesFromCatalog(invoiceId, catalogItemIds);
          if (added.length === 1) toast.success("Added 1 item.");
          else if (added.length > 1) toast.success(`Added ${added.length} items.`);
        }}
      />
    </div>
  );
}
