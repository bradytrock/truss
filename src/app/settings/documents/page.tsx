"use client";

import { Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPageHeader } from "@/components/settings-chrome";
import { TermsLockPreview } from "@/components/document-terms-fields";
import { SettingsAdminGate } from "@/components/settings-nav";
import {
  CollapsibleTerms,
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
      className="space-y-4"
    >
      <SettingsPageHeader
        eyebrow="Sales"
        title="Documents & margin"
        description="The contracts homeowners sign, and the margin guardrail every estimate is checked against."
        actions={
          <Button
            type="button"
            className="rounded-lg"
            onClick={() => patch("contractTypes", addCompanyContractType(contracts))}
          >
            <Plus data-icon="inline-start" />
            New template
          </Button>
        }
      />

      <Card className="rounded-2xl border-[#ebe7e2] shadow-sm">
        <CardHeader className="border-b">
          <div>
            <CardTitle>Templates</CardTitle>
            <CardDescription>
              Fields like the homeowner’s name, address, and estimate total fill in automatically.
              Unsigned proposals follow the contract you pick. Signed proposals stay as they were.
            </CardDescription>
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

      <Card className="rounded-2xl border-[#ebe7e2] shadow-sm">
        <CardHeader className="border-b">
          <CardTitle>Margin guardrails</CardTitle>
          <CardDescription>
            Reps see a live margin while they build an estimate. Below the approval floor, it needs a
            company admin’s OK before it can be sent. Changing the floor does not rewrite lines already
            on a proposal.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="company-min-margin">Approval floor</Label>
            <div className="relative">
              <Input
                id="company-min-margin"
                type="number"
                min={0}
                max={1000}
                step="0.01"
                className="rounded-lg pr-8"
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
          </div>
          <MarginBar floor={form.minimumMarginPercent ?? 0} />
          <p className="text-xs text-muted-foreground">
            {(form.minimumMarginPercent ?? 0) > 0
              ? `A $100 cost drops onto a proposal at ${formatMarginPercent(form.minimumMarginPercent ?? 0)} — $${(100 * (1 + (form.minimumMarginPercent ?? 0) / 100)).toFixed(2)} — unless the item’s own margin is higher.`
              : "0% means no floor. Set a number like 20 so every catalog line is marked up at least that much."}
          </p>
          <p className="text-sm text-muted-foreground">
            Commissions are paid on <span className="font-medium text-foreground">gross profit</span>.
          </p>
        </CardContent>
      </Card>

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

function MarginBar({ floor }: { floor: number }) {
  const warn = Math.max(floor, Math.min(floor + 8, 100));
  const target = Math.max(warn, Math.min(warn + 12, 100));
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-[#f3f1ee]">
        <div className="bg-rose-400" style={{ width: `${Math.min(floor, 100)}%` }} />
        <div className="bg-amber-300" style={{ width: `${Math.max(warn - floor, 0)}%` }} />
        <div className="bg-emerald-400" style={{ width: `${Math.max(100 - warn, 0)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>Needs approval</span>
        <span>Warning</span>
        <span>On target{target > 0 ? ` · ${formatMarginPercent(target)}` : ""}</span>
      </div>
    </div>
  );
}
