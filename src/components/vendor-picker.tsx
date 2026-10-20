"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  canSearchVendors,
  filterVendorNames,
  VENDOR_SEARCH_MIN,
  vendorSearchNeedle,
} from "@/lib/vendor-search";
import { cn } from "@/lib/utils";

export function VendorPicker({
  value,
  onChange,
  names,
  extraNames = [],
  emptyHint,
  placeholder = "Select a QuickBooks vendor",
  appearance = "select",
}: {
  value: string;
  onChange: (value: string) => void;
  names: string[];
  extraNames?: string[];
  emptyHint?: string;
  placeholder?: string;
  appearance?: "select" | "search";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const all = useMemo(() => {
    const seen = new Set<string>();
    const next: { name: string; source: "qb" | "used" }[] = [];
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push({ name, source: "qb" });
    }
    for (const name of extraNames) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push({ name, source: "used" });
    }
    return next;
  }, [extraNames, names]);

  const typed = query.trim();
  const searching = canSearchVendors(query);
  const visible = filterVendorNames(all, query);
  const hasExact = all.some((item) => item.name.toLowerCase() === vendorSearchNeedle(query));
  const qbVisible = visible.filter((item) => item.source === "qb");
  const usedVisible = visible.filter((item) => item.source === "used");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        className={cn(
          appearance === "search"
            ? "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-white px-3 text-left text-sm font-normal focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            : cn(buttonVariants({ variant: "outline" }), "h-8 w-full justify-between font-normal"),
          !value && "text-muted-foreground",
        )}
      >
        {appearance === "search" ? (
          <Search className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        <span className="truncate">{value || placeholder}</span>
        {appearance === "search" ? null : <ChevronsUpDown className="opacity-50" />}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--anchor-width)] p-0" side="bottom">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Type ${VENDOR_SEARCH_MIN} characters to search`}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {searching
                ? emptyHint || "No matching vendor. Type the name QuickBooks should use."
                : `Type at least ${VENDOR_SEARCH_MIN} characters to search vendors.`}
            </CommandEmpty>
            {searching && typed && !hasExact ? (
              <CommandGroup>
                <CommandItem
                  value={typed}
                  onSelect={() => {
                    onChange(typed);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  Use “{typed}”
                </CommandItem>
              </CommandGroup>
            ) : null}
            {qbVisible.length > 0 ? (
              <CommandGroup heading="QuickBooks vendors">
                {qbVisible.map((item) => (
                    <CommandItem
                      key={`qb-${item.name}`}
                      value={item.name}
                      data-checked={value === item.name || undefined}
                      onSelect={() => {
                        onChange(item.name);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {item.name}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ) : null}
            {usedVisible.length > 0 ? (
              <CommandGroup heading="Used on expenses">
                {usedVisible.map((item) => (
                    <CommandItem
                      key={`used-${item.name}`}
                      value={item.name}
                      data-checked={value === item.name || undefined}
                      onSelect={() => {
                        onChange(item.name);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {item.name}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
