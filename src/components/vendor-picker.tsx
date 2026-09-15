"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
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
}: {
  value: string;
  onChange: (value: string) => void;
  names: string[];
  extraNames?: string[];
  emptyHint?: string;
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
          buttonVariants({ variant: "outline" }),
          "h-8 w-full justify-between font-normal",
        )}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value || "Select a QuickBooks vendor"}
        </span>
        <ChevronsUpDown className="opacity-50" />
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
