"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const {
    crm,
    form,
    dirty,
    pending,
    logoBusy,
    cardLogoBusy,
    patch,
    save,
    discard,
    uploadLogo,
    removeLogo,
    uploadCardLogo,
    removeCardLogo,
  } = useCompanySettingsDraft();

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
          <CardTitle>Card logo</CardTitle>
          <CardDescription>
            Sits across the top of every digital business card. Use the wide, horizontal version of
            the logo — it prints much larger than the one on paperwork.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <LogoField
            url={crm.company.cardLogoUrl || form.cardLogoUrl}
            busy={cardLogoBusy}
            onPick={uploadCardLogo}
            onRemove={removeCardLogo}
            wide
            emptyLabel="Using the paperwork logo"
            hint="Wide PNG with a transparent background reads best. Under 2 MB. Blank falls back to the logo above."
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
          <CardTitle>Getting paid</CardTitle>
          <CardDescription>
            Payment options on every digital business card. Paste a handle or a profile link —
            homeowners get a tap-through for Venmo, Cash App, and PayPal, and a copy button for
            Zelle. Leave a row blank to hide it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="payment-venmo"
              label="Venmo"
              value={form.paymentVenmo ?? ""}
              onChange={(value) => patch("paymentVenmo", value)}
              placeholder="@t-rock-roofing"
            />
            <Field
              id="payment-zelle"
              label="Zelle"
              value={form.paymentZelle ?? ""}
              onChange={(value) => patch("paymentZelle", value)}
              placeholder="pay@trockroofing.com"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="payment-cashapp"
              label="Cash App"
              value={form.paymentCashapp ?? ""}
              onChange={(value) => patch("paymentCashapp", value)}
              placeholder="$trockroofing"
            />
            <Field
              id="payment-paypal"
              label="PayPal"
              value={form.paymentPaypal ?? ""}
              onChange={(value) => patch("paymentPaypal", value)}
              placeholder="trockroofing"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payment-note">Note</Label>
            <Textarea
              id="payment-note"
              rows={2}
              className="field-sizing-fixed min-h-16 resize-y"
              value={form.paymentNote ?? ""}
              placeholder="Checks payable to T-Rock Roofing & Contracting."
              onChange={(event) => patch("paymentNote", event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Prints under the payment options. Do not put account or routing numbers on a public
              card.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Google review link</CardTitle>
          <CardDescription>
            The company default. Multi-office teams can point each person at their own listing
            under Settings → People.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <Field
            id="google-review-url"
            label="Review link"
            value={form.googleReviewUrl ?? ""}
            onChange={(value) => patch("googleReviewUrl", value)}
            placeholder="https://g.page/r/CxxxxxxxxxxxxEBM/review"
          />
          <p className="text-xs text-muted-foreground">
            In Google Business Profile choose <span className="font-medium">Ask for reviews</span>{" "}
            and paste the short link. Blank hides the review button on cards.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Default email signature</CardTitle>
          <CardDescription>
            Appended to mail this company sends when that person has not set their own sign-off.
            Set each person under Settings → People, or they can edit it on Profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 pt-4">
          <Label htmlFor="company-email-signature">Company signature</Label>
          <Textarea
            id="company-email-signature"
            rows={6}
            className="field-sizing-fixed min-h-32 resize-y"
            value={form.defaultEmailSignature ?? ""}
            placeholder={"Best,\nNorthline Construction\n(303) 555-0140"}
            onChange={(event) => patch("defaultEmailSignature", event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Plain text. New and reply compose start with this unless the sender has their own
            signature. Ask Truss uses the same rule when it sends mail.
          </p>
        </CardContent>
      </Card>
    </form>
  );
}
