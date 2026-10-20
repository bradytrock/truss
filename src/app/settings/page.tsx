"use client";

import Link from "next/link";
import { CurrencyInput } from "@/components/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPageHeader } from "@/components/settings-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";
import {
  Field,
  LogoField,
  useCompanySettingsDraft,
} from "@/components/company-settings-form";
import { EmailTemplateSettings } from "@/components/email-template-settings";
import { creatorInitials, jobDateStamp, nextJobCode } from "@/lib/job-code";
import { LEGAL_EMAIL, LEGAL_PAGES } from "@/lib/legal";
import { WebsiteChatSnippet } from "@/components/website-chat-snippet";

export default function CompanySettingsPage() {
  return (
    <SettingsAdminGate>
      <CompanySettingsBody />
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
      className="space-y-4"
    >
      <SettingsPageHeader
        eyebrow="Company"
        title="Company profile"
        description={`How ${form.name.trim() || "the company"} shows up on estimates, contracts, emails, texts, and the mobile app.`}
      />

      <Card className="rounded-2xl border-[#ebe7e2] shadow-sm">
        <CardHeader className="border-b">
          <CardTitle>Identity</CardTitle>
          <CardDescription>Your logo and names print on every customer-facing document.</CardDescription>
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

      <WebsiteChatEmbed slug={form.slug} />

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
          <CardTitle>Monthly sales goal</CardTitle>
          <CardDescription>
            Default signed-contract quota for the month. The home Goal bar uses this for anyone
            without a personal override. Team leads and company admins see a combined team goal.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="company-default-quota">Company default quota</Label>
            <CurrencyInput
              id="company-default-quota"
              value={
                typeof form.defaultMonthlySalesQuota === "number" &&
                Number.isFinite(form.defaultMonthlySalesQuota)
                  ? form.defaultMonthlySalesQuota
                  : 0
              }
              onValueChange={(text) => {
                const next = Number(text);
                patch(
                  "defaultMonthlySalesQuota",
                  text === "" || !Number.isFinite(next) || next < 0 ? 0 : next,
                );
              }}
            />
            <p className="text-xs text-muted-foreground">
              Sold this month is signed contract value (accepted proposals), not invoices. Override
              a seat under Settings → People when someone carries a different number.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Social pages</CardTitle>
          <CardDescription>
            Buttons on every digital business card, next to the website homepage above. Paste a
            handle or the full page link. Leave a row blank to hide it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="social-facebook"
              label="Facebook"
              value={form.socialFacebook ?? ""}
              onChange={(value) => patch("socialFacebook", value)}
              placeholder="trockroofing"
            />
            <Field
              id="social-instagram"
              label="Instagram"
              value={form.socialInstagram ?? ""}
              onChange={(value) => patch("socialInstagram", value)}
              placeholder="@trockroofing"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="social-youtube"
              label="YouTube"
              value={form.socialYoutube ?? ""}
              onChange={(value) => patch("socialYoutube", value)}
              placeholder="@trockroofing"
            />
            <Field
              id="social-linkedin"
              label="LinkedIn"
              value={form.socialLinkedin ?? ""}
              onChange={(value) => patch("socialLinkedin", value)}
              placeholder="trock-roofing"
            />
          </div>
          <Field
            id="social-tiktok"
            label="TikTok"
            value={form.socialTiktok ?? ""}
            onChange={(value) => patch("socialTiktok", value)}
            placeholder="@trockroofing"
          />
          <p className="text-xs text-muted-foreground">
            The website homepage under Business is linked on the card too — no need to repeat it
            here.
          </p>
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
          <CardTitle>Email templates</CardTitle>
          <CardDescription>
            Wording for every email the system sends. Change a subject, headline, message, or
            button here and the next send uses it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 pt-4">
          <EmailTemplateSettings
            templates={form.emailTemplates}
            onChange={(emailTemplates) => patch("emailTemplates", emailTemplates)}
          />
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
            signature. Ask Cassio uses the same rule when it sends mail.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-[#ebe7e2] shadow-sm">
        <CardHeader className="border-b">
          <CardTitle>Brand color</CardTitle>
          <CardDescription>
            Used on estimates, emails, and the iOS widgets and Live Activity so every surface matches.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4 pt-4">
          <span className="size-9 rounded-lg bg-primary" />
          <span className="size-9 rounded-lg bg-neutral-950" />
          <span className="size-9 rounded-lg bg-[#243044]" />
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Hex</span>
            <span className="rounded-lg border bg-[#fbfaf8] px-3 py-1.5 font-mono text-sm">#D71C27</span>
          </div>
          <span className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
            Approve estimate
          </span>
          <p className="basis-full text-xs text-muted-foreground">Preview of the brand red on a customer email.</p>
        </CardContent>
      </Card>

      <JobNumberCard ownerName={crm.viewer?.name || crm.user.name || "Office"} codes={crm.jobs.map((job) => job.code)} />

      <div className="flex justify-end gap-2">
        <Button type="reset" variant="outline" className="rounded-lg bg-white" disabled={pending || !dirty}>
          Discard
        </Button>
        <Button type="submit" className="rounded-lg" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function JobNumberCard({ ownerName, codes }: { ownerName: string; codes: Array<string | undefined> }) {
  const stamp = jobDateStamp(new Date());
  const initials = creatorInitials(ownerName);
  const next = nextJobCode(
    ownerName,
    new Date(),
    codes.filter((code): code is string => Boolean(code)),
  );
  const letter = next.split("-").pop() || "A";
  return (
    <Card className="rounded-2xl border-[#ebe7e2] shadow-sm">
      <CardHeader className="border-b">
        <CardTitle>Job numbers</CardTitle>
        <CardDescription>Every new lead gets a code the crew can say over the phone.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
        <div className="rounded-xl bg-[#f6f4f1] px-4 py-3">
          <p className="font-mono text-lg font-medium">{initials}</p>
          <p className="text-xs text-muted-foreground">Rep’s first + last initial</p>
        </div>
        <div className="rounded-xl bg-[#f6f4f1] px-4 py-3">
          <p className="font-mono text-lg font-medium">{stamp}</p>
          <p className="text-xs text-muted-foreground">Date lead opened (MMDDYY)</p>
        </div>
        <div className="rounded-xl bg-[#f6f4f1] px-4 py-3">
          <p className="font-mono text-lg font-medium">-{letter}</p>
          <p className="text-xs text-muted-foreground">Next letter that day</p>
        </div>
        <p className="text-sm text-muted-foreground sm:col-span-3">
          Today’s next code for you: <span className="rounded-full bg-neutral-950 px-2 py-0.5 font-mono text-xs text-white">{next}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function WebsiteChatEmbed({ slug }: { slug: string }) {
  const company = slug.trim() || "your-company";

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Website chat</CardTitle>
        <CardDescription>
          Asks the same qualifying questions as a new lead: residential or commercial, the trades
          involved, name, phone, email, and address, then opens a lead. Company admins are
          notified so they can assign it. The visitor can keep talking here or text this office&apos;s
          Photon line. A person’s own header code, on their profile, puts the lead in that person’s
          pipeline and notifies only them.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4">
        <WebsiteChatSnippet company={company} fieldId="website-chat-snippet" />
        <p className="text-xs text-muted-foreground">
          The conversation shows up in Inbox under Website. Connect Photon so a text starts on that line.
        </p>
      </CardContent>
    </Card>
  );
}

function CompanySettingsBody() {
  return (
    <>
      <CompanySettingsForm />
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Legal</CardTitle>
            <CardDescription>
              Privacy, terms, and cookies for Truss. Questions go to {LEGAL_EMAIL}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {LEGAL_PAGES.map((page) => (
              <Link key={page.href} href={page.href} className="font-medium text-primary hover:underline">
                {page.label}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
