"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Plus, Trash2 } from "lucide-react";
import {
  AdjustmentFields,
  CommitInput,
  CommitTextarea,
  LineCard,
  PriceBookSheet,
} from "@/components/estimate-writer";
import { MarketField } from "@/components/market-field";
import { PackagePicker } from "@/components/package-picker";
import { StartEstimateButton } from "@/components/start-estimate-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrm } from "@/lib/crm-store";
import { DocumentTermsFields } from "@/components/document-terms-fields";
import { ESTIMATE_TERMS_HINT } from "@/lib/document-terms";
import {
  groupHasMixedPackages,
  isGbbEstimate,
  nextClassicOrOptionKey,
  optionKeyForGroup,
  optionNameForKey,
  pendingClassicPackages,
  type EstimateOption,
} from "@/lib/estimate-packages";
import { amountForTemplate, linesForTemplate } from "@/lib/estimate-templates";
import { groupEstimateLines } from "@/lib/estimate-totals";
import { formatMoney } from "@/lib/format";
import { defaultTaxRateForMarket, isResidentialMarket } from "@/lib/market";
import type { EstimateTemplate, EstimateTemplateLine } from "@/lib/types";

export function TemplateWriter({ template }: { template: EstimateTemplate }) {
  const router = useRouter();
  const crm = useCrm();
  const [bookOpen, setBookOpen] = useState(false);
  const [bookGroup, setBookGroup] = useState<string | undefined>();
  const [sectionName, setSectionName] = useState("");
  const [emptySections, setEmptySections] = useState<string[]>([]);
  const [emptyOptions, setEmptyOptions] = useState<EstimateOption[]>([]);

  const lines = linesForTemplate(crm.estimateTemplateLines, template.id);
  const groups = groupEstimateLines(lines);
  const gbb = isGbbEstimate(template);
  const seededOptions = gbb ? pendingClassicPackages(lines, emptyOptions) : [];
  const pendingOptions = [...emptyOptions, ...seededOptions];
  const pendingSections = [
    ...emptySections,
    ...pendingOptions.map((item) => item.name),
  ].filter((name, index, all) => all.indexOf(name) === index && !groups.some((group) => group.name === name));
  const displayGroups = [
    ...groups,
    ...pendingSections.map((name) => ({ name, lines: [] as typeof lines })),
  ];
  const residential = isResidentialMarket(template.market);
  const total = amountForTemplate(template, lines);
  useEffect(() => {
    setEmptySections([]);
    setEmptyOptions([]);
    setSectionName("");
  }, [template.id]);

  function lastGroup() {
    return pendingSections.at(-1) || groups.at(-1)?.name;
  }

  function packageForGroup(name?: string) {
    if (!name) return "";
    return optionKeyForGroup(name, lines, pendingOptions);
  }

  function addOptionSection() {
    const nameKeys = displayGroups.map((group) => group.name);
    const key = nextClassicOrOptionKey([
      ...lines.map((line) => line.package),
      ...pendingOptions.map((item) => item.key),
    ]);
    const name = optionNameForKey(key, nameKeys);
    if (!displayGroups.some((group) => group.name === name)) {
      setEmptySections((prev) => [...prev, name]);
    }
    if (!pendingOptions.some((item) => item.key === key)) {
      setEmptyOptions((prev) => [...prev, { key, name }]);
    }
    void crm.updateEstimateTemplate(template.id, {
      packageMode: "gbb",
      selectedPackage: gbb ? template.selectedPackage || key : key,
    });
  }

  async function buildOptionFrom(group: { name: string; lines: EstimateTemplateLine[] }) {
    const nameKeys = displayGroups.map((item) => item.name);
    const key = nextClassicOrOptionKey([
      ...lines.map((line) => line.package),
      ...pendingOptions.map((item) => item.key),
    ]);
    const name = optionNameForKey(key, nameKeys);
    if (!gbb || !template.selectedPackage) {
      await crm.updateEstimateTemplate(template.id, { packageMode: "gbb", selectedPackage: key });
    }
    if (group.lines.length === 0) {
      setEmptySections((prev) => [...prev, name]);
      setEmptyOptions((prev) => [...prev, { key, name }]);
      toast.success(`Started ${name} from ${group.name}.`);
      return;
    }
    for (const line of group.lines) {
      await crm.addCustomTemplateLine(template.id, name, {
        package: key,
        title: line.title,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitCost: line.unitCost,
      });
    }
    toast.success(`Started ${name} from ${group.name}.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {gbb ? "Good / Better / Best template" : "Company template"}
          </p>
          <CommitInput
            className="font-heading h-auto border-0 bg-transparent px-0 text-[1.85rem] leading-[1.1] font-medium shadow-none focus-visible:ring-0"
            value={template.name}
            onCommit={(value) => {
              if (value.trim()) void crm.updateEstimateTemplate(template.id, { name: value.trim() });
            }}
          />
          <CommitInput
            className="mt-1"
            value={template.description}
            placeholder="When the crew uses this — hail roof, water kitchen, bath remodel"
            onCommit={(value) => void crm.updateEstimateTemplate(template.id, { description: value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <StartEstimateButton templateId={template.id}>New estimate</StartEstimateButton>
          <Button
            variant="outline"
            onClick={() => {
              void crm.removeEstimateTemplate(template.id).then(() => {
                toast.success("Template removed.");
                router.push("/estimates/templates");
              });
            }}
          >
            <Trash2 />
            Delete
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 px-4 py-3 sm:flex sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {lines.filter((line) => !line.optional || line.selected).length} included lines
          {gbb ? " · totals follow the selected option" : ""}
        </p>
        <p className="font-heading text-xl font-medium tabular-nums">{formatMoney(total)}</p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <MarketField
              value={template.market}
              onChange={(market) =>
                void crm.updateEstimateTemplate(template.id, {
                  market,
                  taxRate: defaultTaxRateForMarket(market),
                })
              }
              id="template-market"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-start gap-3 rounded-md border px-3 py-3">
              <Checkbox
                checked={gbb}
                onCheckedChange={(value) => {
                  const next = Boolean(value);
                  void crm.updateEstimateTemplate(template.id, {
                    packageMode: next ? "gbb" : "",
                    selectedPackage: next ? template.selectedPackage || "better" : template.selectedPackage,
                  });
                }}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Good / Better / Best options</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Shared sections sit on every option. Each option section is a fork the homeowner can pick — they do
                  not stack. New estimates copy this structure.
                </span>
              </span>
            </label>
          </div>
          <div>
            <Label>Tax rate (%)</Label>
            <CommitInput
              type="number"
              min={0}
              step="0.01"
              disabled={residential}
              value={residential ? 0 : template.taxRate}
              onCommit={(value) => void crm.updateEstimateTemplate(template.id, { taxRate: Number(value) || 0 })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {residential ? "Residential work is not taxed." : "Copied onto new estimates unless you change the market."}
            </p>
          </div>
          <AdjustmentFields
            label="Discount"
            kind={template.discountKind}
            value={template.discountValue}
            onChange={(discountKind, discountValue) =>
              void crm.updateEstimateTemplate(template.id, { discountKind, discountValue })
            }
          />
          <AdjustmentFields
            label="Deposit"
            kind={template.depositKind}
            value={template.depositValue}
            onChange={(depositKind, depositValue) =>
              void crm.updateEstimateTemplate(template.id, { depositKind, depositValue })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Cover note</CardTitle>
        </CardHeader>
        <CardContent>
          <CommitTextarea
            rows={3}
            value={template.intro}
            placeholder="What this kind of proposal usually covers."
            onCommit={(value) => void crm.updateEstimateTemplate(template.id, { intro: value })}
          />
        </CardContent>
      </Card>

      {gbb ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Preview the comparison cards. Unique items on each option become the bullets homeowners see.
              The selected option is the starting pick on new estimates.
            </p>
            <PackagePicker
              estimate={template}
              lines={lines}
              pending={pendingOptions}
              onSelect={(pkg) => void crm.updateEstimateTemplate(template.id, { selectedPackage: pkg })}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="font-heading text-lg font-medium">Sections</h2>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const name = sectionName.trim() || "New section";
              if (!displayGroups.some((group) => group.name === name)) {
                setEmptySections((prev) => [...prev, name]);
              }
              setSectionName("");
              setBookGroup(name);
            }}
          >
            <Input
              value={sectionName}
              onChange={(event) => setSectionName(event.target.value)}
              placeholder="New section name — Demo, Roof, Allowances"
            />
            <Button type="submit" variant="outline">
              Add section
            </Button>
            <Button type="button" variant="outline" onClick={addOptionSection}>
              Add option
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Shared sections (tear-off, dumpster) stay on every option. Add an option, put the work that changes in that
            section, then build the next option off it.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-lg font-medium">Line items</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              On each line, set <span className="text-foreground">Mapping</span> (which EagleView
              measurement) and <span className="text-foreground">Coverage</span> (how much one unit
              covers). Example: synthetic underlayment mapped to Squares with coverage{" "}
              <span className="text-foreground">10 squares</span> — a 33-square roof becomes{" "}
              <span className="text-foreground">4 rolls</span> when measurements are applied.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setBookGroup(lastGroup());
                setBookOpen(true);
              }}
            >
              <Plus />
              Price book
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void crm.addCustomTemplateLine(template.id, lastGroup(), {
                  package: packageForGroup(lastGroup()),
                })
              }
            >
              Custom item
            </Button>
          </div>
        </div>

        {displayGroups.length === 0 ? (
          <div className="border border-dashed px-4 py-8">
            <p className="font-medium">No lines yet</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Add a section, then drop in the price-book lines this job type always needs.
            </p>
          </div>
        ) : (
          displayGroups.map((group) => (
            <section key={group.name} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <CommitInput
                    className="h-8 max-w-xs font-medium"
                    value={group.name}
                    onCommit={(value) => {
                      const next = value.trim() || "Items";
                      if (next === group.name) return;
                      for (const line of group.lines) {
                        void crm.updateTemplateLine(line.id, { groupName: next });
                      }
                      setEmptySections((prev) =>
                        prev
                          .map((name) => (name === group.name ? next : name))
                          .filter((name, index, all) => all.indexOf(name) === index),
                      );
                      setEmptyOptions((prev) =>
                        prev.map((item) => (item.name === group.name ? { ...item, name: next } : item)),
                      );
                    }}
                  />
                  {packageForGroup(group.name) ? (
                    <span className="rounded-full bg-[#e7effb] px-2.5 py-0.5 text-xs font-medium text-[#13295b]">
                      Option
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setBookGroup(group.name);
                      setBookOpen(true);
                    }}
                  >
                    Add to section
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void crm.addCustomTemplateLine(template.id, group.name, {
                        package: packageForGroup(group.name),
                      })
                    }
                  >
                    Custom item
                  </Button>
                  {packageForGroup(group.name) ? (
                    <Button size="sm" variant="ghost" onClick={() => void buildOptionFrom(group)}>
                      <Copy />
                      Build another option
                    </Button>
                  ) : null}
                </div>
              </div>
              {group.lines.length === 0 ? (
                <p className="border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  No items in this section yet.
                </p>
              ) : (
                group.lines.map((line) => (
                  <LineCard
                    key={line.id}
                    line={line}
                    editable
                    showTax={!residential}
                    showQuantityFormula
                    showPackage={gbb && groupHasMixedPackages(group.lines)}
                    onPatch={(patch) => void crm.updateTemplateLine(line.id, patch)}
                    onMove={(direction) => void crm.reorderTemplateLine(line.id, direction)}
                    onRemove={() => void crm.removeTemplateLine(line.id)}
                  />
                ))
              )}
            </section>
          ))
        )}
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Terms</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <DocumentTermsFields
            value={template.terms}
            values={{}}
            emptyLabel="No terms on this template."
            hint={`${ESTIMATE_TERMS_HINT} Type payment-line amounts on each proposal; they do not fill from the estimate totals.`}
            onCommit={(value) => void crm.updateEstimateTemplate(template.id, { terms: value })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <CommitTextarea
            rows={3}
            value={template.notes}
            placeholder="Copied onto every estimate from this template. Prints after the total."
            onCommit={(value) => void crm.updateEstimateTemplate(template.id, { notes: value })}
          />
          <p className="text-xs text-muted-foreground">
            These notes print after the total on each proposal written from this template.
          </p>
        </CardContent>
      </Card>

      <PriceBookSheet
        open={bookOpen}
        onOpenChange={setBookOpen}
        onPick={async (catalogItemIds) => {
          await crm.addTemplateLinesFromCatalog(template.id, catalogItemIds, bookGroup, {
            package: packageForGroup(bookGroup),
          });
          toast.success(catalogItemIds.length === 1 ? "Added 1 item." : `Added ${catalogItemIds.length} items.`);
        }}
      />
    </div>
  );
}
