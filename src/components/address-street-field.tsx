"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { shouldSuggestAddress, type SuggestedAddress } from "@/lib/address-suggest";
import { cn } from "@/lib/utils";

type AddressStreetFieldProps = {
  id?: string;
  street: string;
  city?: string;
  state?: string;
  onStreetChange: (street: string) => void;
  onPick: (address: SuggestedAddress) => void;
  placeholder?: string;
  disabled?: boolean;
  withPin?: boolean;
  className?: string;
};

export function AddressStreetField({
  id,
  street,
  city = "",
  state = "",
  onStreetChange,
  onPick,
  placeholder = "Start typing an address...",
  disabled,
  withPin = false,
  className,
}: AddressStreetFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pickedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedAddress[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (pickedRef.current) {
      pickedRef.current = false;
      setSuggestions([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    if (disabled || !shouldSuggestAddress(street)) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ q: street.trim() });
      if (city.trim()) params.set("city", city.trim());
      if (state.trim()) params.set("state", state.trim());
      void fetch(`/api/addresses/suggest?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return { suggestions: [] as SuggestedAddress[] };
          return (await response.json()) as { suggestions?: SuggestedAddress[] };
        })
        .then((body) => {
          setSuggestions(body.suggestions ?? []);
          setActive(0);
          setOpen(true);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [street, city, state, disabled]);

  const showList = open && !disabled && (loading || suggestions.length > 0);

  useLayoutEffect(() => {
    if (!showList) return;
    function sync() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setBox({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [showList, suggestions.length]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function pick(row: SuggestedAddress) {
    pickedRef.current = true;
    onPick(row);
    setSuggestions([]);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (event.key === "Escape") setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      const row = suggestions[active];
      if (row) {
        event.preventDefault();
        pick(row);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  const inputProps = {
    id,
    value: street,
    disabled,
    placeholder,
    autoComplete: "off" as const,
    role: "combobox" as const,
    "aria-expanded": showList,
    "aria-controls": listId,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant": showList && suggestions[active] ? `${listId}-${active}` : undefined,
    onFocus: () => {
      if (suggestions.length > 0) setOpen(true);
    },
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      onStreetChange(event.target.value);
      setOpen(true);
    },
    onKeyDown,
  };

  const list =
    mounted && showList && box
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{ top: box.top, left: box.left, width: box.width }}
            className="fixed isolate z-[100] max-h-56 overflow-auto border bg-popover py-1 text-sm shadow-md"
          >
            {suggestions.length === 0 ? (
              <li className="px-2.5 py-2 text-muted-foreground">Looking up addresses…</li>
            ) : (
              suggestions.map((row, index) => (
                <li key={row.id} role="none">
                  <button
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={cn(
                      "flex w-full flex-col items-start px-2.5 py-1.5 text-left hover:bg-muted/60",
                      index === active && "bg-muted/60",
                    )}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(row)}
                  >
                    <span className="font-medium">{row.street || row.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {[row.city, row.state].filter(Boolean).join(", ")}
                      {row.postalCode ? ` ${row.postalCode}` : ""}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {withPin ? (
        <InputGroup>
          <InputGroupAddon>
            <MapPin />
          </InputGroupAddon>
          <InputGroupInput {...inputProps} />
        </InputGroup>
      ) : (
        <Input {...inputProps} />
      )}
      {list}
    </div>
  );
}
