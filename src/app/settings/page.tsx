"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";
import {
  Field,
  LogoField,
  SettingsSaveActions,
  useCompanySettingsDraft,
} from "@/components/company-settings-form";

export default function CompanySettingsPage() {
  return (
    <SettingsAdminGate>
      <CompanySettingsForm />
    </SettingsAdminGate>
  );
}

function CompanySettingsForm() {
  const { crm, form, dirty, pending, logoBusy, patch, save, discard, uploadLogo, removeLogo } =
    useCompanySettingsDraft();

  return (
    <form
      onSubmit={(event) => void save(event)}
      onReset={(event) => {
        event.preventDefault();
        discard();
      }}
      className="max-w-2xl space-y-4"
    >
      <PageHeader
        eyebrow="Settings"
        title="Company"
        description="How the company is named on paper, in the sidebar, and on estimates, invoices, and public cards."
        actions={<SettingsSaveActions dirty={dirty} pending={pending} />}
      />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Business</CardTitle>
          <CardDescription>Letterhead and how people reach the office.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <Field
            id="company-name"
            label="Company name"
            value={form.name}
            onChange={(value) => patch("name", value)}
            required
          />
          <div className="grid gap-1.5">
            <Field
              id="company-slug"
              label="Card URL"
              value={form.slug}
              onChange={(value) => patch("slug", value)}
              placeholder="northline-construction"
            />
            <p className="text-xs text-muted-foreground">
              Public cards live at{" "}
              <span className="font-mono">
                /{form.slug.trim() || "your-company"}/card/first.last
              </span>
              . Changing this breaks existing NFC and QR links.
            </p>
          </div>
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
          <CardDescription>Prints on estimates, invoices, Pages, and client share links.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <LogoField
            url={crm.company.logoUrl || form.logoUrl}
            busy={logoBusy}
            onPick={uploadLogo}
            onRemove={removeLogo}
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
    </form>
  );
}
