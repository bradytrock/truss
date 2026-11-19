"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CommitInput } from "@/components/commit-input";
import { CurrencyInput } from "@/components/currency-input";
import { EstimateAddLine } from "@/components/estimate-add-line";
import { PriceBookSheet } from "@/components/estimate-writer";
import { FormattedTextEditor } from "@/components/formatted-text-editor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrm } from "@/lib/crm-store";
import { COMMON_UNITS } from "@/lib/estimate-totals";
import { formatMoney } from "@/lib/format";
import {
  invoiceLineEditorModel,
  invoiceLineStoredFromEditor,
  splitInvoiceLine,
  type InvoiceLineEditorPatch,
} from "@/lib/invoice-lines";
import { firstPlainLine } from "@/lib/line-format";
import { lineAmount, sumLines } from "@/lib/money";
import { moneyAmount } from "@/lib/money-input";
import type { InvoiceLine } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROW_GRID = "md:grid-cols-[minmax(0,1fr)_7.5rem_7.25rem_6.5rem_2rem]";

const QUIET_INPUT =
  "h-7 rounded-sm border-0 bg-transparent px-1 shadow-none focus-visible:bg-muted/60 focus-visible:ring-0 disabled:pointer-events-auto disabled:bg-transparent disabled:text-foreground disabled:opacity-100";

