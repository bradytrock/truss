"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import { currentCatalog } from "@/lib/price-lists";
import { CATALOG_KIND_LABELS, type CatalogKind } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";
import { lineAmount } from "@/lib/money";

export type MaterialListLine = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
};

export function MaterialOrderItems({
  lines,
  emptyHint,
  onAddFromCatalog,
  onAddCustom,
  onUpdate,
  onRemove,
}: {
  lines: MaterialListLine[];
  emptyHint: string;
  onAddFromCatalog: (catalogItemId: string) => Promise<unknown> | unknown;
  onAddCustom: () => void;
  onUpdate: (id: string, patch: Partial<Pick<MaterialListLine, "name" | "quantity" | "unit" | "unitCost">>) => void;
  onRemove: (id: string) => void;
}) {
  const crm = useCrm();
  const [bookOpen, setBookOpen] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] uppercase">Items</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setBookOpen(true)}>
            Add from price book
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onAddCustom}>
            Custom item
          </Button>
        </div>
      </div>
      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
          {emptyHint}
        </p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li key={line.id} className="rounded-md border p-3">
              <div className="flex items-start gap-2">
                <Input
                  value={line.name}
                  onChange={(event) => onUpdate(line.id, { name: event.target.value })}
                  placeholder="Item name"
                  className="min-w-0 flex-1"
                  aria-label="Item name"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label="Remove item"
                  onClick={() => onRemove(line.id)}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-[auto_1fr_1fr] items-end gap-2 sm:grid-cols-[auto_7rem_7rem_1fr]">
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">Qty</p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Decrease quantity"
                      onClick={() =>
                        onUpdate(line.id, {
                          quantity: Math.max(0, Math.round((line.quantity - 1) * 100) / 100),
                        })
                      }
                    >
                      <Minus />
                    </Button>
                    <Input
                      inputMode="decimal"
                      value={String(line.quantity)}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (!Number.isFinite(next)) return;
                        onUpdate(line.id, { quantity: next });
                      }}
                      className="h-7 w-14 px-1 text-center tabular-nums"
                      aria-label="Quantity"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Increase quantity"
                      onClick={() =>
                        onUpdate(line.id, {
                          quantity: Math.round((line.quantity + 1) * 100) / 100,
                        })
                      }
                    >
                      <Plus />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">Unit</p>
                  <Input
                    value={line.unit}
                    onChange={(event) => onUpdate(line.id, { unit: event.target.value })}
                    aria-label="Unit"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">Unit cost</p>
                  <Input
                    inputMode="decimal"
                    value={String(line.unitCost)}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next)) return;
                      onUpdate(line.id, { unitCost: next });
                    }}
                    aria-label="Unit cost"
                    className="tabular-nums"
                  />
                </div>
                <p className="hidden text-right text-sm font-medium tabular-nums sm:block">
                  {formatMoney(lineAmount(line))}
                </p>
              </div>
              <p className="mt-2 text-right text-sm font-medium tabular-nums sm:hidden">
                {formatMoney(lineAmount(line))}
              </p>
            </li>
          ))}
        </ul>
      )}
      <MaterialPriceBookSheet
        open={bookOpen}
        onOpenChange={setBookOpen}
        onPick={async (catalogItemId) => {
          const item = crm.catalog.find((entry) => entry.id === catalogItemId);
          await onAddFromCatalog(catalogItemId);
          toast.message(`${item?.name ?? "Item"} added`);
        }}
      />
    </section>
  );
}

function MaterialPriceBookSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (catalogItemId: string) => void | Promise<void>;
}) {
  const { catalog, viewer, priceLists } = useCrm();
  const items = useMemo(() => currentCatalog(catalog, priceLists ?? []), [catalog, priceLists]);
  const [kindFilter, setKindFilter] = useState<"material" | "all">("material");
  const groups = useMemo(() => {
    const source =
      kindFilter === "material" ? items.filter((item) => item.kind === "material") : items;
    const kinds = Array.from(new Set(source.map((item) => item.kind))) as CatalogKind[];
    return kinds.map((kind) => ({
      kind,
      items: source.filter((item) => item.kind === kind),
    }));
  }, [items, kindFilter]);
  const emptyBook = items.length === 0;
  const noMaterials = !emptyBook && kindFilter === "material" && groups.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Price book</SheetTitle>
          <SheetDescription>
            Costs copy onto this list from the catalog. Add as many items as you need, then close the
            book and set quantities.
          </SheetDescription>
        </SheetHeader>
        <div className="flex gap-2 px-4 pb-2">
          <Button
            type="button"
            size="sm"
            variant={kindFilter === "material" ? "secondary" : "ghost"}
            onClick={() => setKindFilter("material")}
          >
            Materials
          </Button>
          <Button
            type="button"
            size="sm"
            variant={kindFilter === "all" ? "secondary" : "ghost"}
            onClick={() => setKindFilter("all")}
          >
            Whole book
          </Button>
        </div>
        <Command className="min-h-0 flex-1 border-0 bg-transparent p-0">
          <div className="px-4">
            <CommandInput placeholder="Search the book" />
          </div>
          <CommandList className="max-h-none flex-1 px-2">
            <CommandEmpty>
              {emptyBook
                ? "Price book is empty. A company admin can upload a pricing sheet under Settings → Price book."
                : noMaterials
                  ? "No material items in the book. Switch to Whole book, or upload materials as kind material."
                  : "No items match that search."}
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.kind} heading={CATALOG_KIND_LABELS[group.kind]}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.costCode} ${item.name}`}
                    onSelect={() => {
                      void onPick(item.id);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p>{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.costCode} · {item.unit}
                      </p>
                    </div>
                    <span className="tabular-nums text-muted-foreground">{formatMoney(item.unitCost)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div className="border-t px-4 py-3">
          {viewer && canManageSettings(viewer.role, viewer) ? (
            <Link
              href="/settings/price-book"
              className="text-sm text-primary hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Upload or edit the price book
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">
              A company admin uploads the pricing sheet under Settings → Price book.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
