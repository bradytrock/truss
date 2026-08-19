"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import type { CompanySettings } from "@/lib/types";

export default function SettingsPage() {
  const crm = useCrm();
  const [draft, setDraft] = useState<CompanySettings | null>(null);
  const [pending, setPending] = useState(false);
  const form = draft ?? crm.company;
  const dirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== JSON.stringify(crm.company),
    [crm.company, draft]
  );

  if (!crm.hydrated) return <LoadingScreen />;

  function patch<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setDraft((current) => ({ ...(current ?? crm.company), [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const saved = await crm.updateCompany(form);
      if (saved) setDraft(null);
    } finally {
      setPending(false);
    }
  }

  const readOnly = !crm.canEditCompany;

  return (
    <div className="space-y-6">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        eyebrow="Company"
        title="Settings"
        description="The name, phone, and address that appear on proposals and invoices. This is the contractor, not a homeowner."
      />

      {readOnly ? (
        <p className="border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          You can view these details. Only a company admin can change them.
        </p>
      ) : null}

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
              disabled={readOnly}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="company-phone"
                label="Main phone"
                value={form.phone}
                onChange={(value) => patch("phone", value)}
                disabled={readOnly}
                type="tel"
                placeholder="(303) 555-0100"
              />
              <Field
                id="company-email"
                label="Office email"
                value={form.email}
                onChange={(value) => patch("email", value)}
                disabled={readOnly}
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
                disabled={readOnly}
                placeholder="northlineco.com"
              />
              <Field
                id="company-license"
                label="Contractor license"
                value={form.licenseNumber}
                onChange={(value) => patch("licenseNumber", value)}
                disabled={readOnly}
                placeholder="CO-GC-00000"
              />
            </div>
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
              disabled={readOnly}
              placeholder="2840 Larimer Street"
            />
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <Field
                  id="company-city"
                  label="City"
                  value={form.city}
                  onChange={(value) => patch("city", value)}
                  disabled={readOnly}
                />
              </div>
              <div className="sm:col-span-1">
                <Field
                  id="company-state"
                  label="State"
                  value={form.state}
                  onChange={(value) => patch("state", value)}
                  disabled={readOnly}
                />
              </div>
              <div className="sm:col-span-2">
                <Field
                  id="company-postal"
                  label="ZIP"
                  value={form.postalCode}
                  onChange={(value) => patch("postalCode", value)}
                  disabled={readOnly}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {!readOnly ? (
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
        ) : null}
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  disabled,
  required,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
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
        disabled={disabled}
        required={required}
        placeholder={placeholder}
      />
    </div>
  );
}