export function InvoiceLinesEditor({
  invoiceId,
  editable = true,
}: {
  invoiceId: string;
  editable?: boolean;
}) {
  const crm = useCrm();
  const [bookOpen, setBookOpen] = useState(false);
  const lines = crm.invoiceLines
    .filter((line) => line.invoiceId === invoiceId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const total = sumLines(lines);

  function patchLine(line: InvoiceLine, patch: InvoiceLineEditorPatch) {
    const stored = invoiceLineStoredFromEditor(line, patch);
    if (Object.keys(stored).length === 0) return;
    void crm.updateInvoiceLine(line.id, stored);
  }

  return (
    <section className="rounded-[12px] border bg-card">
      <header className="flex items-start gap-3 px-4 pt-3 pb-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Line items</h2>
          <p className="text-xs text-muted-foreground">
            {lines.length === 0 ? "No items yet" : `${lines.length} item${lines.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <p className="pt-1 text-[15px] font-semibold tabular-nums">{formatMoney(total)}</p>
      </header>

      <div
        className={cn(
          "hidden items-center gap-x-3 border-y bg-muted/40 px-4 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase md:grid",
          ROW_GRID,
        )}
      >
        <span>Item</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit price</span>
        <span className="text-right">Total</span>
        <span />
      </div>

      {lines.length === 0 ? (
        <p className="border-t px-4 py-4 text-sm text-muted-foreground">
          {editable ? "Nothing on this invoice yet. Add from the price book below." : "No line items."}
        </p>
      ) : (
        <ul>
          {lines.map((line, index) => (
            <InvoiceLineRow
              key={line.id}
              line={line}
              editable={editable}
              first={index === 0}
              last={index === lines.length - 1}
              onPatch={(patch) => patchLine(line, patch)}
              onMove={(direction) => void crm.reorderInvoiceLine(line.id, direction)}
              onRemove={() => void crm.removeInvoiceLine(line.id)}
            />
          ))}
        </ul>
      )}

      {editable ? (
        <footer className="rounded-b-[12px] border-t bg-muted/20 px-3 py-2">
          <EstimateAddLine
            placeholder="Add from price book or type a custom item"
            onPickCatalog={async (id) => {
              const added = await crm.addInvoiceLineFromCatalog(invoiceId, id);
              if (added) toast.success(`Added ${splitInvoiceLine(added.description).title}.`);
            }}
            onCustom={async (title) => {
              await crm.addCustomInvoiceLine(invoiceId, { title });
            }}
            onBrowse={() => setBookOpen(true)}
          />
        </footer>
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
    </section>
  );
}

function InvoiceLineRow({
  line,
  editable,
  first,
  last,
  onPatch,
  onMove,
  onRemove,
}: {
  line: InvoiceLine;
  editable: boolean;
  first: boolean;
  last: boolean;
  onPatch: (patch: InvoiceLineEditorPatch) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const model = invoiceLineEditorModel(line);
  const units = COMMON_UNITS.includes(model.unit) ? COMMON_UNITS : [model.unit, ...COMMON_UNITS];
  const preview = firstPlainLine(model.description);
  const amount = lineAmount(line);

  const qtyAndUnit = editable ? (
    <span className="inline-flex items-center justify-end">
      <CommitInput
        type="number"
        min={0}
        step="0.01"
        aria-label="Quantity"
        className={cn(QUIET_INPUT, "w-[3.6rem] text-right tabular-nums")}
        value={model.quantity}
        onCommit={(value) => {
          const quantity = Math.max(0, Number(value) || 0);
          if (quantity !== model.quantity) onPatch({ quantity });
        }}
      />
      <Select
        value={model.unit}
        onValueChange={(value) => onPatch({ unit: String(value ?? model.unit) })}
        items={units.map((unit) => ({ value: unit, label: unit.toUpperCase() }))}
      >
        <SelectTrigger
          size="sm"
          aria-label="Unit"
          className="h-7 w-fit gap-0.5 border-0 bg-transparent px-1 text-xs shadow-none hover:bg-muted/60 [&_svg]:size-3"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {units.map((unit) => (
            <SelectItem key={unit} value={unit}>
              {unit.toUpperCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  ) : (
    <span className="text-sm tabular-nums">
      {model.quantity} {model.unit.toUpperCase()}
    </span>
  );

  const unitPrice = (
    <CurrencyInput
      disabled={!editable}
      aria-label="Unit price"
      className={cn(QUIET_INPUT, "w-full text-right tabular-nums")}
      value={model.unitCost}
      onCommit={(text) => {
        const unitCost = moneyAmount(text) ?? 0;
        if (unitCost !== model.unitCost) onPatch({ unitCost });
      }}
    />
  );

  return (
    <li className="group/row border-t md:first:border-t-0">
      <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2", ROW_GRID)}>
        <div className="min-w-0">
          <CommitInput
            aria-label="Item"
            placeholder="Item name"
            disabled={!editable}
            className={cn(QUIET_INPUT, "-ml-1 w-full text-sm font-medium")}
            value={model.title}
            onCommit={(value) => {
              if (value !== model.title) onPatch({ title: value });
            }}
          />
          <button
            type="button"
            className="-ml-px flex max-w-full items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="truncate">{preview || (editable ? "Add a description" : "No description")}</span>
            <ChevronDown className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")} />
          </button>
        </div>

        <div className="hidden justify-end md:flex">{qtyAndUnit}</div>
        <div className="hidden md:block">{unitPrice}</div>
        <p className="text-right text-sm font-semibold tabular-nums">{formatMoney(amount)}</p>
        <div className="hidden justify-end md:flex">
          {editable ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`${model.title || "Item"} actions`}
                    className="text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setOpen((value) => !value)}>
                  {open ? "Hide description" : "Description"}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={first} onClick={() => onMove("up")}>
                  <ArrowUp />
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={last} onClick={() => onMove("down")}>
                  <ArrowDown />
                  Move down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onRemove}>
                  <Trash2 />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 md:hidden">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">Qty {qtyAndUnit}</span>
        <span className="flex w-36 items-center gap-1 text-xs text-muted-foreground">Price {unitPrice}</span>
        {editable ? (
          <span className="ml-auto flex">
            <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={first} onClick={() => onMove("up")}>
              <ArrowUp />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={last} onClick={() => onMove("down")}>
              <ArrowDown />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Remove item" onClick={onRemove}>
              <Trash2 />
            </Button>
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-1 border-t bg-muted/20 px-4 py-3">
          <Label className="text-xs text-muted-foreground">What the homeowner reads under the title</Label>
          <FormattedTextEditor
            value={model.description}
            disabled={!editable}
            placeholder="Scope, materials, or what this line covers"
            onCommit={(value) => {
              if (value !== model.description) onPatch({ description: value });
            }}
          />
        </div>
      ) : null}
    </li>
  );
}
