"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Download,
  Plus,
  Trash2,
} from "lucide-react";
import { FormattedTextEditor } from "@/components/formatted-text-editor";
import { EstimateLinePhotos } from "@/components/estimate-line-photos";
import { EstimateFilesPanel } from "@/components/estimate-files";
import { BackToJobButton } from "@/components/back-to-job";
import { ProposalDocument } from "@/components/proposal-document";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { CollectSignatureDialog } from "@/components/signature-pad";
import { shareContactsForEstimate, coOwnerContact, jobHomeownersForEstimate } from "@/lib/parties";
import { EstimateStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MarketField } from "@/components/market-field";
import { useCrm } from "@/lib/crm-store";
import { documentProjectManager, letterheadCompanyForRecord, shareEmailOwnerFromBook } from "@/lib/document-owner";
import { cardHeaderLogo } from "@/lib/card";
import { photosForEstimateLine } from "@/lib/estimate-line-photos";
import { COMMON_UNITS, estimateTotals, groupEstimateLines, lineAmount, linesForEstimate, type AdjustmentKind } from "@/lib/estimate-totals";
import {
  ESTIMATE_PACKAGES,
  PACKAGE_LABEL,
  groupHasMixedPackages,
  isGbbEstimate,
  linePackageFromSelect,
  linePackageSelectValue,
  listEstimateOptions,
  nextOptionKey,
  nextOptionName,
  optionKeyForGroup,
  parseEstimatePackage,
  parseLinePackage,
  resolveSelectedPackage,
  type EstimateOption,
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
import { PackagePicker } from "@/components/package-picker";
import {
  contractTypeById,
  contractTypesFromCompany,
  defaultContractType,
} from "@/lib/contract-types";
import { estimateFollowsCompanyTerms } from "@/lib/document-terms";
import { downloadEstimatePdf, downloadSignatureCertificatePdf } from "@/lib/document-pdf";
import { hasEstimateSignature } from "@/lib/estimate-signature";
import { mintEstimateSignerTokens } from "@/lib/estimate-signers";
import { shareUrl } from "@/lib/share";
import { formatDate, formatMoney } from "@/lib/format";
import {
  catalogProposalUnitPrice,
  effectiveCatalogMargin,
  formatMarginPercent,
} from "@/lib/catalog-margin";
import { addItemsLabel, toggleSelectedId } from "@/lib/catalog-pick";
import { currentCatalog } from "@/lib/price-lists";
import { billingEstimate, defaultTaxRateForMarket, isResidentialMarket, projectTypeForMarket, workMarket } from "@/lib/market";
import { formatJobSite } from "@/lib/leads";
import { proposalScopeSummary } from "@/lib/proposal-email";
import { jobPaperHref } from "@/lib/job-record";
import { CATALOG_KIND_LABELS, type CatalogKind, type Estimate, type EstimateLine, type JobPhoto } from "@/lib/types";
import { canGenerateSignatureCertificate, canManageSettings } from "@/lib/visibility";
import { cn } from "@/lib/utils";

export function CommitInput({
  value,
  onCommit,
  className,
  parse,
  type,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur"> & {
  value: string | number;
  onCommit: (value: string) => void;
  parse?: (value: string) => string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  function commit(raw: string) {
    const next = parse ? parse(raw) : raw;
    if (next !== String(value)) onCommit(next);
    else setDraft(String(value));
  }
  return (
    <Input
      {...props}
      type={type}
      className={className}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (type === "date") commit(next);
      }}
      onBlur={() => commit(draft)}
    />
  );
}

