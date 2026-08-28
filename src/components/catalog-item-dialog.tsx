"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import {
  catalogProposalUnitPrice,
  clampMarginPercent,
  effectiveCatalogMargin,
  formatMarginPercent,
} from "@/lib/catalog-margin";
import { formatMoney } from "@/lib/format";
import {
  CATALOG_KIND_LABELS,
  CATALOG_KINDS,
  type CatalogItem,
  type CatalogKind,
} from "@/lib/types";

type Draft = {
  name: string;
  kind: CatalogKind;
  unit: string;
  unitCost: string;
  marginPercent: string;
  costCode: string;
};

const emptyDraft: Draft = {
  name: "",
  kind: "labor",
  unit: "ea",
  unitCost: "0",
  marginPercent: "0",
  costCode: "",
};

function draftFromItem(item: CatalogItem): Draft {
  return {
    name: item.name,
    kind: item.kind,
    unit: item.unit,
    unitCost: String(item.unitCost),
    marginPercent: String(item.marginPercent),
    costCode: item.costCode,
  };
}

function parseCost(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function parseMargin(value: string) {
  const n = Number(value.replace(/%/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return clampMarginPercent(n);
}

export function CatalogItemDialog({
  open,
  onOpenChange,
  item,
  priceListId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: CatalogItem | null;
  priceListId?: string | null;
}) {
  const crm = useCrm();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pending, setPending] = useState(false);
  const editing = Boolean(item);
  const units = Array.from(new Set([...COMMON_UNITS, draft.unit].filter(Boolean)));
  const itemMargin = parseMargin(draft.marginPercent);
  const floor = crm.company.minimumMarginPercent ?? 0;
  const effective = effectiveCatalogMargin(itemMargin, floor);
  const sell = catalogProposalUnitPrice(
    { unitCost: parseCost(draft.unitCost), marginPercent: itemMargin },
    crm.company,
  );

  useEffect(() => {
    if (!open) return;
    setDraft(item ? draftFromItem(item) : emptyDraft);
  }, [item, open]);

  async function save() {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Name the item so estimators can find it.");
      return;
    }
    setPending(true);
    try {
      const payload = {
        name,
        kind: draft.kind,
        unit: draft.unit.trim() || "ea",
        unitCost: parseCost(draft.unitCost),
        marginPercent: parseMargin(draft.marginPercent),
        costCode: draft.costCode.trim(),
      };
      if (item) {
        await crm.updateCatalogItem(item.id, payload);
        toast.success("Price book item updated.");
      } else {
        await crm.addCatalogItem({ ...payload, priceListId });
        toast.success("Added to the price book.");
      }
      onOpenChange(false);
    } catch {
      // Store already toasted.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit price book item" : "New price book item"}</DialogTitle>
          <DialogDescription>
            Drop this onto a proposal and the sell price is unit cost plus margin, at least the company
            minimum. Quantity and price stay editable on the estimate.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="catalog-name">Name</Label>
            <Input
              id="catalog-name"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Architectural shingles"
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Kind</Label>
              <Select
                value={draft.kind}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    kind: (CATALOG_KINDS.includes(value as CatalogKind) ? value : current.kind) as CatalogKind,
                  }))
                }
                items={CATALOG_KINDS.map((kind) => ({
                  value: kind,
                  label: CATALOG_KIND_LABELS[kind],
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATALOG_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {CATALOG_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Unit</Label>
              <Select
                value={draft.unit}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, unit: String(value ?? current.unit) }))
                }
                items={units.map((unit) => ({ value: unit, label: unit }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="catalog-cost">Unit cost</Label>
              <Input
                id="catalog-cost"
                type="number"
                min={0}
                step="0.01"
                value={draft.unitCost}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, unitCost: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="catalog-margin">Margin</Label>
              <div className="relative">
                <Input
                  id="catalog-margin"
                  type="number"
                  min={0}
                  max={1000}
                  step="0.01"
                  className="pr-8"
                  value={draft.marginPercent}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, marginPercent: event.target.value }))
                  }
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Proposal price {formatMoney(sell)}
            {effective > 0 ? ` at ${formatMarginPercent(effective)}` : ""}
            {floor > itemMargin
              ? ` (company minimum ${formatMarginPercent(floor)})`
              : ""}
            . Changing this does not rewrite lines already on a proposal.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="catalog-code">Cost code</Label>
            <Input
              id="catalog-code"
              value={draft.costCode}
              onChange={(event) =>
                setDraft((current) => ({ ...current, costCode: event.target.value }))
              }
              placeholder="07 31 13"
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={() => void save()}>
            {pending ? "Saving…" : editing ? "Save item" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
