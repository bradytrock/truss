"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { CatalogItemDialog } from "@/components/catalog-item-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/page-chrome";
import {
  CATALOG_CSV_TEMPLATE,
  catalogToCsv,
  downloadCatalogCsv,
  parseCatalogCsv,
} from "@/lib/catalog-csv";
import { useCrm } from "@/lib/crm-store";
import { catalogProposalUnitPrice, effectiveCatalogMargin, formatMarginPercent } from "@/lib/catalog-margin";
import { formatDate, formatMoney, localYmd } from "@/lib/format";
import {
  catalogForList,
  currentPriceList,
  isCurrentPriceList,
  isLivePriceList,
  sortPriceLists,
} from "@/lib/price-lists";
import {
  CATALOG_KIND_LABELS,
  CATALOG_KINDS,
  type CatalogItem,
  type CatalogKind,
  type PriceList,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type KindFilter = CatalogKind | "all";

function listOptionLabel(list: PriceList, lists: PriceList[]) {
  const status = isCurrentPriceList(list, lists) ? "Current" : list.outdatedAt ? "Outdated" : "Live";
  return `${list.name} · ${status} · ${formatDate(list.effectiveOn)}`;
}

export function PriceBookPanel() {
  const crm = useCrm();
  const minMargin = crm.company.minimumMarginPercent ?? 0;
  const fileRef = useRef<HTMLInputElement>(null);
  const lists = useMemo(() => sortPriceLists(crm.priceLists ?? []), [crm.priceLists]);
  const current = currentPriceList(lists);
  const [selectedId, setSelectedId] = useState<string | null>(current?.id ?? null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof parseCatalogCsv> | null>(null);

  useEffect(() => {
    if (selectedId && lists.some((list) => list.id === selectedId)) return;
    setSelectedId(current?.id ?? lists[0]?.id ?? null);
  }, [current?.id, lists, selectedId]);

  const selected = lists.find((list) => list.id === selectedId) ?? current ?? null;
  const canEdit = !selected || isCurrentPriceList(selected, lists);
  const selectedItems = catalogForList(crm.catalog, lists, selected?.id);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...selectedItems]
      .sort((a, b) => {
        const code = a.costCode.localeCompare(b.costCode);
        if (code !== 0) return code;
        return a.name.localeCompare(b.name);
      })
      .filter((item) => {
        if (kind !== "all" && item.kind !== kind) return false;
        if (!needle) return true;
        return (
          item.name.toLowerCase().includes(needle) ||
          item.costCode.toLowerCase().includes(needle) ||
          CATALOG_KIND_LABELS[item.kind].toLowerCase().includes(needle) ||
          item.unit.toLowerCase().includes(needle)
        );
      });
  }, [kind, query, selectedItems]);

  async function remove(item: CatalogItem) {
    if (!window.confirm(`Remove ${item.name} from this price list? Estimates that already used it keep their prices.`)) {
      return;
    }
    setRemovingId(item.id);
    try {
      await crm.removeCatalogItem(item.id);
      toast.success(`${item.name} removed.`);
    } finally {
      setRemovingId(null);
    }
  }

  function readFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type && file.type !== "text/csv" && file.type !== "text/plain") {
      toast.error("Upload a CSV file. In Excel, use Save As → CSV UTF-8.");
      return;
    }
    if (file.size > 2_000_000) {
      toast.error("Keep the CSV under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = parseCatalogCsv(String(reader.result ?? ""));
        if (next.rows.length === 0 && next.issues.length === 0) {
          toast.error("No catalog rows in that file.");
          return;
        }
        setPreview(next);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not read that CSV.");
      }
    };
    reader.readAsText(file);
  }

  async function confirmImport() {
    if (!preview || preview.rows.length === 0) return;
    setImporting(true);
    try {
      const result = await crm.importCatalogItems(preview.rows, selected?.id ?? null);
      const parts = [
        result.added ? `${result.added} added` : null,
        result.updated ? `${result.updated} updated` : null,
        preview.issues.length ? `${preview.issues.length} skipped` : null,
      ].filter(Boolean);
      toast.success(parts.length > 0 ? `Price book: ${parts.join(", ")}.` : "Nothing new to import.");
      setPreview(null);
    } catch {
      // Store already toasted.
    } finally {
      setImporting(false);
    }
  }

  async function outdateSelected() {
    if (!selected) return;
    if (
      !window.confirm(
        `Outdate ${selected.name}? Estimators will use the current list. This list stays here so you can look up old prices.`,
      )
    ) {
      return;
    }
    await crm.outdatePriceList(selected.id);
    toast.success(`${selected.name} is outdated. It is still in the book.`);
  }

  const filteredEmpty = selectedItems.length > 0 && rows.length === 0;
  const liveCount = lists.filter(isLivePriceList).length;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Price lists</CardTitle>
          <CardDescription>
            Add a dated list when a new book comes out. The previous list is outdated — not deleted — so you can
            still look up what you used to charge. Estimators and material orders always pick from the current
            list.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          {lists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Items below are the working book. Add a dated price list when the vendor or office publishes a new
              one.
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Label htmlFor="price-list-select">List</Label>
                <Select
                  value={selected?.id ?? ""}
                  onValueChange={(value) => setSelectedId(String(value))}
                  items={lists.map((list) => ({
                    value: list.id,
                    label: listOptionLabel(list, lists),
                  }))}
                >
                  <SelectTrigger id="price-list-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {listOptionLabel(list, lists)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selected ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={canEdit ? "default" : "secondary"} className="font-normal">
                    {canEdit ? "Current" : "Outdated"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Effective {formatDate(selected.effectiveOn)}
                    {selected.outdatedAt ? ` · outdated ${formatDate(selected.outdatedAt)}` : ""}
                  </span>
                </div>
              ) : null}
            </div>
          )}
          {selected && !canEdit ? (
            <p className="text-sm text-muted-foreground">
              This list is outdated. You can look it up here. To change prices, add a new list or switch to the
              current one.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setListOpen(true)}>
              New price list
            </Button>
            {selected && isLivePriceList(selected) && liveCount > 1 ? (
              <Button type="button" variant="outline" onClick={() => void outdateSelected()}>
                Outdate this list
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Mass upload</CardTitle>
            <CardDescription>
              CSV with name, kind, unit, unit cost, cost code, and optional margin percent. Rows with a matching cost
              code (or the same name and kind) update this list; the rest are added. Changing a unit cost or margin
              here does not rewrite lines already on a proposal. The company minimum margin in Settings is a floor
              when an item is dropped onto a proposal.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4">
            <div
              className={cn(
                "flex flex-col items-start gap-3 rounded-md border border-dashed px-4 py-5 sm:flex-row sm:items-center",
                dragOver && "border-primary bg-muted/40",
              )}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                const file = event.dataTransfer.files[0];
                if (file) readFile(file);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) readFile(file);
                }}
              />
              <Upload className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Drop a CSV here or choose a file</p>
                <p className="text-xs text-muted-foreground">
                  Kind must be labor, material, equipment, allowance, or subcontract. Margin is a percent (20, not
                  0.20). Excel: Save As → CSV UTF-8.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  Choose CSV
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => downloadCatalogCsv("price-book-template.csv", CATALOG_CSV_TEMPLATE)}
                >
                  Template
                </Button>
                {selectedItems.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => downloadCatalogCsv("price-book.csv", catalogToCsv(selectedItems))}
                  >
                    Download list
                  </Button>
                ) : null}
              </div>
            </div>

            {preview ? (
              <div className="grid gap-3">
                <p className="text-sm">
                  {preview.rows.length} ready to import
                  {preview.issues.length ? ` · ${preview.issues.length} row${preview.issues.length === 1 ? "" : "s"} skipped` : ""}.
                  Matching cost codes update the existing item on this list.
                </p>
                {preview.rows.length > 0 ? (
                  <div className="max-h-56 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Kind</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead className="text-right">Unit cost</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                          <TableHead>Code</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.rows.slice(0, 40).map((row, index) => (
                          <TableRow key={`${row.name}:${index}`}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell>{CATALOG_KIND_LABELS[row.kind]}</TableCell>
                            <TableCell>{row.unit}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatMoney(row.unitCost)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatMarginPercent(row.marginPercent)}
                            </TableCell>
                            <TableCell className="tabular-nums">{row.costCode || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
                {preview.rows.length > 40 ? (
                  <p className="text-xs text-muted-foreground">Showing the first 40 of {preview.rows.length} rows.</p>
                ) : null}
                {preview.issues.length > 0 ? (
                  <ul className="max-h-32 overflow-auto text-xs text-muted-foreground">
                    {preview.issues.slice(0, 20).map((issue) => (
                      <li key={`${issue.line}:${issue.message}`}>
                        Line {issue.line}: {issue.message}
                      </li>
                    ))}
                    {preview.issues.length > 20 ? <li>…and {preview.issues.length - 20} more.</li> : null}
                  </ul>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={importing || preview.rows.length === 0} onClick={() => void confirmImport()}>
                    {importing ? "Importing…" : `Import ${preview.rows.length} item${preview.rows.length === 1 ? "" : "s"}`}
                  </Button>
                  <Button type="button" variant="ghost" disabled={importing} onClick={() => setPreview(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : selectedItems.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadCatalogCsv("price-book.csv", catalogToCsv(selectedItems))}
          >
            Download this list
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search items"
          className="sm:w-56"
        />
        <Select
          value={kind}
          onValueChange={(value) =>
            setKind(CATALOG_KINDS.includes(value as CatalogKind) ? (value as CatalogKind) : "all")
          }
          items={[
            { value: "all", label: "All kinds" },
            ...CATALOG_KINDS.map((item) => ({
              value: item,
              label: CATALOG_KIND_LABELS[item],
            })),
          ]}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {CATALOG_KINDS.map((item) => (
              <SelectItem key={item} value={item}>
                {CATALOG_KIND_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canEdit ? (
          <Button className="sm:ml-auto" onClick={() => setCreateOpen(true)}>
            New item
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={filteredEmpty ? "No items match these filters" : canEdit ? "This price list is empty" : "No items on this list"}
          description={
            filteredEmpty
              ? "Clear the search or kind filter."
              : canEdit
                ? "Upload a CSV of this list, or add labor, material, and subcontract lines one at a time."
                : "Outdated lists keep their items. Switch to the current list to add or change prices."
          }
          action={
            filteredEmpty || !canEdit ? undefined : (
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  Upload CSV
                </Button>
                <Button onClick={() => setCreateOpen(true)}>New item</Button>
              </div>
            )
          }
        />
      ) : (
        <>
          <ul className="grid gap-2 sm:hidden">
            {rows.map((item) => (
              <li key={item.id} className="rounded-md border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.costCode || "No code"} · {item.unit}
                      {effectiveCatalogMargin(item.marginPercent, minMargin) > 0
                        ? ` · ${formatMarginPercent(effectiveCatalogMargin(item.marginPercent, minMargin))} → ${formatMoney(catalogProposalUnitPrice(item, crm.company))}`
                        : ""}
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums text-sm">{formatMoney(item.unitCost)}</p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="font-normal">
                    {CATALOG_KIND_LABELS[item.kind]}
                  </Badge>
                  {canEdit ? (
                    <div className="flex gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(item)}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={removingId === item.id}
                        onClick={() => void remove(item)}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-md border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Proposal</TableHead>
                  {canEdit ? (
                    <TableHead className="w-24">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="tabular-nums">{item.costCode || "—"}</TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {CATALOG_KIND_LABELS[item.kind]}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(item.unitCost)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMarginPercent(effectiveCatalogMargin(item.marginPercent, minMargin))}
                      {minMargin > item.marginPercent ? (
                        <span className="block text-[11px] font-normal text-muted-foreground">min</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(catalogProposalUnitPrice(item, crm.company))}
                    </TableCell>
                    {canEdit ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Edit ${item.name}`}
                            onClick={() => setEditing(item)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove ${item.name}`}
                            disabled={removingId === item.id}
                            onClick={() => void remove(item)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <p className="text-sm text-muted-foreground">
        Estimators drop the current list onto a proposal from the estimate writer. Quantity and price stay editable
        there. Existing estimate lines keep the prices they already have.
      </p>

      <CatalogItemDialog open={createOpen} onOpenChange={setCreateOpen} priceListId={selected?.id ?? null} />
      <CatalogItemDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        item={editing}
      />
      <NewPriceListDialog
        open={listOpen}
        onOpenChange={setListOpen}
        copyFrom={selected}
        copyCount={selectedItems.length}
        onCreated={(id) => setSelectedId(id)}
      />
    </div>
  );
}

function NewPriceListDialog({
  open,
  onOpenChange,
  copyFrom,
  copyCount,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copyFrom: PriceList | null;
  copyCount: number;
  onCreated: (id: string) => void;
}) {
  const crm = useCrm();
  const [name, setName] = useState("");
  const [effectiveOn, setEffectiveOn] = useState(localYmd(new Date()));
  const [copyItems, setCopyItems] = useState(true);
  const [pending, setPending] = useState(false);
  const hasSource = copyCount > 0;
  const firstList = (crm.priceLists ?? []).length === 0;

  useEffect(() => {
    if (!open) return;
    setName("");
    setEffectiveOn(localYmd(new Date()));
    setCopyItems(hasSource);
  }, [hasSource, open]);

  async function save() {
    setPending(true);
    try {
      const list = await crm.addPriceList({
        name,
        effectiveOn,
        copyItems: copyItems && hasSource && !firstList,
        copyFromId: copyFrom?.id ?? null,
      });
      toast.success(
        firstList
          ? `${list.name} is the current price list.`
          : `${list.name} is current. The previous list is outdated and still in the book.`,
      );
      onCreated(list.id);
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
          <DialogTitle>New price list</DialogTitle>
          <DialogDescription>
            Name it by the date the book takes effect. This list becomes current. The previous list stays in the
            book as outdated so you can look up old prices — it is not deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="price-list-name">Name</Label>
            <Input
              id="price-list-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="April 2026 price list"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="price-list-date">Effective date</Label>
            <Input
              id="price-list-date"
              type="date"
              value={effectiveOn}
              onChange={(event) => setEffectiveOn(event.target.value)}
            />
          </div>
          {hasSource && !firstList ? (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={copyItems}
                onCheckedChange={(value) => setCopyItems(Boolean(value))}
                className="mt-0.5"
              />
              <span>
                Copy {copyCount} item{copyCount === 1 ? "" : "s"} from{" "}
                {copyFrom ? `${copyFrom.name} (${formatDate(copyFrom.effectiveOn)})` : "the current list"}. New rows,
                same codes and prices. You can edit this list after.
              </span>
            </label>
          ) : firstList && hasSource ? (
            <p className="text-sm text-muted-foreground">
              Existing items move onto this list. When the next book comes out, add another list and outdate this
              one.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={() => void save()}>
            {pending ? "Saving…" : "Add price list"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
