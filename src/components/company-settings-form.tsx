"use client";

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrm } from "@/lib/crm-store";
import { LOGO_ACCEPT } from "@/lib/company-logo";
import type { CompanySettings } from "@/lib/types";
import { cn } from "@/lib/utils";

export function useCompanySettingsDraft() {
  const crm = useCrm();
  const [draft, setDraft] = useState<CompanySettings | null>(null);
  const [pending, setPending] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [cardLogoBusy, setCardLogoBusy] = useState(false);
  const form = draft ?? crm.company;
  const dirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== JSON.stringify(crm.company),
    [crm.company, draft],
  );

  function patch<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setDraft((current) => ({ ...(current ?? crm.company), [key]: value }));
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setPending(true);
    try {
      const saved = await crm.updateCompany({
        ...form,
        logoUrl: crm.company.logoUrl,
        logoStoragePath: crm.company.logoStoragePath,
      });
      if (saved) setDraft(null);
    } finally {
      setPending(false);
    }
  }

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    try {
      const next = await crm.uploadCompanyLogo(file);
      if (next) {
        setDraft((current) =>
          current ? { ...current, logoUrl: next.logoUrl, logoStoragePath: next.logoStoragePath } : null,
        );
      }
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    try {
      const ok = await crm.removeCompanyLogo();
      if (ok) {
        setDraft((current) => (current ? { ...current, logoUrl: "", logoStoragePath: "" } : null));
      }
    } finally {
      setLogoBusy(false);
    }
  }

  async function uploadCardLogo(file: File) {
    setCardLogoBusy(true);
    try {
      const next = await crm.uploadCompanyLogo(file, "card");
      if (next) {
        setDraft((current) =>
          current
            ? {
                ...current,
                cardLogoUrl: next.cardLogoUrl,
                cardLogoStoragePath: next.cardLogoStoragePath,
              }
            : null,
        );
      }
    } finally {
      setCardLogoBusy(false);
    }
  }

  async function removeCardLogo() {
    setCardLogoBusy(true);
    try {
      const ok = await crm.removeCompanyLogo("card");
      if (ok) {
        setDraft((current) =>
          current ? { ...current, cardLogoUrl: "", cardLogoStoragePath: "" } : null,
        );
      }
    } finally {
      setCardLogoBusy(false);
    }
  }

  return {
    crm,
    form,
    dirty,
    pending,
    logoBusy,
    cardLogoBusy,
    patch,
    save,
    discard: () => setDraft(null),
    uploadLogo,
    removeLogo,
    uploadCardLogo,
    removeCardLogo,
  };
}

export function SettingsSaveActions({
  dirty,
  pending,
}: {
  dirty: boolean;
  pending: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" nativeButton disabled={pending || !dirty}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {dirty ? (
        <Button type="reset" variant="ghost" disabled={pending}>
          Discard
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">No unsaved changes.</p>
      )}
    </div>
  );
}

export function Field({
  id,
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
      />
    </div>
  );
}

export function LogoField({
  url,
  busy,
  onPick,
  onRemove,
  wide = false,
  emptyLabel = "No logo yet",
  hint = "PNG, JPG, WebP, or GIF. Under 2 MB.",
}: {
  url?: string;
  busy: boolean;
  onPick: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  /** Preview shaped for a horizontal lockup instead of a square mark. */
  wide?: boolean;
  emptyLabel?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = url?.trim() ?? "";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div
        className={cn(
          "flex items-center justify-center border bg-muted/40",
          wide ? "h-20 w-full sm:w-64" : "h-20 w-36",
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Company logo"
            className={cn("object-contain", wide ? "max-h-16 max-w-60" : "max-h-16 max-w-32")}
          />
        ) : (
          <p className="px-2 text-center text-xs text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={LOGO_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onPick(file);
          }}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Uploading…" : preview ? "Replace logo" : "Upload logo"}
        </Button>
        {preview ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void onRemove()}>
            Remove
          </Button>
        ) : null}
        <p className="basis-full text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

export function CollapsibleTerms({
  title,
  preview,
  summary,
  children,
}: {
  title: string;
  preview: string;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const snippet = preview.replace(/\s+/g, " ").trim().slice(0, 160);
  return (
    <div className="border-t first:border-t-0">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          <span className={cn("mt-1 block text-xs text-muted-foreground", !open && "line-clamp-2")}>
            {open ? summary : snippet || summary}
          </span>
        </span>
        <ChevronDown
          className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? <div className="grid gap-2 pb-4">{children}</div> : null}
    </div>
  );
}
