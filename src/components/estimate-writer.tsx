"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import { CommitInput } from "@/components/commit-input";
import { CurrencyInput } from "@/components/currency-input";
import { FormattedTextEditor } from "@/components/formatted-text-editor";
import { EstimateLinePhotos } from "@/components/estimate-line-photos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCrm } from "@/lib/crm-store";
import { COMMON_UNITS, lineAmount, type AdjustmentKind } from "@/lib/estimate-totals";
import {
  ESTIMATE_PACKAGES,
  PACKAGE_LABEL,
  linePackageFromSelect,
  linePackageSelectValue,
  parseEstimatePackage,
  parseLinePackage,
} from "@/lib/estimate-packages";
import {
  COVERAGE_PREVIEW_SQUARES,
  EAGLEVIEW_COVERAGE_UNITS,
  EAGLEVIEW_MEASUREMENT_OPTIONS,
  defaultCoverageUnitForMeasurements,
  formatCoverageLabel,
  formatMeasurementMappingLabel,
  parseMeasurementKeys,
  previewCoverageQuantity,
} from "@/lib/eagleview-formulas";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMoney } from "@/lib/format";
import { moneyAmount } from "@/lib/money-input";
import {
  catalogProposalUnitPrice,
  effectiveCatalogMargin,
  formatMarginPercent,
} from "@/lib/catalog-margin";
import { addItemsLabel, toggleSelectedId } from "@/lib/catalog-pick";
import { currentCatalog } from "@/lib/price-lists";
import { CATALOG_KIND_LABELS, type CatalogKind, type EstimateLine, type JobPhoto } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";
import { cn } from "@/lib/utils";

export { CommitInput, CommitTextarea } from "@/components/commit-input";

