"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-chrome";
import { TermsLockPreview } from "@/components/document-terms-fields";
import { SettingsAdminGate } from "@/components/settings-nav";
import {
  CollapsibleTerms,
  SettingsSaveActions,
  useCompanySettingsDraft,
} from "@/components/company-settings-form";
import {
  DEFAULT_ESTIMATE_TERMS,
  DEFAULT_INVOICE_TERMS,
  ESTIMATE_TERMS_HINT,
  INVOICE_TERMS_HINT,
} from "@/lib/document-terms";
import { formatMarginPercent } from "@/lib/catalog-margin";

export default function DocumentSettingsPage() {
  return (
    <SettingsAdminGate>
      <DocumentSettingsForm />
    </SettingsAdminGate>
  );
}

function DocumentSettingsForm() {
  const { form, dirty, pending, patch, save, discard } = useCompanySettingsDraft();

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
        title="Documents"
        description="Company admins write contract language and a proposal margin floor once. New estimates and invoices copy them. Documents already written stay as they are."
        actions={<SettingsSaveActions dirty={dirty} pending={pending} />}
      />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Document terms</CardTitle>
          <CardDescription>
            Payment sections stay editable on each document. Scope, schedule, changes, and contractor
            language stay locked.
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
              Used on new proposals and blank templates. A template with its own terms still wins when you
              start from it. {ESTIMATE_TERMS_HINT}
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
              Used on new invoices, including invoices converted from estimates. Payment terms, not
              proposal terms. {INVOICE_TERMS_HINT}
            </p>
            <TermsLockPreview value={form.defaultInvoiceTerms ?? DEFAULT_INVOICE_TERMS} />
          </CollapsibleTerms>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Proposal margin</CardTitle>
          <CardDescription>
            Catalog items added to a proposal are marked up from unit cost. This company minimum is a
            floor — an item can carry a higher margin of its own. Changing it does not rewrite lines
            already on a proposal. Material orders still copy unit cost.
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
              {(form.minimumMarginPercent ?? 0) > 0
                ? `A $100 cost drops onto a proposal at ${formatMarginPercent(form.minimumMarginPercent ?? 0)} — $${(100 * (1 + (form.minimumMarginPercent ?? 0) / 100)).toFixed(2)} — unless the item’s own margin is higher.`
                : "0% means no floor. Set a number like 20 so every catalog line is marked up at least that much."}
            </p>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
