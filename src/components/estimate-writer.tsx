"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
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
import { EstimateLinePhotos } from "@/components/estimate-line-photos";
import { BackToJobButton } from "@/components/back-to-job";
import { ProposalDocument } from "@/components/proposal-document";
import { SignatureCertificate } from "@/components/signature-certificate";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { CollectSignatureDialog } from "@/components/signature-pad";
import { shareContactsForEstimate, coOwnerContact, homeownersOnJob } from "@/lib/parties";
import { EstimateStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { MarketField } from "@/components/market-field";
import { useCrm } from "@/lib/crm-store";
import { documentProjectManager, letterheadCompanyForRecord } from "@/lib/document-owner";
import {
  COMMON_UNITS,
  estimateTotals,
  groupEstimateLines,
  lineAmount,
  linesForEstimate,
  type AdjustmentKind,
} from "@/lib/estimate-totals";
import { downloadEstimatePdf } from "@/lib/document-pdf";
import { hasEstimateSignature } from "@/lib/estimate-signature";
import { mintEstimateSignerTokens } from "@/lib/estimate-signers";
import { shareUrl } from "@/lib/share";
import { formatDate, formatMoney } from "@/lib/format";
import {
  catalogProposalUnitPrice,
  effectiveCatalogMargin,
  formatMarginPercent,
} from "@/lib/catalog-margin";
import { currentCatalog } from "@/lib/price-lists";
import { billingEstimate, defaultTaxRateForMarket, isResidentialMarket, projectTypeForMarket, workMarket } from "@/lib/market";
import { formatJobSite } from "@/lib/leads";
import { jobPaperHref } from "@/lib/job-record";
import { CATALOG_KIND_LABELS, type CatalogKind, type Estimate, type EstimateLine, type JobPhoto } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";
import { cn } from "@/lib/utils";

export function CommitInput({
  value,
  onCommit,
  className,
  parse,
  type,
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
  function commit(raw: string) {
    const next = parse ? parse(raw) : raw;
    if (next !== String(value)) onCommit(next);
    else setDraft(String(value));
  }
  return (
    <Input
      {...props}
      type={type}
      className={className}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (type === "date") commit(next);
      }}
      onBlur={() => commit(draft)}
    />
  );
}

