"use client";

import { useMemo, useRef, useState } from "react";
import { Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { CatalogItemDialog } from "@/components/catalog-item-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { formatMoney } from "@/lib/format";
import {
  CATALOG_KIND_LABELS,
  CATALOG_KINDS,
  type CatalogItem,
  type CatalogKind,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type KindFilter = CatalogKind | "all";

export function PriceBookPanel() {
  const crm = useCrm();
  const minMargin = crm.company.minimumMarginPercent ?? 0;
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof parseCatalogCsv> | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...crm.catalog]
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
  }, [crm.catalog, kind, query]);

  async function remove(item: CatalogItem) {
    if (!window.confirm(`Remove ${item.name} from the price book? Estimates that already used it keep their prices.`)) {
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
      const result = await crm.importCatalogItems(preview.rows);
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

  const filteredEmpty = crm.catalog.length > 0 && rows.length === 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Mass upload</CardTitle>
          <CardDescription>
            CSV with name, kind, unit, unit cost, cost code, and optional margin percent. Rows with a matching cost
            code (or the same name and kind) update; the rest are added. Changing a unit cost or margin here does not
            rewrite lines already on a proposal. The company minimum margin in Settings is a floor when an item is
            dropped onto a proposal.
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
              {crm.catalog.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => downloadCatalogCsv("price-book.csv", catalogToCsv(crm.catalog))}
                >
                  Download book
                </Button>
              ) : null}
            </div>
          </div>

          {preview ? (
            <div className="grid gap-3">
              <p className="text-sm">
                {preview.rows.length} ready to import
                {preview.issues.length ? ` · ${preview.issues.length} row${preview.issues.length === 1 ? "" : "s"} skipped` : ""}.
                Matching cost codes update the existing item.
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
        <Button className="sm:ml-auto" onClick={() => setCreateOpen(true)}>
          New item
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={filteredEmpty ? "No items match these filters" : "Price book is empty"}
          description={
            filteredEmpty
              ? "Clear the search or kind filter."
              : "Upload a CSV of this company’s catalog, or add labor, material, and subcontract lines one at a time."
          }
          action={
            filteredEmpty ? undefined : (
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
                  <TableHead className="w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <p className="text-sm text-muted-foreground">
        Estimators drop these onto a proposal from the estimate writer. Quantity and price stay editable there.
      </p>

      <CatalogItemDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CatalogItemDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        item={editing}
      />
    </div>
  );
}
