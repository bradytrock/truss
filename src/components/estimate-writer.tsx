"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Download,
  Plus,
  Trash2,
} from "lucide-react";
import { ProposalDocument } from "@/components/proposal-document";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { EstimateStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { contactOptionLabel } from "@/lib/contacts";
import { ContactSelectOption } from "@/components/contact-option";
import { useCrm } from "@/lib/crm-store";
import { letterheadCompanyForRecord } from "@/lib/document-owner";
import {
  COMMON_UNITS,
  estimateTotals,
  groupEstimateLines,
  lineAmount,
  linesForEstimate,
  type AdjustmentKind,
} from "@/lib/estimate-totals";
import { downloadEstimatePdf } from "@/lib/document-pdf";
import { shareUrl } from "@/lib/share";
import { formatMoney } from "@/lib/format";
import { billingEstimate, isResidentialMarket, workMarket } from "@/lib/market";
import { formatJobSite } from "@/lib/leads";
import { CATALOG_KIND_LABELS, type CatalogKind, type Estimate, type EstimateLine } from "@/lib/types";
import { cn } from "@/lib/utils";

function CommitInput({
  value,
  onCommit,
  className,
  parse,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur"> & {
  value: string | number;
  onCommit: (value: string) => void;
  parse?: (value: string) => string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <Input
      {...props}
      className={className}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = parse ? parse(draft) : draft;
        if (next !== String(value)) onCommit(next);
        else setDraft(String(value));
      }}
    />
  );
}