export function PriceBookSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (catalogItemIds: string[]) => void | Promise<void>;
}) {
  const { catalog, company, viewer, priceLists } = useCrm();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const items = useMemo(() => currentCatalog(catalog, priceLists ?? []), [catalog, priceLists]);
  const groups = useMemo(() => {
    const kinds = Array.from(new Set(items.map((item) => item.kind))) as CatalogKind[];
    return kinds.map((kind) => ({
      kind,
      items: items.filter((item) => item.kind === kind),
    }));
  }, [items]);

  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setAdding(false);
    }
  }, [open]);

  function toggle(id: string) {
    setSelectedIds((prev) => toggleSelectedId(prev, id));
  }

  async function addSelected() {
    if (selectedIds.length === 0 || adding) return;
    setAdding(true);
    try {
      await onPick(selectedIds);
      setSelectedIds([]);
    } finally {
      setAdding(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Price book</SheetTitle>
          <SheetDescription>
            Check every catalog item you want, then add them together. The sheet stays open so you can
            add another batch without starting over. Price is unit cost plus the item’s margin, at least
            the company minimum.
          </SheetDescription>
        </SheetHeader>
        <Command className="min-h-0 flex-1 border-0 bg-transparent p-0">
          <div className="px-4">
            <CommandInput placeholder="Search the book" />
          </div>
          <CommandList className="max-h-none flex-1 px-2">
            <CommandEmpty>
              {items.length === 0
                ? catalog.length === 0
                  ? "Price book is empty. A company admin can load it under Settings → Price book."
                  : "The current price list is empty. A company admin can add items under Settings → Price book."
                : "No items match that search."}
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.kind} heading={CATALOG_KIND_LABELS[group.kind]}>
                {group.items.map((item) => {
                  const checked = selectedIds.includes(item.id);
                  return (
                    <CommandItem
                      key={item.id}
                      value={`${item.costCode} ${item.name}`}
                      onSelect={() => toggle(item.id)}
                    >
                      <Checkbox
                        checked={checked}
                        tabIndex={-1}
                        className="pointer-events-none"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p>{item.name}</p>
                        {item.description ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          {item.costCode} · {item.unit}
                          {effectiveCatalogMargin(item.marginPercent, company.minimumMarginPercent) > 0
                            ? ` · ${formatMoney(item.unitCost)} cost`
                            : ""}
                        </p>
                      </div>
                      <span className="tabular-nums text-muted-foreground">
                        {formatMoney(catalogProposalUnitPrice(item, company))}
                        {effectiveCatalogMargin(item.marginPercent, company.minimumMarginPercent) > 0 ? (
                          <span className="ml-1 text-xs">
                            {formatMarginPercent(
                              effectiveCatalogMargin(item.marginPercent, company.minimumMarginPercent),
                            )}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
          {viewer && canManageSettings(viewer.role, viewer) ? (
            <Link
              href="/settings/price-book"
              className="text-sm text-primary hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Manage the price book
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">A company admin manages the catalog in Settings.</p>
          )}
          <Button
            type="button"
            size="sm"
            disabled={selectedIds.length === 0 || adding}
            onClick={() => void addSelected()}
          >
            {adding ? "Adding…" : addItemsLabel(selectedIds.length)}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type PricedLine = {
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  optional: boolean;
  selected: boolean;
  taxable: boolean;
  package?: string;
  /** EagleView qty formula used when applying measurements (advanced). */
  quantityFormula?: string;
  measurementKeys?: string[];
  coverageAmount?: number;
  coverageUnit?: string;
};

export function LineCard({
  line,
  editable,
  showTax,
  showOptional = true,
  showPackage,
  showQuantityFormula,
  onPatch,
  onMove,
  onRemove,
  galleryPhotos,
  galleryHint,
  onPhotosChange,
}: {
  line: PricedLine & { photoIds?: string[]; photos?: EstimateLine["photos"] };
  editable: boolean;
  showTax: boolean;
  /** Invoices bill every line. Estimates can mark a line optional. */
  showOptional?: boolean;
  showPackage?: boolean;
  /** Template editor: bind qty to EagleView measurements. */
  showQuantityFormula?: boolean;
  onPatch: (patch: Partial<PricedLine>) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  galleryPhotos?: JobPhoto[];
  galleryHint?: string;
  onPhotosChange?: (photoIds: string[]) => void;
}) {
  const units = COMMON_UNITS.includes(line.unit) ? COMMON_UNITS : [line.unit, ...COMMON_UNITS];
  const measurementKeys = parseMeasurementKeys(line.measurementKeys);
  const coverageAmount =
    line.coverageAmount != null && Number.isFinite(line.coverageAmount) ? line.coverageAmount : 1;
  const coverageUnit = line.coverageUnit || defaultCoverageUnitForMeasurements(measurementKeys);
  const coveragePreview =
    showQuantityFormula && measurementKeys.length > 0
      ? previewCoverageQuantity({ measurementKeys, coverageAmount, coverageUnit })
      : null;
  const [detailsOpen, setDetailsOpen] = useState(Boolean(showQuantityFormula));
  const notePreview = line.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const photoCount = line.photoIds?.length || line.photos?.length || 0;

  function toggleMeasurementKey(key: string, checked: boolean) {
    const next = checked
      ? parseMeasurementKeys([...measurementKeys, key])
      : measurementKeys.filter((item) => item !== key);
    onPatch({
      measurementKeys: next,
      coverageUnit: next.length
        ? defaultCoverageUnitForMeasurements(next)
        : line.coverageUnit || "squares",
      coverageAmount: line.coverageAmount ?? 1,
    });
  }

  const qtyFields = (
    <>
      <CommitInput
        type="number"
        min={0}
        step="0.01"
        disabled={!editable}
        aria-label="Quantity"
        className="h-8 w-[4.5rem]"
        value={line.quantity}
        onCommit={(value) => onPatch({ quantity: Number(value) || 0 })}
      />
      {editable ? (
        <Select
          value={line.unit}
          onValueChange={(value) => onPatch({ unit: String(value ?? line.unit) })}
          items={units.map((unit) => ({ value: unit, label: unit }))}
        >
          <SelectTrigger size="sm" className="w-[4.75rem]" aria-label="Unit">
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
      ) : (
        <p className="w-[4.75rem] text-sm">{line.unit}</p>
      )}
      <CurrencyInput
        disabled={!editable}
        aria-label="Unit price"
        className="h-8 w-[8.25rem] text-right"
        value={line.unitCost}
        onCommit={(text) => {
          const unitCost = moneyAmount(text) ?? 0;
          if (unitCost !== line.unitCost) onPatch({ unitCost });
        }}
      />
    </>
  );

  return (
    <div
      className={cn(
        "rounded-md border bg-card",
        line.optional && !line.selected && "border-dashed"
      )}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5 sm:gap-2">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-expanded={detailsOpen}
          aria-label={detailsOpen ? "Hide line details" : "Show line details"}
          onClick={() => setDetailsOpen((value) => !value)}
        >
          <ChevronDown className={cn("transition-transform", detailsOpen && "rotate-180")} />
        </Button>
        <CommitInput
          value={line.title}
          disabled={!editable}
          placeholder="Title"
          className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          onCommit={(value) => onPatch({ title: value })}
        />
        <div className="hidden items-center gap-1.5 sm:flex">{qtyFields}</div>
        <p className="w-[5.5rem] shrink-0 text-right text-sm font-medium tabular-nums">
          {formatMoney(lineAmount(line))}
        </p>
        {editable ? (
          <div className="flex shrink-0">
            <Button size="icon-xs" variant="ghost" aria-label="Move up" onClick={() => onMove("up")}>
              <ArrowUp />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Move down" onClick={() => onMove("down")}>
              <ArrowDown />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Remove line" onClick={onRemove}>
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 px-3 pb-2 sm:hidden">{qtyFields}</div>
      {!detailsOpen && (notePreview || line.optional || photoCount) ? (
        <p className="text-muted-foreground truncate px-9 pb-2 text-xs">
          {line.optional ? (line.selected ? "Optional · in total" : "Optional · off") : null}
          {line.optional && (notePreview || photoCount) ? " · " : ""}
          {notePreview || (photoCount ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : "")}
        </p>
      ) : null}
      {detailsOpen ? (
      <div className="space-y-3 border-t px-3 py-3">
      <FormattedTextEditor
        value={line.description}
        disabled={!editable}
        placeholder="What the homeowner sees under the title"
        onCommit={(value) => onPatch({ description: value })}
      />
      {showOptional || showTax || showPackage ? (
      <div className="flex flex-wrap gap-4 text-sm">
        {showOptional ? (
        <label className="flex items-center gap-2">
          <Checkbox
            checked={line.optional}
            disabled={!editable}
            onCheckedChange={(value) =>
              onPatch({ optional: Boolean(value), selected: Boolean(value) ? line.selected : true })
            }
          />
          Optional
        </label>
        ) : null}
        {showOptional && line.optional ? (
          <label className="flex items-center gap-2">
            <Checkbox
              checked={line.selected}
              onCheckedChange={(value) => onPatch({ selected: Boolean(value) })}
            />
            Include in total
          </label>
        ) : null}
        {showTax ? (
        <label className="flex items-center gap-2">
          <Checkbox
            checked={line.taxable}
            disabled={!editable}
            onCheckedChange={(value) => onPatch({ taxable: Boolean(value) })}
          />
          Taxable
        </label>
        ) : null}
        {showPackage ? (
          <div className="flex min-w-[10rem] items-center gap-2">
            <Label className="text-xs text-muted-foreground">Package</Label>
            {editable ? (
              <Select
                value={linePackageSelectValue(line.package)}
                onValueChange={(value) =>
                  onPatch({ package: linePackageFromSelect(String(value ?? "all")) })
                }
                items={[
                  { value: "all", label: "Shared work" },
                  ...ESTIMATE_PACKAGES.map((pkg) => ({ value: pkg, label: PACKAGE_LABEL[pkg] })),
                  ...(parseLinePackage(line.package) && !ESTIMATE_PACKAGES.includes(parseLinePackage(line.package) as (typeof ESTIMATE_PACKAGES)[number])
                    ? [{ value: parseLinePackage(line.package), label: parseLinePackage(line.package) }]
                    : []),
                ]}
              >
                <SelectTrigger size="sm" className="w-[9.5rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Shared work</SelectItem>
                  {ESTIMATE_PACKAGES.map((pkg) => (
                    <SelectItem key={pkg} value={pkg}>
                      {PACKAGE_LABEL[pkg]}
                    </SelectItem>
                  ))}
                  {parseLinePackage(line.package) &&
                  !ESTIMATE_PACKAGES.includes(parseLinePackage(line.package) as (typeof ESTIMATE_PACKAGES)[number]) ? (
                    <SelectItem value={parseLinePackage(line.package)}>{parseLinePackage(line.package)}</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm">
                {line.package
                  ? PACKAGE_LABEL[parseEstimatePackage(line.package) as (typeof ESTIMATE_PACKAGES)[number]] ??
                    line.package
                  : "Shared work"}
              </p>
            )}
          </div>
        ) : null}
      </div>
      ) : null}

      {showQuantityFormula ? (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Mapping</Label>
              {editable ? (
                <Popover>
                  <PopoverTrigger
                    type="button"
                    className="border-input bg-background hover:bg-accent hover:text-accent-foreground mt-1 flex h-8 w-full items-center justify-between gap-2 rounded-md border px-2.5 text-left text-sm"
                  >
                    <span className="truncate">{formatMeasurementMappingLabel(measurementKeys)}</span>
                    <ChevronDown className="size-4 shrink-0 opacity-60" />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-2">
                    <p className="text-muted-foreground px-1 pb-2 text-xs">
                      Check the EagleView measurement(s) this material uses. Quantity = sum ÷
                      coverage, rounded up to whole units.
                    </p>
                    <div className="max-h-64 space-y-0.5 overflow-y-auto">
                      {EAGLEVIEW_MEASUREMENT_OPTIONS.filter((option) => option.key).map((option) => {
                        const checked = measurementKeys.includes(option.key);
                        return (
                          <label
                            key={option.key}
                            className="hover:bg-muted/60 flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) =>
                                toggleMeasurementKey(option.key, Boolean(value))
                              }
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm leading-tight">{option.label}</span>
                              <span className="text-muted-foreground block text-[11px] leading-tight">
                                {option.hint}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {measurementKeys.length > 0 ? (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground mt-2 w-full px-1 text-left text-xs underline-offset-2 hover:underline"
                        onClick={() =>
                          onPatch({
                            measurementKeys: [],
                            coverageAmount: line.coverageAmount ?? 1,
                          })
                        }
                      >
                        Clear mapping
                      </button>
                    ) : null}
                  </PopoverContent>
                </Popover>
              ) : (
                <p className="mt-1 text-sm">{formatMeasurementMappingLabel(measurementKeys)}</p>
              )}
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-xs text-muted-foreground">Coverage</Label>
                {coveragePreview?.ok ? (
                  <p className="text-xs text-muted-foreground">
                    On a {COVERAGE_PREVIEW_SQUARES}-square roof →{" "}
                    <span className="font-medium text-foreground tabular-nums">{coveragePreview.value}</span>
                  </p>
                ) : measurementKeys.length > 0 ? (
                  <p className="text-xs text-red-600">
                    {coveragePreview && !coveragePreview.ok ? coveragePreview.error : "Check coverage"}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">How much one roll/bundle covers</p>
                )}
              </div>
              <div className="mt-1 flex gap-2">
                <CommitInput
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={!editable || measurementKeys.length === 0}
                  value={coverageAmount}
                  className="flex-1"
                  onCommit={(value) => onPatch({ coverageAmount: Number(value) || 1 })}
                />
                {editable ? (
                  <Select
                    value={coverageUnit}
                    disabled={measurementKeys.length === 0}
                    onValueChange={(value) => onPatch({ coverageUnit: String(value ?? coverageUnit) })}
                    items={EAGLEVIEW_COVERAGE_UNITS.map((unit) => ({
                      value: unit.value,
                      label: unit.label,
                    }))}
                  >
                    <SelectTrigger className="w-[7.5rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EAGLEVIEW_COVERAGE_UNITS.map((unit) => (
                        <SelectItem key={unit.value} value={unit.value}>
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="mt-1 w-[7.5rem] text-sm">{formatCoverageLabel(coverageAmount, coverageUnit)}</p>
                )}
              </div>
              {measurementKeys.length > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Qty = measurement ÷ {formatCoverageLabel(coverageAmount, coverageUnit)}, rounded
                  up (e.g. underlayment at 10 squares → 4 rolls on a {COVERAGE_PREVIEW_SQUARES}-square
                  roof).
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {onPhotosChange || (line.photoIds && line.photoIds.length > 0) || line.photos?.length ? (
        <EstimateLinePhotos
          line={{
            photoIds: line.photoIds ?? [],
            photos: line.photos,
          }}
          gallery={galleryPhotos ?? []}
          emptyHint={galleryHint}
          editable={editable && Boolean(onPhotosChange)}
          onChange={editable ? onPhotosChange : undefined}
        />
      ) : null}
      </div>
      ) : null}
    </div>
  );
}

export function AdjustmentFields({
  label,
  kind,
  value,
  disabled,
  onChange,
}: {
  label: string;
  kind: AdjustmentKind;
  value: number;
  disabled?: boolean;
  onChange: (kind: AdjustmentKind, value: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Select
          value={kind}
          disabled={disabled}
          onValueChange={(next) => onChange((next === "amount" ? "amount" : "percent") as AdjustmentKind, value)}
          items={[
            { value: "percent", label: "%" },
            { value: "amount", label: "$" },
          ]}
        >
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percent">%</SelectItem>
            <SelectItem value="amount">$</SelectItem>
          </SelectContent>
        </Select>
        {kind === "amount" ? (
          <CurrencyInput
            disabled={disabled}
            value={value}
            onCommit={(text) => {
              const next = moneyAmount(text) ?? 0;
              if (next !== value) onChange(kind, next);
            }}
          />
        ) : (
          <CommitInput
            type="number"
            min={0}
            step="0.01"
            disabled={disabled}
            value={value}
            onCommit={(next) => onChange(kind, Number(next) || 0)}
          />
        )}
      </div>
    </div>
  );
}