export function CommitTextarea({
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

export function PriceBookSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (catalogItemId: string) => void;
}) {
  const { catalog, company, viewer, priceLists } = useCrm();
  const items = useMemo(() => currentCatalog(catalog, priceLists ?? []), [catalog, priceLists]);
  const groups = useMemo(() => {
    const kinds = Array.from(new Set(items.map((item) => item.kind))) as CatalogKind[];
    return kinds.map((kind) => ({
      kind,
      items: items.filter((item) => item.kind === kind),
    }));
  }, [items]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Price book</SheetTitle>
          <SheetDescription>
            Drop a catalog item onto this proposal. The price is unit cost plus the item’s margin, at least the
            company minimum. Quantity and price stay editable after you add it.
          </SheetDescription>
        </SheetHeader>
        <Command className="min-h-0 flex-1 border-0 bg-transparent p-0">
          <div className="px-4">
            <CommandInput placeholder="Search the book" />
          </div>
          <CommandList className="max-h-none flex-1 px-2">
            <CommandEmpty>
              {items.length === 0
                ? catalog.length === 0
                  ? "Price book is empty. A company admin can load it under Settings → Price book."
                  : "The current price list is empty. A company admin can add items under Settings → Price book."
                : "No items match that search."}
            </CommandEmpty>
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
                        {effectiveCatalogMargin(item.marginPercent, company.minimumMarginPercent) > 0
                          ? ` · ${formatMoney(item.unitCost)} cost`
                          : ""}
                      </p>
                    </div>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(catalogProposalUnitPrice(item, company))}
                      {effectiveCatalogMargin(item.marginPercent, company.minimumMarginPercent) > 0 ? (
                        <span className="ml-1 text-xs">
                          {formatMarginPercent(
                            effectiveCatalogMargin(item.marginPercent, company.minimumMarginPercent),
                          )}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div className="border-t px-4 py-3">
          {viewer && canManageSettings(viewer.role, viewer) ? (
            <Link
              href="/settings/price-book"
              className="text-sm text-primary hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Manage the price book
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">A company admin manages the catalog in Settings.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type PricedLine = {
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  optional: boolean;
  selected: boolean;
  taxable: boolean;
};

export function LineCard({
  line,
  editable,
  showTax,
  onPatch,
  onMove,
  onRemove,
  galleryPhotos,
  galleryHint,
  onPhotosChange,
}: {
  line: PricedLine & { photoIds?: string[]; photos?: EstimateLine["photos"] };
  editable: boolean;
  showTax: boolean;
  onPatch: (patch: Partial<PricedLine>) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  galleryPhotos?: JobPhoto[];
  galleryHint?: string;
  onPhotosChange?: (photoIds: string[]) => void;
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
      {onPhotosChange || (line.photoIds && line.photoIds.length > 0) || line.photos?.length ? (
        <EstimateLinePhotos
          line={{
            photoIds: line.photoIds ?? [],
            photos: line.photos,
          }}
          gallery={galleryPhotos ?? []}
          emptyHint={galleryHint}
          editable={editable && Boolean(onPhotosChange)}
          onChange={editable ? onPhotosChange : undefined}
        />
      ) : null}
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
  const [shareSigning, setShareSigning] = useState<{
    shareToken: string;
    secondShareToken: string;
    secondContactId: string | null;
  } | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [emptySections, setEmptySections] = useState<string[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [signOpen, setSignOpen] = useState(false);

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
  const secondContact = estimate.secondContactId ? crm.getContact(estimate.secondContactId) : undefined;
  const client = crm.getClient(estimate.clientId);
  const opportunity = estimate.opportunityId ? crm.getOpportunity(estimate.opportunityId) : undefined;
  const job = estimate.jobId ? crm.getJob(estimate.jobId) : undefined;
  const inferredCoOwner =
    estimate.status === "accepted" || estimate.status === "declined"
      ? null
      : coOwnerContact(job, crm.contacts, estimate.contactId);
  const secondSignerName = secondContact?.name || inferredCoOwner?.name || null;
  const jobPhotos = useMemo(
    () => (estimate.jobId ? crm.photos.filter((photo) => photo.jobId === estimate.jobId) : []),
    [crm.photos, estimate.jobId],
  );
  const galleryHint = estimate.jobId
    ? jobPhotos.length === 0
      ? "This job does not have photos yet. Add them on the job record, then attach them here."
      : undefined
    : "Attach this proposal to a job to use that job’s photo gallery.";
  const homeownerContacts = useMemo(
    () =>
      homeownersOnJob(job, crm.contacts, [
        estimate.contactId,
        estimate.secondContactId,
        opportunity?.primaryContactId,
      ]),
    [
      crm.contacts,
      estimate.contactId,
      estimate.secondContactId,
      job,
      opportunity?.primaryContactId,
    ],
  );
  const secondHomeownerContacts = homeownerContacts.filter((item) => item.id !== estimate.contactId);
  const assignedCoOwner = useRef(false);
  useEffect(() => {
    assignedCoOwner.current = false;
  }, [estimate.id]);
  useEffect(() => {
    if (assignedCoOwner.current) return;
    if (estimate.secondContactId) {
      assignedCoOwner.current = true;
      return;
    }
    if (estimate.status === "accepted" || estimate.status === "declined") return;
    const coOwner = coOwnerContact(job, crm.contacts, estimate.contactId);
    if (!coOwner) return;
    assignedCoOwner.current = true;
    const tokens = mintEstimateSignerTokens({ ...estimate, secondContactId: coOwner.id });
    void crm.updateEstimate(estimate.id, {
      secondContactId: coOwner.id,
      shareToken: tokens.shareToken,
      secondShareToken: tokens.secondShareToken,
    });
  }, [
    crm.contacts,
    crm.updateEstimate,
    estimate,
    estimate.contactId,
    estimate.id,
    estimate.secondContactId,
    estimate.status,
    job,
  ]);
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
  const projectManager = documentProjectManager({
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    companyPhone: letterhead.phone,
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
      projectManager,
      primaryCustomer: contact?.name,
      secondCustomer: secondSignerName,
      photos: crm.photos,
      signatureEvents: (crm.estimateSignatureEvents ?? []).filter((event) => event.estimateId === estimate.id),
    });
  }

  const shareEstimate = useMemo(
    () =>
      shareSigning
        ? {
            ...estimate,
            shareToken: shareSigning.shareToken,
            secondShareToken: shareSigning.secondShareToken,
            secondContactId: shareSigning.secondContactId ?? estimate.secondContactId,
          }
        : estimate,
    [estimate, shareSigning],
  );

  async function openShare(markSent: boolean) {
    if (markSent && totals.includedCount === 0) {
      toast.error("Add at least one included line before sending.");
      return;
    }
    setPending(true);
    try {
      if (markSent) await crm.sendEstimate(estimate.id);
      const tokens = await crm.ensureEstimateShareToken(estimate.id);
      setShareSigning(tokens);
      setShareOpen(true);
      if (markSent) setTab("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare the share links.");
    } finally {
      setPending(false);
    }
  }

  async function handleReopen() {
    setPending(true);
    try {
      await crm.reopenEstimate(estimate.id);
      toast.success("Proposal reopened as a draft. Edit it and send again.");
      setTab("write");
    } catch {
      // Store already toasted the reason.
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
          Send for signature
        </Button>
      ) : (
        <Button variant="outline" disabled={pending} onClick={() => void openShare(false)}>
          Share
        </Button>
      )}
      {estimate.status === "draft" ||
      estimate.status === "sent" ||
      estimate.status === "viewed" ||
      (estimate.status === "accepted" && !hasEstimateSignature(estimate)) ? (
        <Button
          disabled={pending || totals.includedCount === 0}
          onClick={() => setSignOpen(true)}
        >
          {estimate.status === "accepted" ? "Add signature" : "Collect signature"}
        </Button>
      ) : null}
      {estimate.status === "sent" || estimate.status === "viewed" ? (
        <Button
          variant="outline"
          onClick={() => {
            void crm.declineEstimate(estimate.id);
            toast.message("Marked declined.");
          }}
        >
          Decline
        </Button>
      ) : null}
      {estimate.status === "declined" && !relatedInvoice ? (
        <Button disabled={pending} onClick={() => void handleReopen()}>
          Edit and send again
        </Button>
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
          <DropdownMenuItem
            onClick={() => {
              setTemplateName(estimate.name.replace(/\s+—\s+.+$/, "").trim() || estimate.name);
              setSaveTemplateOpen(true);
            }}
          >
            Save as template
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
                    secondContactId:
                      contactId && contactId === estimate.secondContactId ? null : estimate.secondContactId,
                  });
                }}
                items={[
                  { value: "none", label: "Choose a contact" },
                  ...homeownerContacts.map((item) => ({
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
                  {homeownerContacts.map((item) => (
                    <SelectItem key={item.id} value={item.id} className="h-auto items-start py-1.5">
                      <ContactSelectOption contact={item} sites={[...crm.jobs, ...crm.opportunities, ...crm.estimates]} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="mt-1 text-sm">
                {contact ? (
                  <Link href={`/contacts?contact=${contact.id}`} className="hover:underline">
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
            ) : job ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {homeownerContacts.length === 0
                  ? "Add the homeowner as a related contact on the job, then pick them here."
                  : "People on this job."}
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label>Second homeowner</Label>
            {editable ? (
              <Select
                value={estimate.secondContactId || "none"}
                onValueChange={(value) => {
                  const secondContactId = value === "none" ? null : String(value ?? "");
                  void crm.updateEstimate(estimate.id, {
                    secondContactId,
                    secondAcceptedAt: secondContactId === estimate.secondContactId ? estimate.secondAcceptedAt : null,
                  });
                }}
                items={[
                  { value: "none", label: "None — one signature" },
                  ...secondHomeownerContacts.map((item) => ({
                    value: item.id,
                    label: contactOptionLabel(item, [...crm.jobs, ...crm.opportunities, ...crm.estimates]),
                  })),
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — one signature</SelectItem>
                  {secondHomeownerContacts.map((item) => (
                    <SelectItem key={item.id} value={item.id} className="h-auto items-start py-1.5">
                      <ContactSelectOption contact={item} sites={[...crm.jobs, ...crm.opportunities, ...crm.estimates]} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="mt-1 text-sm">
                {secondContact ? (
                  <Link href={`/contacts/${secondContact.id}`} className="hover:underline">
                    {secondContact.name}
                  </Link>
                ) : (
                  "None"
                )}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {estimate.secondContactId || secondHomeownerContacts.length > 0
                ? "Both homeowners must sign this proposal before it is accepted."
                : job
                  ? "Add a co-owner as a related contact on the job when both signatures are required."
                  : "Add a co-owner when both signatures are required."}
            </p>
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
            <Label>Valid until</Label>
            {editable ? (
              <>
                <CommitInput
                  type="date"
                  value={estimate.validUntil ?? ""}
                  onCommit={(value) => void crm.updateEstimate(estimate.id, { validUntil: value || null })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Prints on the proposal. New estimates default to 30 days.
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm">{formatDate(estimate.validUntil)}</p>
            )}
          </div>
          {editable ? (
            <div className="sm:col-span-2">
              <MarketField
                id="estimate-market"
                value={market}
                onChange={(next) => {
                  if (opportunity) {
                    void crm.updateOpportunity(opportunity.id, {
                      market: next,
                      projectType: projectTypeForMarket(next),
                    });
                  }
                  if (job) {
                    void crm.updateJob(job.id, {
                      market: next,
                      projectType: projectTypeForMarket(next),
                    });
                  }
                  void crm.updateEstimate(estimate.id, { taxRate: defaultTaxRateForMarket(next) });
                }}
              />
            </div>
          ) : null}
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
                <Link href={jobPaperHref(job.id)} className="hover:underline">
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
                    galleryPhotos={jobPhotos}
                    galleryHint={galleryHint}
                    onPhotosChange={(photoIds) => void crm.updateEstimateLine(line.id, { photoIds })}
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
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Type the Payment 1, 2, and 3 amounts on the terms lines. They stay blank until you enter them.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <CommitTextarea
            rows={3}
            value={estimate.notes}
            disabled={estimate.status === "declined"}
            placeholder="Allowance details, exclusions, or anything else that belongs after the total."
            onCommit={(value) => void crm.updateEstimate(estimate.id, { notes: value })}
          />
          <p className="text-xs text-muted-foreground">
            Prints after the total on the proposal, the client link, and the PDF. Long notes continue onto a second page.
          </p>
        </CardContent>
      </Card>
    </div>
  );

  const preview = (
    <div className="grid gap-4">
      <ProposalDocument
      company={crm.company}
      estimate={estimate}
      lines={lines}
      customer={customer}
      market={workMarket(job, opportunity)}
      selectable={optionalOpen}
      primaryCustomer={contact?.name}
      secondCustomer={secondSignerName}
      onToggleOptional={(line, selected) => void crm.updateEstimateLine(line.id, { selected })}
      onTermsChange={
        editable ? (terms) => void crm.updateEstimate(estimate.id, { terms }) : undefined
      }
      />
      <SignatureCertificate
        estimateNumber={estimate.number}
        events={(crm.estimateSignatureEvents ?? []).filter((event) => event.estimateId === estimate.id)}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-5 flex flex-col gap-3 border-b bg-background/95 px-5 py-3 backdrop-blur sm:-mx-7 sm:px-7 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
        <BackToJobButton jobId={estimate.jobId} />
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
              <span className="text-sm text-muted-foreground">
                Valid until {formatDate(estimate.validUntil)}
              </span>
            </div>
            {estimate.status === "declined" ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {relatedInvoice
                  ? "This proposal is declined and already has an invoice, so it stays locked."
                  : "This proposal is declined and locked. Reopen it to edit lines and send again."}
              </p>
            ) : null}
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
        <div className="xl:sticky xl:top-4 xl:max-h-[calc(100dvh-1.5rem)] xl:overflow-y-auto">
          {preview}
        </div>
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
        description="Text each homeowner or copy their link. They review the proposal and sign from their phone — no login. Each signer needs their own link; the other person’s link will not let them sign."
        url={shareEstimate.shareToken ? shareUrl("e", shareEstimate.shareToken) : ""}
        kind="estimate"
        documentNumber={estimate.number}
        documentName={estimate.name}
        companyName={crm.company.name}
        recipients={shareContactsForEstimate(shareEstimate, crm)}
        onDownloadPdf={downloadPdf}
        onTexted={(sent) =>
          crm.logOutboundText({
            ...sent,
            jobId: estimate.jobId,
            opportunityId: estimate.opportunityId,
            contactId: sent.contactId || estimate.contactId,
          })
        }
      />
      <CollectSignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        defaultName={customer === "—" ? "" : customer}
        estimateNumber={estimate.number}
        pending={pending}
        onSubmit={async ({ name, image }) => {
          setPending(true);
          try {
            await crm.acceptEstimate(estimate.id, { name, image });
            setSignOpen(false);
            toast.success("Signed. The signature is on the estimate and the PDF.");
          } finally {
            setPending(false);
          }
        }}
      />
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as company template</DialogTitle>
            <DialogDescription>
              Sections, prices, cover note, terms, and notes are copied. The next estimate can start from this instead of a blank page.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Hail roof — architectural shingles"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !templateName.trim()}
              onClick={() => {
                setPending(true);
                void crm
                  .saveEstimateAsTemplate(estimate.id, templateName.trim())
                  .then((template) => {
                    toast.success(`${template.name} is in company templates.`);
                    setSaveTemplateOpen(false);
                    router.push(`/estimates/templates/${template.id}`);
                  })
                  .finally(() => setPending(false));
              }}
            >
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdjustmentFields({
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