function CommitTextarea({
  value,
  onCommit,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <Textarea
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}

function PriceBookSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (catalogItemId: string) => void;
}) {
  const { catalog } = useCrm();
  const groups = useMemo(() => {
    const kinds = Array.from(new Set(catalog.map((item) => item.kind))) as CatalogKind[];
    return kinds.map((kind) => ({
      kind,
      items: catalog.filter((item) => item.kind === kind),
    }));
  }, [catalog]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Price book</SheetTitle>
          <SheetDescription>
            Drop a catalog item onto this proposal. Quantity and price stay editable after you add it.
          </SheetDescription>
        </SheetHeader>
        <Command className="min-h-0 flex-1 border-0 bg-transparent p-0">
          <div className="px-4">
            <CommandInput placeholder="Search the book" />
          </div>
          <CommandList className="max-h-none flex-1 px-2">
            <CommandEmpty>No items match that search.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.kind} heading={CATALOG_KIND_LABELS[group.kind]}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.costCode} ${item.name}`}
                    onSelect={() => {
                      onPick(item.id);
                      onOpenChange(false);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p>{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.costCode} · {item.unit}
                      </p>
                    </div>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(item.unitCost)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </SheetContent>
    </Sheet>
  );
}

function LineCard({
  line,
  editable,
  showTax,
  onPatch,
  onMove,
  onRemove,
}: {
  line: EstimateLine;
  editable: boolean;
  showTax: boolean;
  onPatch: (patch: Partial<EstimateLine>) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
}) {
  const units = COMMON_UNITS.includes(line.unit) ? COMMON_UNITS : [line.unit, ...COMMON_UNITS];
  return (
    <div
      className={cn(
        "rounded-md border bg-card p-3",
        line.optional && !line.selected && "border-dashed"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-2">
          <CommitInput
            value={line.title}
            disabled={!editable}
            placeholder="Title"
            onCommit={(value) => onPatch({ title: value })}
          />
          <CommitTextarea
            value={line.description}
            disabled={!editable}
            rows={2}
            placeholder="What the homeowner sees under the title"
            onCommit={(value) => onPatch({ description: value })}
          />
        </div>
        {editable ? (
          <div className="flex flex-col gap-1">
            <Button size="icon-xs" variant="ghost" aria-label="Move up" onClick={() => onMove("up")}>
              <ArrowUp />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Move down"
              onClick={() => onMove("down")}
            >
              <ArrowDown />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label="Remove line" onClick={onRemove}>
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <Label className="text-xs text-muted-foreground">Qty</Label>
          <CommitInput
            type="number"
            min={0}
            step="0.01"
            disabled={!editable}
            value={line.quantity}
            onCommit={(value) => onPatch({ quantity: Number(value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Unit</Label>
          {editable ? (
            <Select
              value={line.unit}
              onValueChange={(value) => onPatch({ unit: String(value ?? line.unit) })}
              items={units.map((unit) => ({ value: unit, label: unit }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="mt-1 text-sm">{line.unit}</p>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Unit price</Label>
          <CommitInput
            type="number"
            min={0}
            step="0.01"
            disabled={!editable}
            className="text-right"
            value={line.unitCost}
            onCommit={(value) => onPatch({ unitCost: Number(value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Amount</Label>
          <p className="mt-1.5 text-right text-sm font-medium tabular-nums">
            {formatMoney(lineAmount(line))}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={line.optional}
            disabled={!editable}
            onCheckedChange={(value) =>
              onPatch({ optional: Boolean(value), selected: Boolean(value) ? line.selected : true })
            }
          />
          Optional
        </label>
        {line.optional ? (
          <label className="flex items-center gap-2">
            <Checkbox
              checked={line.selected}
              onCheckedChange={(value) => onPatch({ selected: Boolean(value) })}
            />
            Include in total
          </label>
        ) : null}
        {showTax ? (
        <label className="flex items-center gap-2">
          <Checkbox
            checked={line.taxable}
            disabled={!editable}
            onCheckedChange={(value) => onPatch({ taxable: Boolean(value) })}
          />
          Taxable
        </label>
        ) : null}
      </div>
    </div>
  );
}

export function EstimateWriter({ estimate }: { estimate: Estimate }) {
  const router = useRouter();
  const crm = useCrm();
  const [tab, setTab] = useState("write");
  const [bookOpen, setBookOpen] = useState(false);
  const [bookGroup, setBookGroup] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [emptySections, setEmptySections] = useState<string[]>([]);

  const lines = linesForEstimate(crm.estimateLines, estimate.id);
  const groups = groupEstimateLines(lines);
  const pendingSections = emptySections.filter(
    (name) => !groups.some((group) => group.name === name),
  );
  const displayGroups = [
    ...groups,
    ...pendingSections.map((name) => ({ name, lines: [] as EstimateLine[] })),
  ];
  const relatedInvoice = crm.invoices.find((invoice) => invoice.estimateId === estimate.id);
  const editable = estimate.status === "draft";
  const optionalOpen = estimate.status === "draft" || estimate.status === "sent" || estimate.status === "viewed";
  const canConvert =
    (estimate.status === "sent" || estimate.status === "viewed" || estimate.status === "accepted") &&
    !relatedInvoice;
  const contact = estimate.contactId ? crm.getContact(estimate.contactId) : undefined;
  const client = crm.getClient(estimate.clientId);
  const opportunity = estimate.opportunityId ? crm.getOpportunity(estimate.opportunityId) : undefined;
  const job = estimate.jobId ? crm.getJob(estimate.jobId) : undefined;
  const customer = crm.customerName(estimate);
  const site =
    formatJobSite({
      street: estimate.street,
      city: estimate.city,
      state: estimate.state,
      postalCode: estimate.postalCode,
    }) || "";
  const title = site || estimate.name;
  const market = workMarket(job, opportunity);
  const residential = isResidentialMarket(market);
  const billed = billingEstimate(estimate, market);
  const totals = estimateTotals(billed, lines);
  const letterhead = letterheadCompanyForRecord({
    company: crm.company,
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    inBook: true,
  });

  function patchSite(
    patch: Partial<Pick<Estimate, "street" | "city" | "state" | "postalCode">>,
  ) {
    const next = {
      street: patch.street ?? estimate.street,
      city: patch.city ?? estimate.city,
      state: patch.state ?? estimate.state,
      postalCode: patch.postalCode ?? estimate.postalCode,
    };
    void crm.updateEstimate(estimate.id, {
      ...patch,
      name: formatJobSite(next) || estimate.name,
    });
  }

  function lastGroup() {
    return pendingSections.at(-1) || groups.at(-1)?.name;
  }

  useEffect(() => {
    setEmptySections([]);
    setSectionName("");
  }, [estimate.id]);

  async function handleConvert() {
    setPending(true);
    try {
      const invoice = await crm.convertEstimateToInvoice(estimate.id);
      toast.success(`${invoice.number} created from this proposal.`);
      router.push(`/invoices/${invoice.id}`);
    } catch {
      setPending(false);
    }
  }

  function downloadPdf() {
    if (lines.length === 0) {
      toast.error("Add at least one line before generating a PDF.");
      return;
    }
    return downloadEstimatePdf({
      estimate: billed,
      lines,
      company: letterhead,
      customer,
    });
  }

  async function openShare(markSent: boolean) {
    if (markSent && totals.includedCount === 0) {
      toast.error("Add at least one included line before sending.");
      return;
    }
    setPending(true);
    try {
      if (markSent) await crm.sendEstimate(estimate.id);
      else await crm.ensureEstimateShareToken(estimate.id);
      setShareOpen(true);
      if (markSent) setTab("preview");
    } finally {
      setPending(false);
    }
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={pending || lines.length === 0} onClick={() => void downloadPdf()}>
        <Download />
        PDF
      </Button>
      {estimate.status === "draft" ? (
        <Button disabled={pending || totals.includedCount === 0} onClick={() => void openShare(true)}>
          Send proposal
        </Button>
      ) : (
        <Button variant="outline" disabled={pending} onClick={() => void openShare(false)}>
          Share
        </Button>
      )}
      {estimate.status === "sent" || estimate.status === "viewed" ? (
        <>
          <Button
            onClick={() => {
              void crm.acceptEstimate(estimate.id).then(() => {
                toast.success("Signed. The job value on the card is the signed estimate total.");
              });
            }}
          >
            Mark signed
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void crm.declineEstimate(estimate.id);
              toast.message("Marked declined.");
            }}
          >
            Decline
          </Button>
        </>
      ) : null}
      {canConvert ? (
        <Button disabled={pending} variant={estimate.status === "accepted" ? "default" : "outline"} onClick={() => void handleConvert()}>
          Convert to invoice
        </Button>
      ) : null}
      {relatedInvoice ? (
        <Button nativeButton={false} variant="outline" render={<Link href={`/invoices/${relatedInvoice.id}`} />}>
          Open {relatedInvoice.number}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          More
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={pending} onClick={() => void openShare(false)}>
            Share link
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void crm.duplicateEstimate(estimate.id).then((copy) => {
                toast.success(`${copy.number} drafted as a copy.`);
                router.push(`/estimates/${copy.id}`);
              });
            }}
          >
            <Copy />
            Duplicate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const writer = (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Customer & job site</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Homeowner</Label>
            {editable ? (
              <Select
                value={estimate.contactId || "none"}
                onValueChange={(value) => {
                  const contactId = value === "none" ? null : String(value ?? "");
                  const next = crm.contacts.find((item) => item.id === contactId);
                  void crm.updateEstimate(estimate.id, {
                    contactId,
                    clientId: next?.clientId ?? estimate.clientId,
                  });
                }}
                items={[
                  { value: "none", label: "Choose a contact" },
                  ...crm.contacts.map((item) => ({
                    value: item.id,
                    label: contactOptionLabel(item, [...crm.jobs, ...crm.opportunities, ...crm.estimates]),
                  })),
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose a contact</SelectItem>
                  {crm.contacts.map((item) => (
                    <SelectItem key={item.id} value={item.id} className="h-auto items-start py-1.5">
                      <ContactSelectOption contact={item} sites={[...crm.jobs, ...crm.opportunities, ...crm.estimates]} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="mt-1 text-sm">
                {contact ? (
                  <Link href={`/contacts/${contact.id}`} className="hover:underline">
                    {contact.name}
                  </Link>
                ) : (
                  customer
                )}
              </p>
            )}
            {client ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Company{" "}
                <Link href={`/clients/${client.id}`} className="hover:underline">
                  {client.name}
                </Link>
              </p>
            ) : null}
          </div>
          <div>
            <Label>Street</Label>
            <CommitInput
              disabled={!editable}
              value={estimate.street}
              placeholder="860 S Washington St"
              onCommit={(value) => patchSite({ street: value })}
            />
          </div>
          <div>
            <Label>City</Label>
            <CommitInput
              disabled={!editable}
              value={estimate.city}
              onCommit={(value) => patchSite({ city: value })}
            />
          </div>
          <div>
            <Label>State</Label>
            <CommitInput
              disabled={!editable}
              value={estimate.state}
              onCommit={(value) => patchSite({ state: value })}
            />
          </div>
          <div>
            <Label>ZIP</Label>
            <CommitInput
              disabled={!editable}
              value={estimate.postalCode}
              onCommit={(value) => patchSite({ postalCode: value })}
            />
          </div>
          <div>
            <Label>Lead</Label>
            <p className="mt-1 text-sm">
              {opportunity ? (
                <Link href={`/opportunities/${opportunity.id}`} className="hover:underline">
                  {opportunity.name}
                </Link>
              ) : (
                "—"
              )}
            </p>
          </div>
          <div>
            <Label>Job</Label>
            <p className="mt-1 text-sm">
              {job ? (
                <Link href={`/jobs/${job.id}`} className="hover:underline">
                  {job.name}
                </Link>
              ) : (
                "—"
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Cover note</CardTitle>
        </CardHeader>
        <CardContent>
          <CommitTextarea
            rows={3}
            disabled={!editable}
            value={estimate.intro}
            placeholder="What this proposal covers, in the homeowner’s language."
            onCommit={(value) => void crm.updateEstimate(estimate.id, { intro: value })}
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {editable ? (
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
            </form>
            <p className="text-xs text-muted-foreground">
              Name the section first, then add price-book or custom lines into it.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-heading text-lg font-medium">Line items</h2>
          {editable ? (
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
                onClick={() => void crm.addCustomEstimateLine(estimate.id, lastGroup())}
              >
                Custom item
              </Button>
            </div>
          ) : null}
        </div>

        {displayGroups.length === 0 ? (
          <div className="border border-dashed px-4 py-8">
            <p className="font-medium">No lines yet</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Add a section above, then pull items from the price book or add a lump-sum line.
              Optional work stays out of the total until you check it.
            </p>
            {editable ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setBookOpen(true)}>
                  Add from price book
                </Button>
                <Button size="sm" variant="outline" onClick={() => void crm.addCustomEstimateLine(estimate.id)}>
                  Custom item
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          displayGroups.map((group) => (
            <section key={group.name} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <CommitInput
                  className="h-8 max-w-xs font-medium"
                  disabled={!editable}
                  value={group.name}
                  onCommit={(value) => {
                    const next = value.trim() || "Items";
                    if (next === group.name) return;
                    for (const line of group.lines) {
                      void crm.updateEstimateLine(line.id, { groupName: next });
                    }
                    setEmptySections((prev) =>
                      prev.map((name) => (name === group.name ? next : name)).filter((name, index, all) => all.indexOf(name) === index),
                    );
                  }}
                />
                {editable ? (
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
                      onClick={() => void crm.addCustomEstimateLine(estimate.id, group.name)}
                    >
                      Custom item
                    </Button>
                  </div>
                ) : null}
              </div>
              {group.lines.length === 0 ? (
                <p className="border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  No items in this section yet. Add from the price book or a custom line.
                </p>
              ) : (
                group.lines.map((line) => (
                  <LineCard
                    key={line.id}
                    line={line}
                    editable={editable}
                    showTax={!residential}
                    onPatch={(patch) => void crm.updateEstimateLine(line.id, patch)}
                    onMove={(direction) => void crm.reorderEstimateLine(line.id, direction)}
                    onRemove={() => void crm.removeEstimateLine(line.id)}
                  />
                ))
              )}
            </section>
          ))
        )}
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Tax, discount & deposit</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tax rate (%)</Label>
            <CommitInput
              type="number"
              min={0}
              step="0.01"
              disabled={!editable || residential}
              value={residential ? 0 : estimate.taxRate}
              onCommit={(value) => void crm.updateEstimate(estimate.id, { taxRate: Number(value) || 0 })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {residential
                ? "Residential work is not taxed."
                : "Applied only to taxable included lines, after discount."}
            </p>
          </div>
          <div>
            <Label>Valid until</Label>
            <CommitInput
              type="date"
              disabled={!editable}
              value={estimate.validUntil ?? ""}
              onCommit={(value) => void crm.updateEstimate(estimate.id, { validUntil: value || null })}
            />
          </div>
          <AdjustmentFields
            label="Discount"
            kind={estimate.discountKind}
            value={estimate.discountValue}
            disabled={!editable}
            onChange={(discountKind, discountValue) =>
              void crm.updateEstimate(estimate.id, { discountKind, discountValue })
            }
          />
          <AdjustmentFields
            label="Deposit"
            kind={estimate.depositKind}
            value={estimate.depositValue}
            disabled={!editable}
            onChange={(depositKind, depositValue) =>
              void crm.updateEstimate(estimate.id, { depositKind, depositValue })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Terms</CardTitle>
        </CardHeader>
        <CardContent>
          <CommitTextarea
            rows={4}
            disabled={!editable}
            value={estimate.terms}
            onCommit={(value) => void crm.updateEstimate(estimate.id, { terms: value })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Internal notes</CardTitle>
        </CardHeader>
        <CardContent>
          <CommitTextarea
            rows={3}
            value={estimate.notes}
            disabled={estimate.status === "declined"}
            placeholder="Hold points, insurance notes, things the homeowner should not see."
            onCommit={(value) => void crm.updateEstimate(estimate.id, { notes: value })}
          />
        </CardContent>
      </Card>
    </div>
  );

  const preview = (
    <ProposalDocument
      company={crm.company}
      estimate={estimate}
      lines={lines}
      customer={customer}
      selectable={optionalOpen}
      showInternalNotes
      onToggleOptional={(line, selected) => void crm.updateEstimateLine(line.id, { selected })}
    />
  );

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-5 flex flex-col gap-3 border-b bg-background/95 px-5 py-3 backdrop-blur sm:-mx-7 sm:px-7 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {estimate.number}
            </p>
            {editable && !site ? (
              <CommitInput
                className="font-heading h-auto border-0 bg-transparent px-0 text-[1.85rem] leading-[1.1] font-medium shadow-none focus-visible:ring-0"
                value={estimate.name}
                onCommit={(value) => {
                  if (value.trim()) void crm.updateEstimate(estimate.id, { name: value.trim() });
                }}
              />
            ) : (
              <h1 className="font-heading text-[1.85rem] leading-[1.1] font-medium text-balance">
                {title}
              </h1>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <EstimateStatusBadge status={estimate.status} />
              <span className="text-sm text-muted-foreground">{customer}</span>
            </div>
          </div>
          {actions}
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 px-4 py-3 sm:flex sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {totals.includedCount} included
          {totals.optionalCount ? ` · ${totals.optionalCount} optional off` : ""}
        </p>
        <p className="font-heading text-xl font-medium tabular-nums">{formatMoney(totals.total)}</p>
      </div>

      <div className="xl:hidden">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="write" className="mt-4">
            {writer}
          </TabsContent>
          <TabsContent value="preview" className="mt-4">
            {preview}
          </TabsContent>
        </Tabs>
      </div>

      <div className="hidden gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] xl:items-start">
        {writer}
        <div className="xl:sticky xl:top-4">{preview}</div>
      </div>

      <PriceBookSheet
        open={bookOpen}
        onOpenChange={setBookOpen}
        onPick={(catalogItemId) => void crm.addEstimateLineFromCatalog(estimate.id, catalogItemId, bookGroup)}
      />
      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={`Share ${estimate.number}`}
        description="Copy this link for the homeowner. They can review the proposal, pick optional items, and download a PDF — no login required."
        url={estimate.shareToken ? shareUrl("e", estimate.shareToken) : ""}
        onDownloadPdf={downloadPdf}
      />
    </div>
  );
}

function AdjustmentFields({
  label,
  kind,
  value,
  disabled,
  onChange,
}: {
  label: string;
  kind: AdjustmentKind;
  value: number;
  disabled?: boolean;
  onChange: (kind: AdjustmentKind, value: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Select
          value={kind}
          disabled={disabled}
          onValueChange={(next) => onChange((next === "amount" ? "amount" : "percent") as AdjustmentKind, value)}
          items={[
            { value: "percent", label: "%" },
            { value: "amount", label: "$" },
          ]}
        >
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percent">%</SelectItem>
            <SelectItem value="amount">$</SelectItem>
          </SelectContent>
        </Select>
        <CommitInput
          type="number"
          min={0}
          step="0.01"
          disabled={disabled}
          value={value}
          onCommit={(next) => onChange(kind, Number(next) || 0)}
        />
      </div>
    </div>
  );
}
