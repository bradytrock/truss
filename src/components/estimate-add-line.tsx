"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { catalogProposalUnitPrice } from "@/lib/catalog-margin";
import { catalogItemsMatchingQuery } from "@/lib/catalog-pick";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import { currentCatalog } from "@/lib/price-lists";

export function EstimateAddLine({
  onPickCatalog,
  onCustom,
  onBrowse,
  placeholder = "Add from the price book, or type a custom item",
}: {
  onPickCatalog: (catalogItemId: string) => void | Promise<void>;
  onCustom: (title: string) => void | Promise<void>;
  onBrowse?: () => void;
  placeholder?: string;
}) {
  const { catalog, company, priceLists } = useCrm();
  const items = useMemo(() => currentCatalog(catalog, priceLists ?? []), [catalog, priceLists]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const matches = catalogItemsMatchingQuery(items, query);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, []);

  async function pickCatalog(id: string) {
    if (pending) return;
    setPending(true);
    try {
      await onPickCatalog(id);
      setQuery("");
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  async function pickCustom() {
    if (pending) return;
    setPending(true);
    try {
      await onCustom(query.trim() || "New item");
      setQuery("");
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <Input
        value={query}
        disabled={pending}
        placeholder={placeholder}
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (matches[0]) void pickCatalog(matches[0].id);
          else void pickCustom();
        }}
      />
      {open ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover py-1 text-sm shadow-md">
          {matches.length === 0 && items.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground">Price book is empty.</p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground">No book items match that search.</p>
          ) : (
            matches.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted/70"
                onClick={() => void pickCatalog(item.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {item.costCode} · {item.unit}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatMoney(catalogProposalUnitPrice(item, company))}
                </span>
              </button>
            ))
          )}
          <button
            type="button"
            className="flex w-full px-3 py-2 text-left hover:bg-muted/70"
            onClick={() => void pickCustom()}
          >
            <span>
              Custom item
              {query.trim() ? (
                <span className="text-muted-foreground"> · {query.trim()}</span>
              ) : null}
            </span>
          </button>
          {onBrowse ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex w-full px-3 py-2 text-left text-xs hover:bg-muted/70"
              onClick={() => {
                setOpen(false);
                onBrowse();
              }}
            >
              Browse the whole book
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
