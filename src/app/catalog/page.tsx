"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CatalogItemDialog } from "@/components/catalog-item-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import {
  CATALOG_KIND_LABELS,
  CATALOG_KINDS,
  type CatalogItem,
  type CatalogKind,
} from "@/lib/types";

type KindFilter = CatalogKind | "all";

export default function CatalogPage() {
  const crm = useCrm();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

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

  if (!crm.hydrated) return <LoadingScreen />;

  const filteredEmpty = crm.catalog.length > 0 && rows.length === 0;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Preconstruction"
        title="Price book"
        description="Company catalog of labor, material, equipment, allowances, and subcontract packages. Estimators drop these onto a proposal; quantity and price stay editable there."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items"
              className="sm:w-56"
            />
            <Select
              value={kind}
              onValueChange={(value) =>
                setKind(
                  CATALOG_KINDS.includes(value as CatalogKind) ? (value as CatalogKind) : "all",
                )
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
            <Button nativeButton={false} variant="outline" render={<Link href="/estimates" />}>
              Estimates
            </Button>
            <Button onClick={() => setCreateOpen(true)}>New item</Button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title={filteredEmpty ? "No items match these filters" : "Price book is empty"}
          description={
            filteredEmpty
              ? "Clear the search or kind filter."
              : "Add the labor, material, and subcontract lines this company prices every week."
          }
          action={
            filteredEmpty ? undefined : <Button onClick={() => setCreateOpen(true)}>New item</Button>
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
        New estimates pull from this book. Changing a unit cost here does not rewrite lines already on a proposal.
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
