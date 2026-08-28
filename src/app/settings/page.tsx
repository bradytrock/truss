"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBanner, LoadingScreen, PageHeader, EmptyState } from "@/components/page-chrome";
import { PeopleSettings } from "@/components/people-settings";
import { useCrm } from "@/lib/crm-store";
import { LOGO_ACCEPT } from "@/lib/company-logo";
import { DEFAULT_ESTIMATE_TERMS, DEFAULT_INVOICE_TERMS, ESTIMATE_TERMS_HINT, INVOICE_TERMS_HINT } from "@/lib/document-terms";
import { formatMarginPercent } from "@/lib/catalog-margin";
import { TermsLockPreview } from "@/components/document-terms-fields";
import type { CompanySettings } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const crm = useCrm();
  const [draft, setDraft] = useState<CompanySettings | null>(null);
  const [pending, setPending] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const form = draft ?? crm.company;
  const dirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== JSON.stringify(crm.company),
    [crm.company, draft]
  );

  if (!crm.hydrated) return <LoadingScreen />;

  if (!crm.viewer || !canManageSettings(crm.viewer.role, crm.viewer)) {
    return (
      <EmptyState
        title="Settings are restricted"
        description="Only a company admin can change the business name, invite people, or lock accounts."
        action={
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        }
      />
    );
  }

  function patch<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setDraft((current) => ({ ...(current ?? crm.company), [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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

  return (
    <div className="space-y-6">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Company"
        title="Settings"
        description="Business letterhead, default estimate terms, invoice payment terms, the price book, QuickBooks Desktop, then the people who can sign in. Invite links join this company — they do not open a second one."
      />

      <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Business</CardTitle>
            <CardDescription>How the company is named on paper and in the sidebar.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4">
            <Field
              id="company-name"
              label="Company name"
              value={form.name}
              onChange={(value) => patch("name", value)}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="company-phone"
                label="Main phone"
                value={form.phone}
                onChange={(value) => patch("phone", value)}
                type="tel"
                placeholder="(303) 555-0100"
              />
              <Field
                id="company-email"
                label="Office email"
                value={form.email}
                onChange={(value) => patch("email", value)}
                type="email"
                placeholder="office@company.com"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="company-website"
                label="Website"
                value={form.website}
                onChange={(value) => patch("website", value)}
                placeholder="northlineco.com"
              />
              <Field
                id="company-license"
                label="Contractor license"
                value={form.licenseNumber}
                onChange={(value) => patch("licenseNumber", value)}
                placeholder="CO-GC-00000"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Logo</CardTitle>
            <CardDescription>
              Prints on estimates, invoices, Pages, and client share links.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4">
            <LogoField
              url={crm.company.logoUrl || form.logoUrl}
              busy={logoBusy}
              onPick={async (file) => {
                setLogoBusy(true);
                try {
                  const next = await crm.uploadCompanyLogo(file);
                  if (next) {
                    setDraft((current) =>
                      current
                        ? { ...current, logoUrl: next.logoUrl, logoStoragePath: next.logoStoragePath }
                        : null,
                    );
                  }
                } finally {
                  setLogoBusy(false);
                }
              }}
              onRemove={async () => {
                setLogoBusy(true);
                try {
                  const ok = await crm.removeCompanyLogo();
                  if (ok) {
                    setDraft((current) =>
                      current ? { ...current, logoUrl: "", logoStoragePath: "" } : null,
                    );
                  }
                } finally {
                  setLogoBusy(false);
                }
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Office</CardTitle>
            <CardDescription>Street address printed on estimates and invoices.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4">
            <Field
              id="company-street"
              label="Street"
              value={form.street}
              onChange={(value) => patch("street", value)}
              placeholder="2840 Larimer Street"
            />
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <Field
                  id="company-city"
                  label="City"
                  value={form.city}
                  onChange={(value) => patch("city", value)}
                />
              </div>
              <div className="sm:col-span-1">
                <Field
                  id="company-state"
                  label="State"
                  value={form.state}
                  onChange={(value) => patch("state", value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Field
                  id="company-postal"
                  label="ZIP"
                  value={form.postalCode}
                  onChange={(value) => patch("postalCode", value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Document terms</CardTitle>
            <CardDescription>
              Company admins write the contract language once. New estimates and invoices copy it. Payment sections stay editable on each document; scope, schedule, changes, and contractor language stay locked. Changing these defaults does not rewrite documents already written.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <CollapsibleTerms
              title="Estimate terms"
              preview={form.defaultEstimateTerms ?? DEFAULT_ESTIMATE_TERMS}
              summary="Copied onto new proposals and blank templates."
            >
              <Label htmlFor="default-estimate-terms">Estimate terms</Label>
              <Textarea
                id="default-estimate-terms"
                rows={8}
                className="field-sizing-fixed mt-1.5 max-h-64 min-h-40 resize-y overflow-y-auto"
                style={{ fieldSizing: "fixed" }}
                value={form.defaultEstimateTerms ?? DEFAULT_ESTIMATE_TERMS}
                onChange={(event) => patch("defaultEstimateTerms", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used on new proposals and blank templates. A template with its own terms still wins when you start from it. {ESTIMATE_TERMS_HINT}
              </p>
              <TermsLockPreview value={form.defaultEstimateTerms ?? DEFAULT_ESTIMATE_TERMS} />
            </CollapsibleTerms>
            <CollapsibleTerms
              title="Payment terms"
              preview={form.defaultInvoiceTerms ?? DEFAULT_INVOICE_TERMS}
              summary="Copied onto new invoices, including invoices converted from estimates."
            >
              <Label htmlFor="default-invoice-terms">Payment terms</Label>
              <Textarea
                id="default-invoice-terms"
                rows={8}
                className="field-sizing-fixed mt-1.5 max-h-64 min-h-40 resize-y overflow-y-auto"
                style={{ fieldSizing: "fixed" }}
                value={form.defaultInvoiceTerms ?? DEFAULT_INVOICE_TERMS}
                onChange={(event) => patch("defaultInvoiceTerms", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used on new invoices, including invoices converted from estimates. Payment terms, not proposal terms. {INVOICE_TERMS_HINT}
              </p>
              <TermsLockPreview value={form.defaultInvoiceTerms ?? DEFAULT_INVOICE_TERMS} />
            </CollapsibleTerms>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Proposal margin</CardTitle>
            <CardDescription>
              Catalog items added to a proposal are marked up from unit cost. This company minimum is a floor — an
              item can carry a higher margin of its own. Changing it does not rewrite lines already on a proposal.
              Material orders still copy unit cost.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-4">
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label htmlFor="company-min-margin">Minimum margin</Label>
              <div className="relative">
                <Input
                  id="company-min-margin"
                  type="number"
                  min={0}
                  max={1000}
                  step="0.01"
                  className="pr-8"
                  value={Number.isFinite(form.minimumMarginPercent) ? String(form.minimumMarginPercent) : "0"}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    patch("minimumMarginPercent", Number.isFinite(next) && next >= 0 ? next : 0);
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                { (form.minimumMarginPercent ?? 0) > 0
                  ? `A $100 cost drops onto a proposal at ${formatMarginPercent(form.minimumMarginPercent ?? 0)} — $${(100 * (1 + (form.minimumMarginPercent ?? 0) / 100)).toFixed(2)} — unless the item’s own margin is higher.`
                  : "0% means no floor. Set a number like 20 so every catalog line is marked up at least that much."}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" nativeButton disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setDraft(null)}
            >
              Discard
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">No unsaved changes.</p>
          )}
        </div>
      </form>

      <Card className="max-w-2xl">
        <CardHeader className="border-b">
          <CardTitle>Price book</CardTitle>
          <CardDescription>
            Labor, material, equipment, allowances, and subcontract packages estimators drop onto a proposal. Upload a
            CSV to load the catalog at once.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Button nativeButton={false} render={<Link href="/settings/price-book" />}>
            Open price book
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader className="border-b">
          <CardTitle>QuickBooks Desktop</CardTitle>
          <CardDescription>
            Web Connector posts approved invoices and job expenses onto Customer:Job so accounting does not retype them.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Button nativeButton={false} render={<Link href="/settings/quickbooks" />}>
            Open QuickBooks connector
          </Button>
        </CardContent>
      </Card>

      <div className="max-w-4xl">
        <PeopleSettings
          staff={crm.book.staff}
          viewerId={crm.viewer.id}
          onInvite={crm.inviteStaff}
          onUpdate={crm.updateStaffAccount}
          onRefreshInvite={crm.refreshStaffInvite}
          onRemove={crm.removeStaff}
        />
      </div>
    </div>
  );
}

function CollapsibleTerms({
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

function Field({
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

function LogoField({
  url,
  busy,
  onPick,
  onRemove,
}: {
  url?: string;
  busy: boolean;
  onPick: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = url?.trim() ?? "";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex h-20 w-36 items-center justify-center border bg-muted/40">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Company logo" className="max-h-16 max-w-32 object-contain" />
        ) : (
          <p className="px-2 text-center text-xs text-muted-foreground">No logo yet</p>
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
        <p className="basis-full text-xs text-muted-foreground">PNG, JPG, WebP, or GIF. Under 2 MB.</p>
      </div>
    </div>
  );
}
