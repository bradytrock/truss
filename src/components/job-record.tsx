"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  ChevronsRight,
  Copy,
  ExternalLink,
  FileText,
  ImageIcon,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  User,
  Users,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ActivityComposer, ActivityList } from "@/components/activity";
import { AddPhotoDialog, CreateInvoiceDialog } from "@/components/create-ops-dialogs";
import { StartEstimateButton } from "@/components/start-estimate-button";
import { LogExpenseDialog } from "@/components/log-financial-dialogs";
import { CreatePageDialog } from "@/components/create-page-dialog";
import { DeleteJobDialog } from "@/components/delete-job-dialog";
import { JobFilesPanel } from "@/components/job-files";
import { JobFinancials } from "@/components/job-financials";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { RecordCode } from "@/components/page-chrome";
import { EstimateStatusBadge, InvoiceStatusBadge, PhotoCategoryBadge, QbStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate } from "@/lib/format";
import { assignedCrewPatch, isDeletedJob, jobAddress, mapsUrl, uniqueIds, uniqueNames } from "@/lib/job-record";
import { visibleJobCustomFields } from "@/lib/job-files";
import {
  isWaitingOnPm,
  itemKindLabel,
  itemTitle,
  jobDocumentHref,
  jobFinancialDocs,
  latestReturnNote,
  reviewItemStatus,
} from "@/lib/qb-review";
import { createPhotoReport, PAGE_TEMPLATE_OPTIONS } from "@/lib/photo-report";
import { shareUrl } from "@/lib/share";
import { leadSourceChoices, leadSourceLabel } from "@/lib/leads";
import { derivedInvoiceStatus, invoiceBalance } from "@/lib/money";
import { acceptedAmountForJob, amountForEstimate } from "@/lib/estimate-totals";
import { hasEstimateSignature } from "@/lib/estimate-signature";
import { workMarket } from "@/lib/market";
import { boardValue } from "@/lib/work-board";
import { COURSE } from "@/lib/training/engine";
import { recommendedChapterIds } from "@/lib/training/recommend";
import {
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES,
  type Contact,
  type Job,
  type JobCustomField,
  type JobStatus,
  type LeadSource,
  type PageTemplateId,
  type ProjectType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { PhotoReportBuilder } from "@/components/photo-report-builder";
import { canDeleteJobs } from "@/lib/visibility";
import { useStartEstimate } from "@/lib/start-estimate";
import { useStartMaterialOrder } from "@/lib/start-material-order";
import { materialOrderLinesFor, materialOrderTotal } from "@/lib/material-orders";

const JOB_TABS = ["overview", "photos", "files", "financials", "paper", "fields"] as const;
type JobTab = (typeof JOB_TABS)[number];

function parseJobTab(raw: string | null): JobTab {
  const value = raw === "pages" ? "files" : raw;
  return JOB_TABS.includes(value as JobTab) ? (value as JobTab) : "overview";
}

function copyText(value: string, label: string) {
  if (!value) return;
  void navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copied.`),
    () => toast.error("Could not copy.")
  );
}

function JobSection({
  title,
  defaultOpen = true,
  actions,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
          />
          <span className="text-[11px] font-semibold tracking-[0.16em] text-foreground uppercase">
            {title}
          </span>
        </button>
        {actions}
      </div>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}

function FieldRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_7.5rem_minmax(0,1fr)] items-center gap-3 border-b py-2.5 last:border-b-0">
      <Icon className="size-4 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="min-w-0 text-right text-sm">{children}</div>
    </div>
  );
}

const quietSelect =
  "h-auto w-full justify-end border-0 bg-transparent p-0 shadow-none hover:bg-transparent dark:bg-transparent";

function PeopleChips({
  names,
  onRemove,
  onAdd,
  options,
  empty,
}: {
  names: string[];
  onRemove: (name: string) => void;
  onAdd: (name: string) => void;
  options: string[];
  empty: string;
}) {
  const remaining = options.filter((name) => !names.includes(name));
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {names.length === 0 ? <span className="text-muted-foreground">{empty}</span> : null}
      {names.map((name) => (
        <Badge key={name} variant="secondary" className="gap-1 pr-1">
          {name}
          <button
            type="button"
            className="rounded-sm p-0.5 hover:bg-foreground/10"
            onClick={() => onRemove(name)}
            aria-label={`Remove ${name}`}
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      {remaining.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="size-6" />}>
            <Plus className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-64 min-w-44 overflow-auto">
            {remaining.map((name) => (
              <DropdownMenuItem key={name} onClick={() => onAdd(name)}>
                {name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function contactKind(contact: Contact, job: Job) {
  if (job.subcontractorIds.includes(contact.id)) return "Trade";
  if (contact.isReferralPartner) return contact.title.includes("adjuster") ? "Adjuster" : "Referral";
  if (contact.title.toLowerCase().includes("adjuster")) return "Adjuster";
  if (contact.clientId) return contact.title || "Company";
  return contact.title || "Homeowner";
}

export function JobRecord({ job, className }: { job: Job; className?: string }) {
  const crm = useCrm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { start: startEstimate, pending: estimatePending } = useStartEstimate();
  const { start: startMaterialOrder, pending: materialPending } = useStartMaterialOrder();
  const requestedTab = parseJobTab(searchParams.get("tab"));
  const [tab, setTab] = useState<JobTab>(requestedTab);
  const [heroOpen, setHeroOpen] = useState(true);
  const [addressOpen, setAddressOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [activityFocus, setActivityFocus] = useState(0);
  const [reportId, setReportId] = useState<string | null>(null);
  const [pageCreateOpen, setPageCreateOpen] = useState(false);
  const [pageCreating, setPageCreating] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [street, setStreet] = useState(job.street);
  const [city, setCity] = useState(job.city);
  const [state, setState] = useState(job.state);
  const [postalCode, setPostalCode] = useState(job.postalCode);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const canTrash = canDeleteJobs(crm.viewer) && !crm.impersonatedStaff;
  const deleted = isDeletedJob(job);

  useEffect(() => {
    setTab(requestedTab);
  }, [requestedTab]);

  function setJobTab(next: JobTab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
  }

  function openNew(kind: "estimate" | "invoice" | "interaction" | "expense" | "materials") {
    if (deleted) return;
    if (kind === "estimate") {
      setJobTab("paper");
      void startEstimate({
        jobId: job.id,
        opportunityId: job.opportunityId,
        contactId: job.primaryContactId,
        clientId: job.clientId,
      });
      return;
    }
    if (kind === "materials") {
      setJobTab("paper");
      void startMaterialOrder(job.id);
      return;
    }
    if (kind === "invoice") {
      setJobTab("paper");
      setInvoiceOpen(true);
      return;
    }
    if (kind === "expense") {
      setJobTab("financials");
      setExpenseOpen(true);
      return;
    }
    setJobTab("overview");
    window.setTimeout(() => setActivityFocus((value) => value + 1), 50);
  }

  const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
  const client = crm.getClient(job.clientId);
  const primary = crm.getContact(job.primaryContactId);
  const photos = crm.photos.filter((photo) => photo.jobId === job.id);
  const reports = crm.photoReports.filter((report) => report.jobId === job.id);
  const openReport = reportId ? reports.find((report) => report.id === reportId) : undefined;
  const hero = photos[0];
  const address = jobAddress(job);
  const estimates = crm.estimates.filter((estimate) => estimate.jobId === job.id);
  const invoices = crm.invoices.filter((invoice) => invoice.jobId === job.id);
  const materialOrders = (crm.materialOrders ?? []).filter((order) => order.jobId === job.id);
  const financialDocs = jobFinancialDocs(job.id, {
    invoices: crm.invoices,
    expenses: crm.expenses,
    payments: crm.payments,
  });
  const returnedDocs = financialDocs.filter((item) => isWaitingOnPm(reviewItemStatus(item)));
  const activities = crm.activities.filter(
    (activity) =>
      (activity.entityType === "job" && activity.entityId === job.id) ||
      (job.opportunityId &&
        activity.entityType === "opportunity" &&
        activity.entityId === job.opportunityId)
  );
  const tasks = crm.tasks.filter((task) => task.relatedType === "job" && task.relatedId === job.id);

  const related = useMemo(() => {
    const ids = uniqueIds([
      job.primaryContactId ?? "",
      ...job.relatedContactIds,
      ...job.subcontractorIds,
    ]);
    return ids
      .map((id) => crm.getContact(id))
      .filter((contact): contact is Contact => Boolean(contact));
  }, [crm, job.primaryContactId, job.relatedContactIds, job.subcontractorIds]);

  const relatedOptions = crm.contacts.filter(
    (contact) =>
      contact.id !== job.primaryContactId &&
      !job.relatedContactIds.includes(contact.id) &&
      !job.subcontractorIds.includes(contact.id)
  );
  const tradeOptions = crm.contacts.filter((contact) => !job.subcontractorIds.includes(contact.id));

  async function startPage(template: PageTemplateId) {
    setPageCreating(true);
    try {
      const created = await crm.addPhotoReport(
        createPhotoReport({
          job,
          customer: crm.customerName(job),
          photos,
          author: crm.user.name,
          template,
        }),
      );
      setPageCreateOpen(false);
      setReportId(created.id);
    } finally {
      setPageCreating(false);
    }
  }

  function patch(next: Partial<Job>) {
    void crm.updateJob(job.id, next);
  }

  function saveAddress() {
    const location =
      [street.trim(), [city.trim(), state.trim()].filter(Boolean).join(", "), postalCode.trim()]
        .filter(Boolean)
        .join(", ") || job.location;
    patch({
      street: street.trim(),
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.trim(),
      location,
    });
    setAddressOpen(false);
    toast.success("Job site saved.");
  }

  function addTag() {
    const value = tagDraft.trim();
    if (!value) return;
    patch({ tags: uniqueNames([...job.tags, value]) });
    setTagDraft("");
  }

  function addCustomField() {
    const label = fieldLabel.trim();
    if (!label) {
      toast.error("Give the field a name.");
      return;
    }
    const next: JobCustomField = {
      id: crypto.randomUUID(),
      label,
      value: fieldValue.trim(),
    };
    patch({ customFields: [...job.customFields, next] });
    setFieldLabel("");
    setFieldValue("");
  }

  return (
    <div className={cn("mx-auto w-full max-w-xl", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {job.code ? (
            <p className="mb-1">
              <RecordCode code={job.code} className="text-xs" />
            </p>
          ) : null}
          <h1
            id="job-window-title"
            className="font-heading text-2xl leading-tight font-medium text-balance"
          >
            {job.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {primary ? (
              <Link href={`/contacts?contact=${primary.id}`} className="hover:underline">
                {primary.name}
              </Link>
            ) : client ? (
              <Link href={`/clients/${client.id}`} className="hover:underline">
                {client.name}
              </Link>
            ) : (
              crm.customerName(job)
            )}
          </p>
        </div>
        <p className="font-heading text-2xl leading-none font-medium tabular-nums">
          {formatCurrencyFull(
            boardValue(
              job,
              opportunity,
              acceptedAmountForJob(job, crm.estimates, crm.estimateLines, workMarket(job, opportunity)),
            ),
          )}
        </p>
      </div>
      {primary?.phone || !deleted ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {!deleted ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    disabled={estimatePending || materialPending}
                    aria-label="Create on this job"
                  />
                }
              >
                <Plus data-icon="inline-start" />
                {estimatePending || materialPending ? "Opening…" : "New"}
                <ChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                <DropdownMenuItem onClick={() => openNew("estimate")}>
                  New estimate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openNew("invoice")}>
                  New invoice
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openNew("materials")}>
                  New material order
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openNew("interaction")}>
                  New interaction
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openNew("expense")}>
                  New expense
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {primary?.phone ? (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link href={`/messages?job=${job.id}&contact=${primary.id}`} />}
            >
              <MessageSquare data-icon="inline-start" />
              Text homeowner
            </Button>
          ) : null}
        </div>
      ) : null}

      {heroOpen ? (
        <div className="relative overflow-hidden border bg-muted">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero.imageUrl}
              alt={hero.caption || job.name}
              className="aspect-[16/9] w-full object-cover"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 text-muted-foreground"
            >
              <ImageIcon className="size-8" />
              <span className="text-sm">Add a job-site photo</span>
            </button>
          )}
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-3 right-3 size-8 bg-background/90"
            onClick={() => setHeroOpen(false)}
            aria-label="Collapse photo"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex justify-end border-x border-t px-3 py-2">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setHeroOpen(true)} aria-label="Show photo">
            <ChevronsRight className="size-4 rotate-180" />
          </Button>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Address
          </p>
          <p className="mt-1 text-sm leading-snug">{address || "Add a job-site address"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {address ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              nativeButton={false}
              render={<a href={mapsUrl(address)} target="_blank" rel="noreferrer" />}
              aria-label="Open in maps"
            >
              <MapPin className="size-4" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => copyText(address, "Address")}
            aria-label="Copy address"
            disabled={!address}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => {
              setStreet(job.street);
              setCity(job.city);
              setState(job.state);
              setPostalCode(job.postalCode);
              setAddressOpen(true);
            }}
            aria-label="Edit address"
          >
            <Pencil className="size-4" />
          </Button>
          {canTrash && deleted ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={restoring}
              onClick={() => {
                setRestoring(true);
                void crm.restoreJob(job.id).then((ok) => {
                  setRestoring(false);
                  if (ok) toast.success(`${job.code || job.name} is back on the board.`);
                });
              }}
              aria-label="Restore job"
            >
              <RotateCcw className="size-4" />
            </Button>
          ) : null}
          {canTrash && !deleted ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              aria-label="Delete job"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {deleted ? (
        <div className="border border-t-0 bg-muted/60 px-4 py-3">
          <p className="text-sm font-medium">This job is in Deleted.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {job.deletedBy ? `${job.deletedBy} removed it` : "Removed"}
            {job.deletedAt ? ` ${formatDate(job.deletedAt)}` : ""}.
            {job.deletedReason ? ` Reason: ${job.deletedReason}` : ""}
          </p>
        </div>
      ) : null}

      {returnedDocs.length > 0 ? (
        <div className="border border-b-0 bg-primary/8 px-4 py-3">
          <p className="text-sm font-medium">
            Accounting sent {returnedDocs.length} file{returnedDocs.length === 1 ? "" : "s"} back.
          </p>
          <ul className="mt-1 space-y-1">
            {returnedDocs.map((item) => {
              const note = latestReturnNote(crm.qbReviewComments ?? [], item.kind, item.id);
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    href={jobDocumentHref(job.id, item.kind, item.id)}
                    className="text-sm text-primary hover:underline"
                    onClick={(event) => {
                      event.preventDefault();
                      router.replace(jobDocumentHref(job.id, item.kind, item.id), { scroll: false });
                    }}
                  >
                    {itemTitle(item)}
                    {note ? ` — ${note.body}` : ""}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (typeof value === "string") setJobTab(parseJobTab(value));
        }}
      >
        <TabsList variant="line" className="w-full justify-start overflow-x-auto rounded-none border-x px-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="paper">Paper</TabsTrigger>
          <TabsTrigger value="fields">Custom fields</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="border-x border-b">
          <JobSection title="Description">
            <Textarea
              defaultValue={job.description}
              placeholder="Add a description"
              rows={3}
              onBlur={(event) => {
                if (event.target.value !== job.description) {
                  patch({ description: event.target.value });
                }
              }}
            />
          </JobSection>

          <JobSection title="Details">
            <FieldRow icon={Calendar} label="Status">
              <Select
                value={job.status}
                disabled={deleted}
                onValueChange={(value) => {
                  if (!value || deleted) return;
                  patch({ status: value as JobStatus });
                  toast.success("Job status updated.");
                }}
                items={JOB_STATUSES.map((status) => ({
                  value: status,
                  label: JOB_STATUS_LABELS[status],
                }))}
              >
                <SelectTrigger className={quietSelect}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {JOB_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {JOB_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow icon={Building2} label="Residential or commercial">
              <Select
                value={job.market || "residential"}
                onValueChange={(value) => {
                  const market = value as Job["market"];
                  if (market !== "residential" && market !== "commercial") return;
                  patch({ market });
                  if (opportunity && opportunity.market !== market) {
                    void crm.updateOpportunity(opportunity.id, { market });
                  }
                  if (market === "residential") {
                    for (const estimate of crm.estimates.filter(
                      (item) =>
                        item.taxRate !== 0 &&
                        (item.jobId === job.id ||
                          (job.opportunityId && item.opportunityId === job.opportunityId)),
                    )) {
                      void crm.updateEstimate(estimate.id, { taxRate: 0 });
                    }
                  }
                }}
                items={[
                  { value: "residential", label: "Residential" },
                  { value: "commercial", label: "Commercial" },
                ]}
              >
                <SelectTrigger className={quietSelect}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="residential">Residential</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow icon={Briefcase} label="Type">
              <Select
                value={job.projectType || undefined}
                onValueChange={(value) => {
                  if (value) patch({ projectType: value as ProjectType });
                }}
                items={PROJECT_TYPES.map((type) => ({
                  value: type,
                  label: PROJECT_TYPE_LABELS[type],
                }))}
              >
                <SelectTrigger className={cn(quietSelect, !job.projectType && "text-muted-foreground")}>
                  <SelectValue placeholder="Add a type" />
                </SelectTrigger>
                <SelectContent align="end">
                  {PROJECT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PROJECT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow icon={ExternalLink} label="Seed">
              <Select
                value={job.leadSource || undefined}
                onValueChange={(value) => {
                  if (value) patch({ leadSource: value as LeadSource });
                }}
                items={leadSourceChoices(job.leadSource).map((source) => ({
                  value: source,
                  label: leadSourceLabel(source),
                }))}
              >
                <SelectTrigger className={cn(quietSelect, !job.leadSource && "text-muted-foreground")}>
                  <SelectValue placeholder="How they found you" />
                </SelectTrigger>
                <SelectContent align="end">
                  {leadSourceChoices(job.leadSource).map((source) => (
                    <SelectItem key={source} value={source}>
                      {leadSourceLabel(source)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow icon={User} label="Assigned">
              <PeopleChips
                names={job.assigned}
                options={crm.teamMembers}
                empty="Add crew"
                onRemove={(name) => patch(assignedCrewPatch(job.assigned.filter((item) => item !== name), crm.staff))}
                onAdd={(name) => patch(assignedCrewPatch([...job.assigned, name], crm.staff))}
              />
            </FieldRow>
            <FieldRow icon={Building2} label="Company">
              <span>{crm.company.name}</span>
            </FieldRow>
            <FieldRow icon={Calendar} label="Start date">
              <Input
                type="date"
                value={job.startDate?.slice(0, 10) ?? ""}
                onChange={(event) => patch({ startDate: event.target.value })}
                className="h-7 border-0 bg-transparent px-0 text-right shadow-none"
              />
            </FieldRow>
            <FieldRow icon={Calendar} label="End date">
              <Input
                type="date"
                value={job.substantialCompletion?.slice(0, 10) ?? ""}
                onChange={(event) => patch({ substantialCompletion: event.target.value || null })}
                className="h-7 border-0 bg-transparent px-0 text-right shadow-none"
              />
            </FieldRow>
            <FieldRow icon={Star} label="Sales rep">
              <Select
                value={job.salesRep || undefined}
                onValueChange={(value) => {
                  if (value) patch({ salesRep: String(value) });
                }}
                items={crm.teamMembers.map((person) => ({ value: person, label: person }))}
              >
                <SelectTrigger className={cn(quietSelect, !job.salesRep && "text-muted-foreground")}>
                  <SelectValue placeholder="Add a sales rep" />
                </SelectTrigger>
                <SelectContent align="end">
                  {crm.teamMembers.map((person) => (
                    <SelectItem key={person} value={person}>
                      {person}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow icon={Users} label="Subcontractors">
              <PeopleChips
                names={job.subcontractorIds.map((id) => crm.getContact(id)?.name ?? "").filter(Boolean)}
                options={tradeOptions.map((contact) => contact.name)}
                empty="Add a trade"
                onRemove={(name) => {
                  const contact = crm.contacts.find((item) => item.name === name);
                  if (contact) {
                    patch({
                      subcontractorIds: job.subcontractorIds.filter((id) => id !== contact.id),
                    });
                  }
                }}
                onAdd={(name) => {
                  const contact = crm.contacts.find((item) => item.name === name);
                  if (contact) {
                    patch({ subcontractorIds: uniqueIds([...job.subcontractorIds, contact.id]) });
                  }
                }}
              />
            </FieldRow>
            <FieldRow icon={ImageIcon} label="Job photos">
              <button
                type="button"
                className="inline-flex items-center justify-end gap-2"
                onClick={() => setPhotoOpen(true)}
              >
                {photos.length > 0 ? (
                  <span>{photos.length} linked</span>
                ) : (
                  <>
                    <span className="size-1.5 rounded-full bg-destructive" />
                    <span className="text-muted-foreground">Not linked</span>
                  </>
                )}
              </button>
            </FieldRow>
            {opportunity ? (
              <FieldRow icon={Briefcase} label="Came from">
                <Link href={`/opportunities/${opportunity.id}`} className="text-primary hover:underline">
                  {opportunity.code ? `${opportunity.code} · ` : ""}
                  {opportunity.name}
                </Link>
              </FieldRow>
            ) : null}
            {job.leadSource ? (
              <p className="sr-only">{leadSourceLabel(job.leadSource)}</p>
            ) : null}
          </JobSection>

          <JobSection title="Tags">
            <div className="flex flex-wrap items-center gap-1.5">
              {job.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                  {tag}
                  <button
                    type="button"
                    className="rounded-sm p-0.5 hover:bg-foreground/10"
                    onClick={() => patch({ tags: job.tags.filter((item) => item !== tag) })}
                    aria-label={`Remove ${tag}`}
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
              <Input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add a tag"
                className="h-7 w-28"
              />
            </div>
          </JobSection>

          <JobSection
            title="Related contacts"
            actions={
              relatedOptions.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-7" />}>
                    <Plus className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-64 min-w-48 overflow-auto">
                    {relatedOptions.map((contact) => (
                      <DropdownMenuItem
                        key={contact.id}
                        onClick={() =>
                          patch({ relatedContactIds: uniqueIds([...job.relatedContactIds, contact.id]) })
                        }
                      >
                        {contact.name}
                        <span className="ml-auto text-xs text-muted-foreground">{contact.title}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null
            }
          >
            {related.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts on this job yet.</p>
            ) : (
              <ul className="space-y-2">
                {related.map((contact) => (
                  <li key={contact.id} className="border bg-background p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {contact.id === job.primaryContactId ? (
                          <Badge variant="secondary" className="gap-1">
                            <Sparkles className="size-3" />
                            Primary
                          </Badge>
                        ) : null}
                        <Badge variant="outline">{contactKind(contact, job)}</Badge>
                      </div>
                      {contact.id !== job.primaryContactId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() =>
                            patch({
                              relatedContactIds: job.relatedContactIds.filter((id) => id !== contact.id),
                              subcontractorIds: job.subcontractorIds.filter((id) => id !== contact.id),
                            })
                          }
                          aria-label={`Remove ${contact.name}`}
                        >
                          <XIcon className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                    <Link href={`/contacts?contact=${contact.id}`} className="flex items-center gap-2 text-sm font-medium hover:underline">
                      <User className="size-3.5 text-muted-foreground" />
                      {contact.name}
                    </Link>
                    {contact.phone ? (
                      <p className="mt-1.5 flex items-center gap-2 text-sm">
                        <Phone className="size-3.5 text-muted-foreground" />
                        <a href={`tel:${contact.phone}`} className="hover:underline">
                          {contact.phone}
                        </a>
                        <button type="button" onClick={() => copyText(contact.phone, "Phone")} aria-label="Copy phone">
                          <Copy className="size-3.5 text-muted-foreground" />
                        </button>
                        <Link
                          href={`/messages?job=${job.id}&contact=${contact.id}`}
                          className="text-xs font-medium hover:underline"
                        >
                          Text
                        </Link>
                      </p>
                    ) : null}
                    {contact.email ? (
                      <p className="mt-1 flex items-center gap-2 text-sm">
                        <Mail className="size-3.5 text-muted-foreground" />
                        <a href={`mailto:${contact.email}`} className="truncate hover:underline">
                          {contact.email}
                        </a>
                        <button type="button" onClick={() => copyText(contact.email, "Email")} aria-label="Copy email">
                          <Copy className="size-3.5 text-muted-foreground" />
                        </button>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </JobSection>

          <JobSection title="Training for this job" defaultOpen={false}>
            <ul className="space-y-2">
              {recommendedChapterIds(job.projectType || opportunity?.projectType).map((chapterId) => {
                const chapter = COURSE.chapters.find((item) => item.id === chapterId);
                if (!chapter) return null;
                return (
                  <li key={chapterId}>
                    <Link href={`/training/${chapter.id}`} className="text-sm font-medium hover:underline">
                      {chapter.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{chapter.tagline}</p>
                  </li>
                );
              })}
            </ul>
          </JobSection>

          <div className="px-4 py-4" id="job-activity">
            <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-foreground uppercase">
              Activity
            </p>
            <ActivityComposer entityType="job" entityId={job.id} focusRequest={activityFocus} />
            <div className="mt-4">
              <ActivityList
                items={activities}
                empty="No field notes yet. Log a call, text, or what the crew needs to see."
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="photos" className="border-x border-b p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {photos.length === 0 ? "No photos on this job." : `${photos.length} photos`}
            </p>
            <Button size="sm" variant="outline" onClick={() => setPhotoOpen(true)}>
              Add photo
            </Button>
          </div>
          {photos.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {photos.map((photo) => (
                <figure key={photo.id} className="overflow-hidden border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.imageUrl}
                    alt={photo.caption || "Job photo"}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <figcaption className="space-y-1 p-2.5">
                    <PhotoCategoryBadge category={photo.category} />
                    <p className="text-sm leading-snug">{photo.caption || "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">
                      {photo.createdBy?.trim()
                        ? `Taken by ${photo.createdBy.trim()} · ${formatDate(photo.takenAt)}`
                        : formatDate(photo.takenAt)}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="files" className="space-y-8 border-x border-b p-4">
          <section>
            <div className="mb-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Invoices, receipts, and payments</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Open a file to see comments from accounting. Reply here — not on Approve.
              </p>
            </div>
            {financialDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No invoices, expenses, or payments on this job yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {financialDocs.map((item) => {
                  const status = reviewItemStatus(item);
                  return (
                    <li key={`${item.kind}-${item.id}`}>
                      <button
                        type="button"
                        onClick={() =>
                          router.replace(jobDocumentHref(job.id, item.kind, item.id), { scroll: false })
                        }
                        className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left hover:bg-muted/50"
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{itemTitle(item)}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {itemKindLabel(item.kind)}
                          </span>
                        </span>
                        <QbStatusBadge status={status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <JobFilesPanel jobId={job.id} disabled={deleted} />
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Pages you send out</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {reports.length === 0
                    ? "No pages on this job."
                    : `${reports.length} page${reports.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <Button size="sm" onClick={() => setPageCreateOpen(true)}>
                <FileText data-icon="inline-start" />
                New page
              </Button>
            </div>
            {reports.length > 0 ? (
              <ul className="space-y-1.5">
                {reports.map((item) => {
                  const templateLabel =
                    PAGE_TEMPLATE_OPTIONS.find((option) => option.id === item.template)?.title ?? "Page";
                  return (
                    <li key={item.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setReportId(item.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm font-medium">{item.title || "Untitled page"}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {templateLabel} · {item.pages.length} sheet{item.pages.length === 1 ? "" : "s"}
                        </span>
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => {
                          void (async () => {
                            try {
                              const token = await crm.ensurePageShareToken(item.id);
                              copyText(shareUrl("p", token), "Client link");
                            } catch {
                              toast.error("Could not create a share link.");
                            }
                          })();
                        }}
                      >
                        Share
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pages are branded job documents you send out — photo documentation, inspections, closeouts, and
                claim packets. Pick a template, then share a link or download a PDF.
              </p>
            )}
          </section>
        </TabsContent>

        <TabsContent value="financials" className="border-x border-b p-4">
          <JobFinancials job={job} />
        </TabsContent>

        <TabsContent value="paper" className="space-y-4 border-x border-b p-4">
          {tasks.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] uppercase">Tasks</p>
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <li key={task.id} className="text-sm">
                    <p className={task.completed ? "text-muted-foreground line-through" : ""}>{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.assignee} · {formatDate(task.dueAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Estimates</p>
              <StartEstimateButton
                size="sm"
                variant="ghost"
                jobId={job.id}
                opportunityId={job.opportunityId}
                contactId={job.primaryContactId}
                clientId={job.clientId}
              >
                New
              </StartEstimateButton>
            </div>
            {estimates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No estimates tied to this job.</p>
            ) : (
              <ul className="space-y-2">
                {estimates.map((estimate) => (
                  <li key={estimate.id}>
                    <Link href={`/estimates/${estimate.id}`} className="text-sm font-medium hover:underline">
                      {estimate.number}
                    </Link>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <EstimateStatusBadge status={estimate.status} />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatCurrencyFull(
                          amountForEstimate(
                            estimate,
                            crm.estimateLines,
                            workMarket(job, opportunity),
                          )
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hasEstimateSignature(estimate)
                        ? `Signed by ${estimate.signatureName}`
                        : estimate.status === "declined"
                          ? "Declined"
                          : "Open to collect a signature"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Invoices</p>
              <Button size="sm" variant="ghost" onClick={() => setInvoiceOpen(true)}>
                New
              </Button>
            </div>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices on this job.</p>
            ) : (
              <ul className="space-y-2">
                {invoices.map((invoice) => (
                  <li key={invoice.id}>
                    <button
                      type="button"
                      onClick={() =>
                        router.replace(jobDocumentHref(job.id, "invoice", invoice.id), { scroll: false })
                      }
                      className="text-sm font-medium hover:underline"
                    >
                      {invoice.number}
                    </button>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <InvoiceStatusBadge
                        status={derivedInvoiceStatus(invoice, crm.invoiceLines, crm.payments)}
                      />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatCurrencyFull(invoiceBalance(invoice.id, crm.invoiceLines, crm.payments))} due
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                        Customer invoice
                      </Link>
                      {invoice.qbStatus === "returned" ? " · Accounting asked for a change" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Material orders</p>
              <Button
                size="sm"
                variant="ghost"
                disabled={materialPending}
                onClick={() => void startMaterialOrder(job.id)}
              >
                New
              </Button>
            </div>
            {materialOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No material orders on this job. Build one by hand from the price book — it does not follow
                the estimate.
              </p>
            ) : (
              <ul className="space-y-2">
                {materialOrders.map((order) => {
                  const lines = materialOrderLinesFor(order.id, crm.materialOrderLines ?? []);
                  return (
                    <li key={order.id}>
                      <Link href={`/material-orders/${order.id}`} className="text-sm font-medium hover:underline">
                        {order.number}
                      </Link>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {order.vendor.trim() || "No supplier yet"}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatCurrencyFull(materialOrderTotal(lines))} est.
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="fields" className="border-x border-b p-4">
          {visibleJobCustomFields(job.customFields).length === 0 ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Claim numbers, deductibles, HOA notes — fields that do not belong on every job.
            </p>
          ) : (
            <ul className="mb-4 divide-y border">
              {visibleJobCustomFields(job.customFields).map((field) => (
                <li key={field.id} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{field.label}</p>
                    <Input
                      defaultValue={field.value}
                      onBlur={(event) => {
                        if (event.target.value === field.value) return;
                        patch({
                          customFields: job.customFields.map((item) =>
                            item.id === field.id ? { ...item, value: event.target.value } : item
                          ),
                        });
                      }}
                      className="mt-1 h-8"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-5 size-7"
                    onClick={() =>
                      patch({ customFields: job.customFields.filter((item) => item.id !== field.id) })
                    }
                    aria-label={`Remove ${field.label}`}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              value={fieldLabel}
              onChange={(event) => setFieldLabel(event.target.value)}
              placeholder="Field name"
            />
            <Input
              value={fieldValue}
              onChange={(event) => setFieldValue(event.target.value)}
              placeholder="Value"
            />
            <Button variant="outline" onClick={addCustomField}>
              Add field
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={addressOpen} onOpenChange={setAddressOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Job site</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="job-street">Street</Label>
              <Input id="job-street" value={street} onChange={(event) => setStreet(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_5rem_6rem]">
              <div className="grid gap-1.5">
                <Label htmlFor="job-city">City</Label>
                <Input id="job-city" value={city} onChange={(event) => setCity(event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="job-state">State</Label>
                <Input id="job-state" value={state} onChange={(event) => setState(event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="job-zip">ZIP</Label>
                <Input id="job-zip" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddressOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAddress}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddPhotoDialog open={photoOpen} onOpenChange={setPhotoOpen} jobId={job.id} />
      <CreatePageDialog
        open={pageCreateOpen}
        onOpenChange={setPageCreateOpen}
        pending={pageCreating}
        onCreate={(template) => void startPage(template)}
      />
      <CreateInvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        defaultClientId={job.clientId}
        defaultJobId={job.id}
        onCreated={() => setJobTab("paper")}
      />
      <LogExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} defaultJobId={job.id} />
      {openReport ? (
        <PhotoReportBuilder job={job} report={openReport} onClose={() => setReportId(null)} />
      ) : null}
      <DeleteJobDialog job={job} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