export function CommitTextarea({
  value,
  onCommit,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <Textarea
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}

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

  return (
    <div
      className={cn(
        "rounded-md border bg-card p-3",
        line.optional && !line.selected && "border-dashed"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-2">
          <CommitInput
            value={line.title}
            disabled={!editable}
            placeholder="Title"
            onCommit={(value) => onPatch({ title: value })}
          />
          <FormattedTextEditor
            value={line.description}
            disabled={!editable}
            placeholder="What the homeowner sees under the title"
            onCommit={(value) => onPatch({ description: value })}
          />
        </div>
        {editable ? (
          <div className="flex flex-col gap-1">
            <Button size="icon-xs" variant="ghost" aria-label="Move up" onClick={() => onMove("up")}>
              <ArrowUp />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Move down"
              onClick={() => onMove("down")}
            >
              <ArrowDown />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Remove line" onClick={onRemove}>
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <Label className="text-xs text-muted-foreground">Qty</Label>
          <CommitInput
            type="number"
            min={0}
            step="0.01"
            disabled={!editable}
            value={line.quantity}
            onCommit={(value) => onPatch({ quantity: Number(value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Unit</Label>
          {editable ? (
            <Select
              value={line.unit}
              onValueChange={(value) => onPatch({ unit: String(value ?? line.unit) })}
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
          ) : (
            <p className="mt-1 text-sm">{line.unit}</p>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Unit price</Label>
          <CommitInput
            type="number"
            min={0}
            step="0.01"
            disabled={!editable}
            className="text-right"
            value={line.unitCost}
            onCommit={(value) => onPatch({ unitCost: Number(value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Amount</Label>
          <p className="mt-1.5 text-right text-sm font-medium tabular-nums">
            {formatMoney(lineAmount(line))}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
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
        {line.optional ? (
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
  );
}

export function EstimateWriter({ estimate }: { estimate: Estimate }) {
  const router = useRouter();
  const crm = useCrm();
  const [tab, setTab] = useState("write");
  const [bookOpen, setBookOpen] = useState(false);
  const [bookGroup, setBookGroup] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSigning, setShareSigning] = useState<{
    shareToken: string;
    secondShareToken: string;
    secondContactId: string | null;
  } | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [emptySections, setEmptySections] = useState<string[]>([]);
  const [emptyOptions, setEmptyOptions] = useState<EstimateOption[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [signOpen, setSignOpen] = useState(false);

  const lines = linesForEstimate(crm.estimateLines, estimate.id);
  const previewLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        photos: photosForEstimateLine(line, crm.photos),
      })),
    [crm.photos, lines],
  );
  const groups = groupEstimateLines(lines);
  const pendingSections = emptySections.filter(
    (name) => !groups.some((group) => group.name === name),
  );
  const displayGroups = [
    ...groups,
    ...pendingSections.map((name) => ({ name, lines: [] as EstimateLine[] })),
  ];
  const relatedInvoice = crm.invoices.find((invoice) => invoice.estimateId === estimate.id);
  const editable = estimate.status === "draft";
  const optionalOpen = estimate.status === "draft" || estimate.status === "sent" || estimate.status === "viewed";
  const canConvert =
    (estimate.status === "sent" || estimate.status === "viewed" || estimate.status === "accepted") &&
    !relatedInvoice;
  const contact = estimate.contactId ? crm.getContact(estimate.contactId) : undefined;
  const secondContact = estimate.secondContactId ? crm.getContact(estimate.secondContactId) : undefined;
  const opportunity = estimate.opportunityId ? crm.getOpportunity(estimate.opportunityId) : undefined;
  const job = estimate.jobId ? crm.getJob(estimate.jobId) : undefined;
  const inferredCoOwner =
    estimate.status === "accepted" || estimate.status === "declined"
      ? null
      : coOwnerContact(job, crm.contacts, estimate.contactId);
  const secondSignerName = secondContact?.name || inferredCoOwner?.name || null;
  const jobPhotos = useMemo(
    () =>
      estimate.jobId
        ? crm.photos.filter((photo) => photo.jobId === estimate.jobId && !photo.deletedAt)
        : [],
    [crm.photos, estimate.jobId],
  );
  const galleryHint = estimate.jobId
    ? jobPhotos.length === 0
      ? "This job does not have photos yet. Add them on the job record, then attach them here."
      : undefined
    : "Attach this proposal to a job to use that job’s photo gallery.";
  const jobRelatedKey = job
    ? `${job.primaryContactId}:${(job.relatedContactIds ?? []).join(",")}:${job.street}:${job.city}:${job.state}:${job.postalCode}:${job.location}`
    : "";
  useEffect(() => {
    if (!job) return;
    if (estimate.status === "accepted" || estimate.status === "declined") return;
    const fromJob = jobHomeownersForEstimate(job, crm.contacts);
    const site = {
      street: job.street.trim(),
      city: job.city.trim(),
      state: job.state.trim(),
      postalCode: job.postalCode.trim(),
    };
    const contactMatches = (estimate.contactId || null) === fromJob.contactId;
    const secondMatches = (estimate.secondContactId || null) === fromJob.secondContactId;
    const siteMatches =
      estimate.street === site.street &&
      estimate.city === site.city &&
      estimate.state === site.state &&
      estimate.postalCode === site.postalCode;
    if (contactMatches && secondMatches && siteMatches) return;
    const nextContact = fromJob.contactId
      ? crm.contacts.find((item) => item.id === fromJob.contactId)
      : undefined;
    const siteLabel = formatJobSite(site) || job.name;
    const patch: {
      contactId: string | null;
      clientId?: string | null;
      secondContactId: string | null;
      secondAcceptedAt?: string | null;
      shareToken?: string;
      secondShareToken?: string;
      street?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      name?: string;
    } = {
      contactId: fromJob.contactId,
      secondContactId: fromJob.secondContactId,
      street: site.street,
      city: site.city,
      state: site.state,
      postalCode: site.postalCode,
    };
    if (siteLabel) patch.name = siteLabel;
    if (nextContact?.clientId) patch.clientId = nextContact.clientId;
    if (!secondMatches) {
      patch.secondAcceptedAt = null;
      const tokens = mintEstimateSignerTokens({
        shareToken: estimate.shareToken,
        secondShareToken: estimate.secondShareToken,
        secondContactId: fromJob.secondContactId,
      });
      patch.shareToken = tokens.shareToken;
      patch.secondShareToken = tokens.secondShareToken;
    }
    void crm.updateEstimate(estimate.id, patch);
  }, [
    crm.contacts,
    crm.updateEstimate,
    estimate,
    estimate.contactId,
    estimate.id,
    estimate.secondContactId,
    estimate.status,
    estimate.street,
    estimate.city,
    estimate.state,
    estimate.postalCode,
    job,
    jobRelatedKey,
  ]);
  const customer = crm.customerName(estimate);
  const site =
    formatJobSite({
      street: estimate.street,
      city: estimate.city,
      state: estimate.state,
      postalCode: estimate.postalCode,
    }) ||
    job?.location?.trim() ||
    "";
  const title = site || estimate.name;
  const market = workMarket(job, opportunity);
  const residential = isResidentialMarket(market);
  const billed = billingEstimate(estimate, market);
  const totals = estimateTotals(billed, lines);
  const gbb = isGbbEstimate(estimate);
  const estimateOptions = listEstimateOptions(lines, emptyOptions);
  const selectedPackage = resolveSelectedPackage(estimate, lines, emptyOptions);
  const letterhead = letterheadCompanyForRecord({
    company: crm.company,
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    inBook: true,
  });
  const projectManager = documentProjectManager({
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    companyPhone: letterhead.phone,
  });
  const emailOwner = shareEmailOwnerFromBook({
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    senderStaff: crm.effectiveStaff ?? crm.viewer,
    companyPhone: letterhead.phone,
    companyEmail: crm.company.email,
    companySignature: crm.company.defaultEmailSignature,
  });

  function lastGroup() {
    return pendingSections.at(-1) || groups.at(-1)?.name;
  }

  function packageForGroup(name?: string) {
    if (!name) return "";
    return optionKeyForGroup(name, lines, emptyOptions);
  }

  function addOptionSection() {
    const name = nextOptionName(displayGroups.map((group) => group.name));
    const key = nextOptionKey([...lines.map((line) => line.package), ...emptyOptions.map((item) => item.key)]);
    setEmptySections((prev) => [...prev, name]);
    setEmptyOptions((prev) => [...prev, { key, name }]);
    void crm.updateEstimate(estimate.id, {
      packageMode: "gbb",
      selectedPackage: gbb ? estimate.selectedPackage || key : key,
    });
  }

  async function buildOptionFrom(group: { name: string; lines: EstimateLine[] }) {
    const name = nextOptionName(displayGroups.map((item) => item.name));
    const key = nextOptionKey([...lines.map((line) => line.package), ...emptyOptions.map((item) => item.key)]);
    if (!gbb || !estimate.selectedPackage) {
      await crm.updateEstimate(estimate.id, { packageMode: "gbb", selectedPackage: key });
    }
    if (group.lines.length === 0) {
      setEmptySections((prev) => [...prev, name]);
      setEmptyOptions((prev) => [...prev, { key, name }]);
      toast.success(`Started ${name} from ${group.name}.`);
      return;
    }
    for (const line of group.lines) {
      await crm.addCustomEstimateLine(estimate.id, name, {
        package: key,
        title: line.title,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitCost: line.unitCost,
        optional: line.optional,
        selected: line.selected,
        taxable: line.taxable,
        catalogItemId: line.catalogItemId,
      });
    }
    toast.success(`Started ${name} from ${group.name}.`);
  }

  async function handleConvert() {
    setPending(true);
    try {
      const invoice = await crm.convertEstimateToInvoice(estimate.id);
      toast.success(`${invoice.number} created from this proposal.`);
      router.push(`/invoices/${invoice.id}`);
    } catch {
      setPending(false);
    }
  }

  function downloadPdf() {
    if (lines.length === 0) {
      toast.error("Add at least one line before generating a PDF.");
      return;
    }
    return downloadEstimatePdf({
      estimate: billed,
      lines,
      company: letterhead,
      customer,
      projectManager,
      primaryCustomer: contact?.name,
      secondCustomer: secondSignerName,
      photos: crm.photos,
    });
  }

  function downloadSignatureCertificate() {
    const events = (crm.estimateSignatureEvents ?? []).filter((event) => event.estimateId === estimate.id);
    if (!events.length) {
      toast.message("No signature record yet. Send the link or collect a signature first.");
      return;
    }
    return downloadSignatureCertificatePdf({
      estimate: billed,
      company: letterhead,
      customer,
      events,
    }).catch(() => toast.error("Could not build the signature certificate."));
  }

  const shareEstimate = useMemo(
    () =>
      shareSigning
        ? {
            ...estimate,
            shareToken: shareSigning.shareToken,
            secondShareToken: shareSigning.secondShareToken,
            secondContactId: shareSigning.secondContactId ?? estimate.secondContactId,
          }
        : estimate,
    [estimate, shareSigning],
  );

  async function openShare(markSent: boolean) {
    if (markSent && totals.includedCount === 0) {
      toast.error("Add at least one included line before sending.");
      return;
    }
    setPending(true);
    try {
      if (markSent) await crm.sendEstimate(estimate.id);
      const tokens = await crm.ensureEstimateShareToken(estimate.id);
      setShareSigning(tokens);
      setShareOpen(true);
      if (markSent) setTab("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare the share links.");
    } finally {
      setPending(false);
    }
  }

  async function handleReopen() {
    setPending(true);
    try {
      await crm.reopenEstimate(estimate.id);
      toast.success("Proposal reopened as a draft. Edit it and send again.");
      setTab("write");
    } catch {
      // Store already toasted the reason.
    } finally {
      setPending(false);
    }
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={pending || lines.length === 0} onClick={() => void downloadPdf()}>
        <Download />
        PDF
      </Button>
      {estimate.status === "draft" ? (
        <Button disabled={pending || totals.includedCount === 0} onClick={() => void openShare(true)}>
          Send for signature
        </Button>
      ) : (
        <Button variant="outline" disabled={pending} onClick={() => void openShare(false)}>
          Share
        </Button>
      )}
      {estimate.status === "draft" ||
      estimate.status === "sent" ||
      estimate.status === "viewed" ||
      (estimate.status === "accepted" && !hasEstimateSignature(estimate)) ? (
        <Button
          disabled={pending || totals.includedCount === 0}
          onClick={() => setSignOpen(true)}
        >
          {estimate.status === "accepted" ? "Add signature" : "Collect signature"}
        </Button>
      ) : null}
      {estimate.status === "sent" || estimate.status === "viewed" ? (
        <Button
          variant="outline"
          onClick={() => {
            void crm.declineEstimate(estimate.id);
            toast.message("Marked declined.");
          }}
        >
          Decline
        </Button>
      ) : null}
      {estimate.status === "declined" && !relatedInvoice ? (
        <Button disabled={pending} onClick={() => void handleReopen()}>
          Edit and send again
        </Button>
      ) : null}
      {canConvert ? (
        <Button disabled={pending} variant={estimate.status === "accepted" ? "default" : "outline"} onClick={() => void handleConvert()}>
          Convert to invoice
        </Button>
      ) : null}
      {relatedInvoice ? (
        <Button nativeButton={false} variant="outline" render={<Link href={`/invoices/${relatedInvoice.id}`} />}>
          Open {relatedInvoice.number}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          More
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={pending} onClick={() => void openShare(false)}>
            Share link
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void crm.duplicateEstimate(estimate.id).then((copy) => {
                toast.success(`${copy.number} drafted as a copy.`);
                window.location.assign(`/estimates/${copy.id}`);
              });
            }}
          >
            <Copy />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setTemplateName(estimate.name.replace(/\s+—\s+.+$/, "").trim() || estimate.name);
              setSaveTemplateOpen(true);
            }}
          >
            Save as template
          </DropdownMenuItem>
          {canGenerateSignatureCertificate(crm.viewer) ? (
            <DropdownMenuItem disabled={pending} onClick={() => void downloadSignatureCertificate()}>
              Generate Signature Certificate
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const writer = (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Proposal details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Valid until</Label>
            {editable ? (
              <>
                <CommitInput
                  type="date"
                  value={estimate.validUntil ?? ""}
                  onCommit={(value) => void crm.updateEstimate(estimate.id, { validUntil: value || null })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Prints on the proposal. New estimates default to 30 days.
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm">{formatDate(estimate.validUntil)}</p>
            )}
          </div>
          {editable ? (
            <div className="sm:col-span-2">
              <MarketField
                id="estimate-market"
                value={market}
                onChange={(next) => {
                  if (opportunity) {
                    void crm.updateOpportunity(opportunity.id, {
                      market: next,
                      projectType: projectTypeForMarket(next),
                    });
                  }
                  if (job) {
                    void crm.updateJob(job.id, {
                      market: next,
                      projectType: projectTypeForMarket(next),
                    });
                  }
                  void crm.updateEstimate(estimate.id, { taxRate: defaultTaxRateForMarket(next) });
                }}
              />
            </div>
          ) : null}
          <div>
            <Label>Lead</Label>
            <p className="mt-1 text-sm">
              {opportunity ? (
                <Link href={`/opportunities/${opportunity.id}`} className="hover:underline">
                  {opportunity.name}
                </Link>
              ) : (
                "—"
              )}
            </p>
          </div>
          <div>
            <Label>Job</Label>
            <p className="mt-1 text-sm">
              {job ? (
                <Link href={jobPaperHref(job.id)} className="hover:underline">
                  {job.name}
                </Link>
              ) : (
                "—"
              )}
            </p>
            {!job ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Homeowner, co-owner, and job site come from the job once this proposal is attached.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Homeowner, co-owner, and job site pull from this job.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Cover note</CardTitle>
        </CardHeader>
        <CardContent>
          <CommitTextarea
            rows={3}
            disabled={!editable}
            value={estimate.intro}
            placeholder="What this proposal covers, in the homeowner’s language."
            onCommit={(value) => void crm.updateEstimate(estimate.id, { intro: value })}
          />
        </CardContent>
      </Card>

      {gbb && estimateOptions.length > 0 ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Shared sections sit on every option. Each option section is a fork the homeowner can pick.
              Options replace each other — they do not stack.
            </p>
            <PackagePicker
              estimate={estimate}
              lines={lines}
              pending={emptyOptions}
              locked={!editable && !optionalOpen}
              onSelect={(pkg) => void crm.updateEstimate(estimate.id, { selectedPackage: pkg })}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {editable ? (
          <div className="space-y-2">
            <h2 className="font-heading text-lg font-medium">Sections</h2>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                const name = sectionName.trim() || "New section";
                if (!displayGroups.some((group) => group.name === name)) {
                  setEmptySections((prev) => [...prev, name]);
                }
                setSectionName("");
                setBookGroup(name);
              }}
            >
              <Input
                value={sectionName}
                onChange={(event) => setSectionName(event.target.value)}
                placeholder="New section name — Demo, Roof, Allowances"
              />
              <Button type="submit" variant="outline">
                Add section
              </Button>
              <Button type="button" variant="outline" onClick={addOptionSection}>
                Add option
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Shared sections (tear-off, dumpster) stay on every option. Add an option, put the work that
              changes in that section, then build the next option off it.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-heading text-lg font-medium">Line items</h2>
          {editable ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setBookGroup(lastGroup());
                  setBookOpen(true);
                }}
              >
                <Plus />
                Price book
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void crm.addCustomEstimateLine(estimate.id, lastGroup(), {
                    package: packageForGroup(lastGroup()),
                  })
                }
              >
                Custom item
              </Button>
            </div>
          ) : null}
        </div>

        {displayGroups.length === 0 ? (
          <div className="border border-dashed px-4 py-8">
            <p className="font-medium">No lines yet</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Add a section above, then pull items from the price book or add a lump-sum line.
              Optional work stays out of the total until you check it.
            </p>
            {editable ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setBookOpen(true)}>
                  Add from price book
                </Button>
                <Button size="sm" variant="outline" onClick={() => void crm.addCustomEstimateLine(estimate.id)}>
                  Custom item
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          displayGroups.map((group) => (
            <section key={group.name} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <CommitInput
                    className="h-8 max-w-xs font-medium"
                    disabled={!editable}
                    value={group.name}
                    onCommit={(value) => {
                      const next = value.trim() || "Items";
                      if (next === group.name) return;
                      for (const line of group.lines) {
                        void crm.updateEstimateLine(line.id, { groupName: next });
                      }
                      setEmptySections((prev) =>
                        prev.map((name) => (name === group.name ? next : name)).filter((name, index, all) => all.indexOf(name) === index),
                      );
                      setEmptyOptions((prev) =>
                        prev.map((item) => (item.name === group.name ? { ...item, name: next } : item)),
                      );
                    }}
                  />
                  {packageForGroup(group.name) ? (
                    <span className="rounded-full bg-[#e7effb] px-2.5 py-0.5 text-xs font-medium text-[#13295b]">
                      Option
                    </span>
                  ) : null}
                </div>
                {editable ? (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setBookGroup(group.name);
                        setBookOpen(true);
                      }}
                    >
                      Add to section
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void crm.addCustomEstimateLine(estimate.id, group.name, {
                          package: packageForGroup(group.name),
                        })
                      }
                    >
                      Custom item
                    </Button>
                    {packageForGroup(group.name) ? (
                      <Button size="sm" variant="ghost" onClick={() => void buildOptionFrom(group)}>
                        <Copy />
                        Build another option
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {group.lines.length === 0 ? (
                <p className="border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  No items in this section yet. Add from the price book or a custom line.
                </p>
              ) : (
                group.lines.map((line) => (
                  <LineCard
                    key={line.id}
                    line={line}
                    editable={editable}
                    showTax={!residential}
                    showPackage={gbb && groupHasMixedPackages(group.lines)}
                    galleryPhotos={jobPhotos}
                    galleryHint={galleryHint}
                    onPhotosChange={(photoIds) => void crm.updateEstimateLine(line.id, { photoIds })}
                    onPatch={(patch) => void crm.updateEstimateLine(line.id, patch)}
                    onMove={(direction) => void crm.reorderEstimateLine(line.id, direction)}
                    onRemove={() => void crm.removeEstimateLine(line.id)}
                  />
                ))
              )}
            </section>
          ))
        )}
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Tax, discount, deposit & pricing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tax rate (%)</Label>
            <CommitInput
              type="number"
              min={0}
              step="0.01"
              disabled={!editable || residential}
              value={residential ? 0 : estimate.taxRate}
              onCommit={(value) => void crm.updateEstimate(estimate.id, { taxRate: Number(value) || 0 })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {residential
                ? "Residential work is not taxed."
                : "Applied only to taxable included lines, after discount."}
            </p>
          </div>
          <div>
            <Label>Valid until</Label>
            <CommitInput
              type="date"
              disabled={!editable}
              value={estimate.validUntil ?? ""}
              onCommit={(value) => void crm.updateEstimate(estimate.id, { validUntil: value || null })}
            />
          </div>
          <AdjustmentFields
            label="Discount"
            kind={estimate.discountKind}
            value={estimate.discountValue}
            disabled={!editable}
            onChange={(discountKind, discountValue) =>
              void crm.updateEstimate(estimate.id, { discountKind, discountValue })
            }
          />
          <AdjustmentFields
            label="Deposit"
            kind={estimate.depositKind}
            value={estimate.depositValue}
            disabled={!editable}
            onChange={(depositKind, depositValue) =>
              void crm.updateEstimate(estimate.id, { depositKind, depositValue })
            }
          />
          <div>
            <Label>Margin (%)</Label>
            <CommitInput
              type="number"
              min={0}
              step="0.01"
              disabled={!editable}
              value={estimate.marginPercent}
              onCommit={(value) => {
                const marginPercent = Math.max(0, Number(value) || 0);
                void crm.updateEstimate(estimate.id, {
                  marginPercent,
                  ...(marginPercent > 0 && estimate.subtotalOverride != null
                    ? { subtotalOverride: null }
                    : {}),
                });
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {totals.marginAmount > 0
                ? `Adds ${formatMoney(totals.marginAmount)} on the ${formatMoney(totals.lineSubtotal)} line sum before discount and tax.`
                : "Markup on the included line sum after you finish items. Cleared by a lump-sum customer subtotal."}
            </p>
          </div>
          <div>
            <Label>Customer subtotal</Label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <CommitInput
                type="number"
                min={0}
                step="0.01"
                disabled={!editable}
                className="max-w-[12rem]"
                value={estimate.subtotalOverride ?? totals.subtotal}
                onCommit={(value) => {
                  const amount = Math.max(0, Number(value) || 0);
                  void crm.updateEstimate(estimate.id, { subtotalOverride: amount });
                }}
              />
              {estimate.subtotalOverride != null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!editable}
                  onClick={() => void crm.updateEstimate(estimate.id, { subtotalOverride: null })}
                >
                  Use line sum
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {estimate.subtotalOverride != null
                ? `Lump-sum override on. Line items still total ${formatMoney(totals.lineSubtotal)} for bidding.`
                : totals.marginAmount > 0
                  ? `Line sum ${formatMoney(totals.lineSubtotal)} + margin = ${formatMoney(totals.subtotal)}. Edit to set a lump-sum contract price instead.`
                  : "Matches included line items. Edit to set a lump-sum contract price while keeping itemized costs internal."}
            </p>
          </div>
          <label className="flex items-start gap-2 sm:col-span-2">
            <Checkbox
              className="mt-0.5"
              checked={estimate.hideLinePrices}
              disabled={!editable}
              onCheckedChange={(value) =>
                void crm.updateEstimate(estimate.id, { hideLinePrices: Boolean(value) })
              }
            />
            <span>
              <span className="text-sm font-medium">Hide line prices on the proposal</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Customers still see the itemized scope, but not unit prices or line amounts. Totals stay visible.
              </span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Type the Payment 1, 2, and 3 amounts on the terms lines. They stay blank until you enter them.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Contract</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="estimate-contract-type">Company contract</Label>
          <Select
            value={
              contractTypeById(contractTypesFromCompany(crm.company), estimate.contractTypeId)?.id ??
              defaultContractType(contractTypesFromCompany(crm.company)).id
            }
            disabled={!estimateFollowsCompanyTerms(estimate) || estimate.status === "declined"}
            onValueChange={(value) => {
              if (!value) return;
              void crm.updateEstimate(estimate.id, { contractTypeId: value });
            }}
          >
            <SelectTrigger id="estimate-contract-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contractTypesFromCompany(crm.company).map((contract) => (
                <SelectItem key={contract.id} value={contract.id}>
                  {contract.name}
                  {contract.isDefault ? " · Default" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {estimateFollowsCompanyTerms(estimate)
              ? "Locked language comes from this company contract. Payment amounts on this proposal stay put."
              : "Signed proposals keep the contract they were signed with."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <CommitTextarea
            rows={3}
            value={estimate.notes}
            disabled={estimate.status === "declined"}
            placeholder="Allowance details, exclusions, or anything else that belongs after the total."
            onCommit={(value) => void crm.updateEstimate(estimate.id, { notes: value })}
          />
          <p className="text-xs text-muted-foreground">
            Prints after the total on the proposal, the client link, and the PDF. Long notes continue onto a second page.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Attachments</CardTitle>
        </CardHeader>
        <CardContent>
          <EstimateFilesPanel
            estimateId={estimate.id}
            disabled={estimate.status === "declined"}
          />
        </CardContent>
      </Card>
    </div>
  );

  const preview = (
    <div className="grid gap-4">
      <ProposalDocument
      company={crm.company}
      estimate={estimate}
      lines={previewLines}
      photos={crm.photos}
      customer={customer}
      market={workMarket(job, opportunity)}
      selectable={optionalOpen}
      primaryCustomer={contact?.name}
      secondCustomer={secondSignerName}
      onToggleOptional={(line, selected) => void crm.updateEstimateLine(line.id, { selected })}
      onSelectPackage={
        optionalOpen ? (pkg) => void crm.updateEstimate(estimate.id, { selectedPackage: pkg }) : undefined
      }
      onTermsChange={
        editable ? (terms) => void crm.updateEstimate(estimate.id, { terms }) : undefined
      }
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-5 flex flex-col gap-3 border-b bg-background/95 px-5 py-3 backdrop-blur sm:-mx-7 sm:px-7 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
        <BackToJobButton jobId={estimate.jobId} />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {estimate.number}
            </p>
            {editable && !site ? (
              <CommitInput
                className="font-heading h-auto border-0 bg-transparent px-0 text-[1.85rem] leading-[1.1] font-medium shadow-none focus-visible:ring-0"
                value={estimate.name}
                onCommit={(value) => {
                  if (value.trim()) void crm.updateEstimate(estimate.id, { name: value.trim() });
                }}
              />
            ) : (
              <h1 className="font-heading text-[1.85rem] leading-[1.1] font-medium text-balance">
                {title}
              </h1>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <EstimateStatusBadge status={estimate.status} />
              <span className="text-sm text-muted-foreground">{customer}</span>
              <span className="text-sm text-muted-foreground">
                Valid until {formatDate(estimate.validUntil)}
              </span>
            </div>
            {estimate.status === "declined" ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {relatedInvoice
                  ? "This proposal is declined and already has an invoice, so it stays locked."
                  : "This proposal is declined and locked. Reopen it to edit lines and send again."}
              </p>
            ) : null}
          </div>
          {actions}
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 px-4 py-3 sm:flex sm:items-center sm:justify-between">
        {gbb && estimateOptions.length > 0 ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {estimateOptions.map((option) => {
              const amount = estimateTotals({ ...billed, packageMode: "gbb", selectedPackage: option.key }, lines)
                .total;
              const active = option.key === selectedPackage;
              return (
                <span
                  key={option.key}
                  className={active ? "font-medium tabular-nums" : "text-muted-foreground tabular-nums"}
                >
                  {option.name} {formatMoney(amount)}
                </span>
              );
            })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {totals.includedCount} included
            {totals.optionalCount ? ` · ${totals.optionalCount} optional off` : ""}
          </p>
        )}
        <p className="font-heading text-xl font-medium tabular-nums">{formatMoney(totals.total)}</p>
      </div>

      <div className="xl:hidden">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="write" className="mt-4">
            {writer}
          </TabsContent>
          <TabsContent value="preview" className="mt-4">
            {preview}
          </TabsContent>
        </Tabs>
      </div>

      <div className="hidden gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] xl:items-start">
        {writer}
        <div className="xl:sticky xl:top-4 xl:max-h-[calc(100dvh-1.5rem)] xl:overflow-y-auto">
          {preview}
        </div>
      </div>

      <PriceBookSheet
        open={bookOpen}
        onOpenChange={setBookOpen}
        onPick={async (catalogItemIds) => {
          const added = await crm.addEstimateLinesFromCatalog(estimate.id, catalogItemIds, bookGroup, {
            package: packageForGroup(bookGroup),
          });
          if (added.length === 1) toast.success(`Added ${added[0].title}.`);
          else if (added.length > 1) toast.success(`Added ${added.length} items.`);
        }}
      />
      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={`Share ${estimate.number}`}
        description="Email or text each homeowner, or copy their link. They review the proposal and sign from their phone — no login. Each signer needs their own link; the other person’s link will not let them sign."
        url={shareEstimate.shareToken ? shareUrl("e", shareEstimate.shareToken) : ""}
        kind="estimate"
        documentNumber={estimate.number}
        documentName={estimate.name}
        propertyAddress={site}
        companyName={crm.company.name}
        companyLogoUrl={cardHeaderLogo(crm.company)}
        companyWebsite={crm.company.website}
        companyPhone={letterhead.phone || crm.company.phone}
        companyStreet={crm.company.street}
        companyCity={crm.company.city}
        companyState={crm.company.state}
        companyPostalCode={crm.company.postalCode}
        jobStreet={estimate.street}
        jobCity={estimate.city}
        jobState={estimate.state}
        jobPostalCode={estimate.postalCode}
        validUntil={estimate.validUntil}
        scopeSummary={proposalScopeSummary({
          projectType: job?.projectType || opportunity?.projectType,
          packageMode: estimate.packageMode,
          name: estimate.name,
          street: estimate.street,
        })}
        sender={emailOwner}
        recipients={shareContactsForEstimate(shareEstimate, crm)}
        onDownloadPdf={downloadPdf}
        onTexted={(sent) =>
          crm.logOutboundText({
            ...sent,
            jobId: estimate.jobId,
            opportunityId: estimate.opportunityId,
            contactId: sent.contactId || estimate.contactId,
          })
        }
        onEmailed={(sent) =>
          crm.logOutboundEmail({
            ...sent,
            jobId: estimate.jobId,
            opportunityId: estimate.opportunityId,
            contactId: sent.contactId || estimate.contactId,
          })
        }
      />
      <CollectSignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        defaultName={customer === "—" ? "" : customer}
        estimateNumber={estimate.number}
        pending={pending}
        onSubmit={async ({ name, image }) => {
          setPending(true);
          try {
            await crm.acceptEstimate(estimate.id, { name, image });
            setSignOpen(false);
            toast.success("Signed. The signature is on the estimate and the PDF.");
          } finally {
            setPending(false);
          }
        }}
      />
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as company template</DialogTitle>
            <DialogDescription>
              Sections, prices, Good / Better / Best options, cover note, terms, and notes are copied. The next estimate can start from this instead of a blank page.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Hail roof — architectural shingles"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !templateName.trim()}
              onClick={() => {
                setPending(true);
                void crm
                  .saveEstimateAsTemplate(estimate.id, templateName.trim())
                  .then((template) => {
                    toast.success(`${template.name} is in company templates.`);
                    setSaveTemplateOpen(false);
                    router.push(`/estimates/templates/${template.id}`);
                  })
                  .finally(() => setPending(false));
              }}
            >
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        <CommitInput
          type="number"
          min={0}
          step="0.01"
          disabled={disabled}
          value={value}
          onCommit={(next) => onChange(kind, Number(next) || 0)}
        />
      </div>
    </div>
  );
}
