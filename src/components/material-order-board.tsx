"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Minus, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/currency-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMoney } from "@/lib/format";
import { moneyAmount } from "@/lib/money-input";
import {
  groupPresentedLines,
  sectionAmount,
  type PresentedMaterialLine,
} from "@/lib/material-order-presentation";
import type { CatalogItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export type MaterialTemplateChoice = {
  id: string;
  name: string;
  detail: string;
};

export function MaterialOrderBoard({
  lines,
  locked,
  supplierName,
  total,
  templates,
  catalog,
  canManagePriceBook,
  onAddFromCatalog,
  onAddCustom,
  onApplyTemplate,
  onUpdate,
  onRemove,
}: {
  lines: PresentedMaterialLine[];
  locked: boolean;
  supplierName: string;
  total: number;
  templates: MaterialTemplateChoice[];
  catalog: CatalogItem[];
  canManagePriceBook: boolean;
  onAddFromCatalog: (catalogItemId: string) => Promise<unknown> | unknown;
  onAddCustom: () => void;
  onApplyTemplate: (templateId: string) => Promise<unknown> | unknown;
  onUpdate: (
    id: string,
    patch: Partial<Pick<PresentedMaterialLine, "name" | "quantity" | "unit" | "unitCost">>,
  ) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [materialsOnly, setMaterialsOnly] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const groups = useMemo(() => groupPresentedLines(lines), [lines]);
  const bookLabel = supplierName === "supplier" ? "the" : supplierName;
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return catalog
      .filter((item) => (materialsOnly ? item.kind === "material" : true))
      .filter((item) => `${item.name} ${item.costCode} ${item.description}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [catalog, materialsOnly, query]);

  async function applyTemplate(templateId: string) {
    setApplying(templateId);
    try {
      await onApplyTemplate(templateId);
      setTemplatesOpen(false);
    } finally {
      setApplying(null);
    }
  }

  return (
    <section className="rounded-xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">Materials</h2>
          <p className="text-sm text-muted-foreground">
            {lines.length === 0 ? "Nothing added yet" : `${lines.length} ${lines.length === 1 ? "item" : "items"}`}
          </p>
        </div>
        {locked ? null : (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-lg bg-card" onClick={() => setTemplatesOpen(true)}>
              Templates
            </Button>
            <Button type="button" variant="outline" size="sm" className="rounded-lg bg-card" onClick={onAddCustom}>
              <Plus data-icon="inline-start" />
              Custom line
            </Button>
          </div>
        )}
      </div>

      {locked ? null : (
        <div className="relative px-4 pb-3">
          <Search className="pointer-events-none absolute top-2.5 left-7 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              supplierName === "supplier"
                ? 'Add from the price book — try "drip edge" or "HDZ"'
                : `Add from ${bookLabel} price book — try "drip edge" or "HDZ"`
            }
            aria-label="Add from the price book"
            className="h-10 rounded-lg pr-10 pl-9"
            onKeyDown={(event) => {
              const first = matches[0];
              if (event.key === "Enter" && first) {
                event.preventDefault();
                void onAddFromCatalog(first.id);
                setQuery("");
              }
            }}
          />
          <Popover>
            <PopoverTrigger
              className={cn(
                "absolute top-1.5 right-6 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
                !materialsOnly && "text-foreground",
              )}
              aria-label="Filter the price book"
            >
              <SlidersHorizontal className="size-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              <button
                type="button"
                className={cn("block w-full rounded-md px-2 py-1.5 text-left text-sm", materialsOnly && "bg-muted")}
                onClick={() => setMaterialsOnly(true)}
              >
                Materials
              </button>
              <button
                type="button"
                className={cn("block w-full rounded-md px-2 py-1.5 text-left text-sm", !materialsOnly && "bg-muted")}
                onClick={() => setMaterialsOnly(false)}
              >
                Whole price book
              </button>
            </PopoverContent>
          </Popover>
          {query.trim() ? (
            <ul className="absolute top-12 right-4 left-4 z-30 max-h-72 overflow-auto rounded-lg border bg-card shadow-lg">
              {matches.length === 0 ? (
                <li className="px-3 py-3 text-sm text-muted-foreground">No price book matches.</li>
              ) : (
                matches.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/70"
                      onClick={() => {
                        void onAddFromCatalog(item.id);
                        setQuery("");
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{item.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[item.costCode, item.unit].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatMoney(item.unitCost)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      )}

      {lines.length === 0 && !locked ? (
        <div className="px-4 pb-4">
          <p className="text-sm font-medium">Start from a template</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick one and tweak quantities, or search the price book above. Costs fill in from your price book
            automatically.
          </p>
          {templates.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No company templates yet.{" "}
              <Link href="/material-orders/templates" className="text-primary hover:underline">
                Build one
              </Link>
              , or save this order from the menu once it has items.
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {templates.slice(0, 3).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  disabled={applying === template.id}
                  onClick={() => void applyTemplate(template.id)}
                  className="rounded-lg border border-dashed px-3 py-3 text-left hover:border-foreground/30 hover:bg-muted/40"
                >
                  <span className="block text-sm font-medium">{template.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{template.detail}</span>
                  <span className="mt-2 block text-sm text-primary">Use template →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto px-2 pb-1">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[minmax(0,1fr)_148px_52px_88px_96px_32px] gap-2 px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              <span>Item</span>
              <span>Qty</span>
              <span>Unit</span>
              <span className="text-right">Unit cost</span>
              <span className="text-right">Total</span>
              <span className="sr-only">Remove</span>
            </div>
            {groups.map((group) => (
              <div key={group.section} className="mb-1">
                <div className="flex items-baseline justify-between px-3 pt-3 pb-1">
                  <p className="text-sm font-semibold">{group.section}</p>
                  <p className="text-sm tabular-nums text-muted-foreground">{formatMoney(sectionAmount(group.lines))}</p>
                </div>
                {group.lines.map((line) => (
                  <MaterialRow
                    key={line.id}
                    line={line}
                    locked={locked}
                    onUpdate={onUpdate}
                    onRemove={onRemove}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
        <p className="text-muted-foreground">
          Unit costs pulled from your {supplierName === "supplier" ? "" : `${supplierName} `}price book
          {canManagePriceBook ? (
            <>
              {" "}
              ·{" "}
              <Link href="/settings/price-book" className="text-primary hover:underline">
                Manage price book
              </Link>
            </>
          ) : null}
        </p>
        <p>
          Materials <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
        </p>
      </div>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start from a template</DialogTitle>
            <DialogDescription>
              Copies items, quantities, and unit costs onto this order. Supplier and notes fill in when those
              fields are still blank.
            </DialogDescription>
          </DialogHeader>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No company templates yet.{" "}
              <Link href="/material-orders/templates" className="text-primary hover:underline" onClick={() => setTemplatesOpen(false)}>
                Build one
              </Link>
              .
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {templates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    disabled={applying === template.id}
                    onClick={() => void applyTemplate(template.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted/50"
                  >
                    <span>
                      <span className="block text-sm font-medium">{template.name}</span>
                      <span className="block text-xs text-muted-foreground">{template.detail}</span>
                    </span>
                    <span className="shrink-0 text-sm text-primary">Use template →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MaterialRow({
  line,
  locked,
  onUpdate,
  onRemove,
}: {
  line: PresentedMaterialLine;
  locked: boolean;
  onUpdate: (
    id: string,
    patch: Partial<Pick<PresentedMaterialLine, "name" | "quantity" | "unit" | "unitCost">>,
  ) => void;
  onRemove: (id: string) => void;
}) {
  const custom = !line.catalogItemId;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_148px_52px_88px_96px_32px] items-center gap-2 border-b border-border/70 px-3 py-2.5">
      <div className="min-w-0">
        {custom && !locked ? (
          <Input
            value={line.name}
            aria-label="Item name"
            placeholder="Item name"
            onChange={(event) => onUpdate(line.id, { name: event.target.value })}
            className="h-8 border-transparent bg-transparent px-0 shadow-none focus-visible:border-input"
          />
        ) : (
          <p className="truncate text-sm font-medium">{line.name || "Untitled"}</p>
        )}
        {line.subtitle ? <p className="truncate text-xs text-muted-foreground">{line.subtitle}</p> : null}
      </div>
      {locked ? (
        <p className="text-sm tabular-nums">{formatQty(line.quantity)}</p>
      ) : (
        <div className="inline-flex h-8 items-center rounded-full border bg-card">
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label={`Decrease quantity for ${line.name || "item"}`}
            onClick={() => onUpdate(line.id, { quantity: Math.max(0, roundQty(line.quantity - 1)) })}
          >
            <Minus className="size-3.5" />
          </button>
          <input
            inputMode="decimal"
            aria-label={`Quantity for ${line.name || "item"}`}
            value={formatQty(line.quantity)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              onUpdate(line.id, { quantity: next });
            }}
            className="w-10 bg-transparent text-center text-sm tabular-nums outline-none"
          />
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label={`Increase quantity for ${line.name || "item"}`}
            onClick={() => onUpdate(line.id, { quantity: roundQty(line.quantity + 1) })}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
      {custom && !locked ? (
        <Input
          value={line.unit}
          aria-label="Unit"
          onChange={(event) => onUpdate(line.id, { unit: event.target.value })}
          className="h-8 px-2"
        />
      ) : (
        <p className="text-sm text-muted-foreground">{line.unit}</p>
      )}
      {custom && !locked ? (
        <CurrencyInput
          value={line.unitCost}
          aria-label="Unit cost"
          className="h-8 text-right"
          onCommit={(text) => {
            const next = moneyAmount(text);
            if (next == null || next === line.unitCost) return;
            onUpdate(line.id, { unitCost: next });
          }}
        />
      ) : (
        <p className="text-right text-sm tabular-nums">{formatMoney(line.unitCost)}</p>
      )}
      <p className="text-right text-sm font-semibold tabular-nums">{formatMoney(line.amount)}</p>
      {locked ? (
        <span />
      ) : (
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Remove ${line.name || "item"}`}
          onClick={() => onRemove(line.id)}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

function roundQty(value: number) {
  return Math.round(value * 100) / 100;
}

function formatQty(value: number) {
  if (Number.isInteger(value)) return String(value);
  return String(roundQty(value));
}
