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
  const needle = typed.toLowerCase();
  const visible = needle
    ? all.filter((item) => item.name.toLowerCase().includes(needle))
    : all;
  const hasExact = all.some((item) => item.name.toLowerCase() === needle);
  const qbVisible = visible.filter((item) => item.source === "qb");
  const usedVisible = visible.filter((item) => item.source === "used");

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            placeholder="Search vendors"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {emptyHint || "No matching vendor. Type the name QuickBooks should use."}
            </CommandEmpty>
            {typed && !hasExact ? (
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
