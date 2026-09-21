"use client";

import { Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
  addCompanyContractType,
  contractTypesFromCompany,
  patchCompanyContractType,
  removeCompanyContractType,
  setDefaultCompanyContractType,
} from "@/lib/contract-types";
import {
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
  const contracts = contractTypesFromCompany(form);

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
        description="Company admins keep every contract type the company needs. Unsigned proposals follow the contract you pick. Signed proposals and sent invoices stay as they were."
        actions={<SettingsSaveActions dirty={dirty} pending={pending} />}
      />

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Contracts</CardTitle>
              <CardDescription>
                Residential, commercial, insurance, repairs — keep every contract type on file. New
                proposals use the default. Payment sections stay editable on each document; locked
                language comes from the contract you pick.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch("contractTypes", addCompanyContractType(contracts))}
            >
              <Plus data-icon="inline-start" />
              Add contract
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {contracts.map((contract) => (
            <div key={contract.id} className="rounded-md border">
              <CollapsibleTerms
                title={contract.name}
                preview={contract.body}
                summary={
                  contract.isDefault
                    ? "Default on new proposals. Used on every unsigned proposal that uses this contract."
                    : "Available when you start or edit a proposal."
                }
              >
                <div className="grid gap-3">
                  <div className="grid gap-1.5 sm:max-w-sm">
                    <Label htmlFor={`contract-name-${contract.id}`}>Name</Label>
                    <Input
                      id={`contract-name-${contract.id}`}
                      value={contract.name}
                      onChange={(event) =>
                        patch(
                          "contractTypes",
                          patchCompanyContractType(contracts, contract.id, {
                            name: event.target.value,
                          }),
                        )
                      }
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="default-contract"
                      checked={contract.isDefault}
                      onChange={() =>
                        patch("contractTypes", setDefaultCompanyContractType(contracts, contract.id))
                      }
                    />
                    Default contract
                  </label>
                  <div>
                    <Label htmlFor={`contract-body-${contract.id}`}>Contract language</Label>
                    <Textarea
                      id={`contract-body-${contract.id}`}
                      rows={8}
                      className="field-sizing-fixed mt-1.5 max-h-64 min-h-40 resize-y overflow-y-auto"
                      style={{ fieldSizing: "fixed" }}
                      value={contract.body}
                      onChange={(event) =>
                        patch(
                          "contractTypes",
                          patchCompanyContractType(contracts, contract.id, {
                            body: event.target.value,
                          }),
                        )
                      }
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      A signed proposal keeps the language it was signed with. A template with its own
                      terms still wins when you start from it. {ESTIMATE_TERMS_HINT}
                    </p>
                    <TermsLockPreview value={contract.body} />
                  </div>
                  {contracts.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="justify-start text-destructive"
                      onClick={() =>
                        patch("contractTypes", removeCompanyContractType(contracts, contract.id))
                      }
                    >
                      <Trash2 data-icon="inline-start" />
                      Remove contract
                    </Button>
                  ) : null}
                </div>
              </CollapsibleTerms>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Invoice terms</CardTitle>
          <CardDescription>
            Payment sections stay editable on each invoice. Locked language comes from this company
            default.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <CollapsibleTerms
            title="Payment terms"
            preview={form.defaultInvoiceTerms ?? DEFAULT_INVOICE_TERMS}
            summary="Used on new invoices and draft invoices. Sent invoices stay as written."
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
              Used on new invoices and every draft invoice, including invoices converted from estimates.
              Sent invoices stay as written. Payment terms, not proposal terms. {INVOICE_TERMS_HINT}
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
