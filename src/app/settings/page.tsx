"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner, LoadingScreen, PageHeader, EmptyState } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import type { CompanySettings } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";

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

  if (!crm.viewer || !canManageSettings(crm.viewer.role)) {
    return (
      <EmptyState
        title="Settings are restricted"
        description="Only a company admin can change the business name, phone, and office address."
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
      const saved = await crm.updateCompany(form);
      if (saved) setDraft(null);
    } finally {
      setPending(false);
    }
  }

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

      <TextingCard />
    </div>
  );
}

function TextingCard() {
  const [status, setStatus] = useState<{ configured: boolean; fromNumber: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/share/text")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { configured: boolean; fromNumber: string } | null) => {
        if (!cancelled && data) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ configured: false, fromNumber: "" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="max-w-2xl">
      <CardHeader className="border-b">
        <CardTitle>Texting</CardTitle>
        <CardDescription>
          Sendblue iMessage/SMS for estimate and invoice share links. Keys stay in{" "}
          <code>.env.local</code>, not in this form.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 pt-4 text-sm">
        {status === null ? (
          <p className="text-muted-foreground">Checking Sendblue…</p>
        ) : status.configured ? (
          <p>
            Connected{status.fromNumber ? ` (${status.fromNumber})` : ""}. Send proposal and Share
            invoice can text the homeowner, or you can copy the link.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Not connected. Copy the client link from any estimate or invoice. To text it, add{" "}
            <code>SENDBLUE_API_KEY_ID</code>, <code>SENDBLUE_API_SECRET_KEY</code>, and{" "}
            <code>SENDBLUE_FROM_NUMBER</code> to <code>.env.local</code>.
          </p>
        )}
      </CardContent>
    </Card>
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
