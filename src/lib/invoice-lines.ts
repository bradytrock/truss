import { invoiceLineDescription } from "@/lib/line-format";
import type { Invoice, InvoiceLine, QbSyncStatus } from "@/lib/types";

export type InvoiceLineEditorPatch = Partial<{
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}>;

/** Invoice lines store a title and body in one description, the same way a converted estimate does. */
export function splitInvoiceLine(description: string | null | undefined) {
  const text = String(description ?? "");
  const breakAt = text.indexOf("\n\n");
  if (breakAt === -1) return { title: text, description: "" };
  return {
    title: text.slice(0, breakAt),
    description: text.slice(breakAt + 2),
  };
}

export function invoiceLineEditorModel(line: Pick<InvoiceLine, "description" | "quantity" | "unit" | "unitCost">) {
  const parts = splitInvoiceLine(line.description);
  return {
    title: parts.title,
    description: parts.description,
    quantity: line.quantity,
    unit: line.unit || "LS",
    unitCost: line.unitCost,
    optional: false,
    selected: true,
    taxable: false,
  };
}

export function invoiceLineStoredFromEditor(
  current: Pick<InvoiceLine, "description" | "unit">,
  patch: InvoiceLineEditorPatch,
): Partial<Pick<InvoiceLine, "description" | "quantity" | "unit" | "unitCost">> {
  const parts = splitInvoiceLine(current.description);
  const next: Partial<Pick<InvoiceLine, "description" | "quantity" | "unit" | "unitCost">> = {};
  if (patch.title !== undefined || patch.description !== undefined) {
    next.description = invoiceLineDescription({
      title: patch.title ?? parts.title,
      description: patch.description ?? parts.description,
    });
  }
  if (patch.quantity !== undefined) next.quantity = patch.quantity;
  if (patch.unit !== undefined) next.unit = patch.unit;
  if (patch.unitCost !== undefined) next.unitCost = patch.unitCost;
  return next;
}

export function invoiceEditLock(input: {
  status: Invoice["status"];
  qbStatus: QbSyncStatus;
  paid: number;
}) {
  if (input.status === "void") {
    return { editable: false, canReturnToDraft: false, reason: "Voided invoices stay locked." };
  }
  if (input.paid > 0 || input.status === "paid" || input.status === "partial") {
    return {
      editable: false,
      canReturnToDraft: false,
      reason: "Lines stay locked once a payment is recorded.",
    };
  }
  if (input.qbStatus === "queued" || input.qbStatus === "entered") {
    return {
      editable: false,
      canReturnToDraft: false,
      reason: "Lines stay locked once this invoice is with QuickBooks.",
    };
  }
  if (input.status === "draft") {
    return { editable: true, canReturnToDraft: false, reason: "" };
  }
  return {
    editable: false,
    canReturnToDraft: true,
    reason: "Sent invoices stay as written until you edit them again.",
  };
}
