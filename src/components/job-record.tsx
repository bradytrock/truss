"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
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
  Trash2,
  User,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ActivityComposer, ActivityList } from "@/components/activity";
import { AddPhotoDialog, CreateInvoiceDialog } from "@/components/create-ops-dialogs";
import { StartEstimateButton, StartEstimateDialogHost } from "@/components/start-estimate-button";
import { LogExpenseDialog } from "@/components/log-financial-dialogs";
import { CreatePageDialog } from "@/components/create-page-dialog";
import { DeleteJobDialog } from "@/components/delete-job-dialog";
import { JobFilesPanel } from "@/components/job-files";
import { JobEagleviewPanel } from "@/components/job-eagleview";
import { JobPhotosPanel } from "@/components/job-photos-panel";
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
import { EstimateStatusBadge, InvoiceStatusBadge, QbStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate, formatInboxTime, formatPhone } from "@/lib/format";
import { mailHref } from "@/lib/job-emails";
import { assignedCrewPatch, isDeletedJob, jobAddress, mapsUrl, primaryHomeownerPatch, uniqueIds, uniqueNames } from "@/lib/job-record";
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
import { livePhotos, primaryJobPhoto } from "@/lib/photo-trash";
import { shareUrl } from "@/lib/share";
import { leadSourceChoices, leadSourceLabel } from "@/lib/leads";
import { derivedInvoiceStatus, invoiceBalance } from "@/lib/money";
import { amountForEstimate } from "@/lib/estimate-totals";
import { jobProfitAndLoss } from "@/lib/job-financials";
import { hasEstimateSignature } from "@/lib/estimate-signature";
import { workMarket } from "@/lib/market";
import { COURSE } from "@/lib/training/engine";
import { recommendedChapterIds } from "@/lib/training/recommend";
import {
  ESTIMATE_STATUS_LABELS,
  JOB_MARKET_LABELS,
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
import { MaterialOrderFromTemplateDialog } from "@/components/material-order-from-template-dialog";

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

const quietSelect =
  "h-auto w-full justify-end border-0 bg-transparent p-0 shadow-none hover:bg-transparent dark:bg-transparent";

const pillSelect =
  "h-7 w-auto gap-1 rounded-full border bg-background px-2.5 text-xs font-medium shadow-none";

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 border-b py-2 last:border-b-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="min-w-0 text-right text-sm">{children}</div>
    </div>
  );
}

function SummaryCard({
  eyebrow,
  title,
  children,
  href,
  onClick,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <p className="mt-2 text-sm font-medium">{title}</p>
      <div className="mt-1 text-sm text-muted-foreground">{children}</div>
    </>
  );
  const className = "rounded-md border bg-card p-4 text-left transition-colors hover:bg-muted/40";
  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }
  return <div className="rounded-md border bg-card p-4">{inner}</div>;
}

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

export function JobRecord({
  job,
  className,
  onClose,
}: {
  job: Job;
  className?: string;
  onClose?: () => void;
}) {
  const crm = useCrm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const startEstimateFlow = useStartEstimate();
  const { prompt: startEstimate, pending: estimatePending } = startEstimateFlow;
  const { start: startMaterialOrder, pending: materialPending } = useStartMaterialOrder();
  const tab = parseJobTab(searchParams.get("tab"));
  const [photoOffset, setPhotoOffset] = useState(0);
  const [addressOpen, setAddressOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [materialTemplateOpen, setMaterialTemplateOpen] = useState(false);
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

  function setJobTab(next: JobTab) {
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
      startEstimate({
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
  const photos = livePhotos(crm.photos, job.id);
  const reports = crm.photoReports.filter((report) => report.jobId === job.id);
  const openReport = reportId ? reports.find((report) => report.id === reportId) : undefined;
  const hero = primaryJobPhoto(crm.photos, job);
  const primaryPhotoIndex = photos.findIndex((photo) => photo.id === job.primaryPhotoId);
  const startPhotoIndex = primaryPhotoIndex >= 0 ? primaryPhotoIndex : 0;
  const photoIndex = photos.length
    ? (((startPhotoIndex + photoOffset) % photos.length) + photos.length) % photos.length
    : 0;
  const shownPhoto = photos[photoIndex] ?? hero ?? null;
  const address = jobAddress(job);
  const cityLine = [job.city, [job.state, job.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const jobFiles = (crm.jobFiles ?? []).filter((file) => file.jobId === job.id);
  const fileCount = jobFiles.length + reports.length;
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
  const books = jobProfitAndLoss({
    job,
    invoices: crm.invoices,
    invoiceLines: crm.invoiceLines,
    payments: crm.payments,
    expenses: crm.expenses,
    basis: "accrual",
  });
  const draftEstimateTotal = estimates
    .filter((estimate) => estimate.status === "draft")
    .reduce(
      (sum, estimate) => sum + amountForEstimate(estimate, crm.estimateLines, workMarket(job, opportunity)),
      0,
    );
  const featuredEstimate =
    estimates.find((estimate) => estimate.status === "sent" || estimate.status === "viewed") ??
    estimates.find((estimate) => estimate.status === "draft") ??
    estimates.find((estimate) => estimate.status === "accepted") ??
    estimates[0];
  const nextTask = tasks
    .filter((task) => !task.completed)
    .slice()
    .sort((left, right) => (left.dueAt || "z").localeCompare(right.dueAt || "z"))[0];
  const nextStepTitle =
    nextTask?.title.trim() || (job.status === "precon" ? "Scope review" : JOB_STATUS_LABELS[job.status]);
  const nextStepDate = nextTask?.dueAt ? formatDate(nextTask.dueAt) : "No date set";
  const latestPage = reports[0];
  const jobMail = (crm.gmailMessages ?? [])
    .filter((message) => message.jobId === job.id)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

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
  const primaryHomeownerOptions = useMemo(() => {
    const onJob = new Set(
      [job.primaryContactId, ...job.relatedContactIds, ...job.subcontractorIds].filter(Boolean),
    );
    return [...crm.contacts]
      .filter((contact) => onJob.has(contact.id) || !contact.isReferralPartner)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [crm.contacts, job.primaryContactId, job.relatedContactIds, job.subcontractorIds]);

  function setPrimaryHomeowner(contactId: string) {
    if (deleted) return;
    const next = primaryHomeownerPatch(job, contactId);
    if (!next) return;
    patch(next);
    if (opportunity && opportunity.primaryContactId !== contactId) {
      void crm.updateOpportunity(opportunity.id, { primaryContactId: contactId });
    }
    const name = crm.getContact(contactId)?.name?.trim();
    toast.success(name ? `${name} is now the primary homeowner.` : "Primary homeowner updated.");
  }

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

  const newMenu = !deleted ? (
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
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={() => openNew("estimate")}>New estimate</DropdownMenuItem>
        <DropdownMenuItem onClick={() => openNew("invoice")}>New invoice</DropdownMenuItem>
        <DropdownMenuItem onClick={() => openNew("materials")}>New material order</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setMaterialTemplateOpen(true)}>
          New material order from template
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openNew("interaction")}>New interaction</DropdownMenuItem>
        <DropdownMenuItem onClick={() => openNew("expense")}>New expense</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {job.code ? <RecordCode code={job.code} className="text-xs" /> : null}
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
            <SelectTrigger className={pillSelect}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {JOB_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              { value: "residential", label: JOB_MARKET_LABELS.residential },
              { value: "commercial", label: JOB_MARKET_LABELS.commercial },
            ]}
          >
            <SelectTrigger className={pillSelect}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="residential">{JOB_MARKET_LABELS.residential}</SelectItem>
              <SelectItem value="commercial">{JOB_MARKET_LABELS.commercial}</SelectItem>
            </SelectContent>
          </Select>
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
            <SelectTrigger className={cn(pillSelect, !job.projectType && "text-muted-foreground")}>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {PROJECT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {primary?.phone ? (
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              className="rounded-full"
              render={<Link href={`/messages?job=${job.id}&contact=${primary.id}`} />}
            >
              Text homeowner
            </Button>
          ) : null}
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            className="rounded-full"
            render={<Link href={mailHref({ job: job.id, contact: primary?.id })} />}
          >
            Mail
          </Button>
          {newMenu}
          {onClose ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <XIcon />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">

      <div className="grid gap-8 px-4 py-5 sm:px-6 lg:grid-cols-[19.5rem_minmax(0,1fr)] lg:gap-10">
        <aside className="min-w-0 space-y-5">
          <div>
            <h1
              id="job-window-title"
              className="font-heading text-2xl leading-tight font-medium text-balance"
            >
              {job.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {cityLine || address || "Add a job-site address"}
            </p>
          </div>

          <div className="relative overflow-hidden rounded-md border bg-muted">
            {shownPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shownPhoto.imageUrl}
                alt={shownPhoto.caption || job.name}
                className="aspect-[16/10] w-full object-cover"
              />
            ) : (
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 text-muted-foreground"
              >
                <ImageIcon className="size-8" />
                <span className="text-sm">Add a job-site photo</span>
              </button>
            )}
            {shownPhoto && job.primaryPhotoId === shownPhoto.id ? (
              <span className="absolute bottom-3 left-3 rounded-sm bg-background/90 px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
                Primary
              </span>
            ) : null}
            {photos.length > 0 ? (
              <span className="absolute right-3 bottom-3 rounded-sm bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground">
                {photos.length} photo{photos.length === 1 ? "" : "s"}
              </span>
            ) : null}
            {photos.length > 1 ? (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-1/2 left-2 size-7 -translate-y-1/2 bg-background/90"
                  onClick={() => setPhotoOffset((offset) => offset - 1)}
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-1/2 right-2 size-7 -translate-y-1/2 bg-background/90"
                  onClick={() => setPhotoOffset((offset) => offset + 1)}
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              disabled={!address}
              nativeButton={false}
              render={address ? <a href={mapsUrl(address)} target="_blank" rel="noreferrer" /> : undefined}
            >
              <MapPin data-icon="inline-start" />
              Map
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => copyText(address, "Address")}
              disabled={!address}
            >
              <Copy data-icon="inline-start" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => {
                setStreet(job.street);
                setCity(job.city);
                setState(job.state);
                setPostalCode(job.postalCode);
                setAddressOpen(true);
              }}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
          </div>
          {canTrash ? (
            <div className="flex justify-end">
              {deleted ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={restoring}
                  onClick={() => {
                    setRestoring(true);
                    void crm.restoreJob(job.id).then((ok) => {
                      setRestoring(false);
                      if (ok) toast.success(`${job.code || job.name} is back on the board.`);
                    });
                  }}
                >
                  <RotateCcw data-icon="inline-start" />
                  Restore
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              )}
            </div>
          ) : null}

          <section>
            <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Homeowner
            </p>
            <div className="flex items-start justify-between gap-3 rounded-md border bg-card p-3">
              <div className="min-w-0">
                <Link
                  href={primary ? `/contacts?contact=${primary.id}` : client ? `/clients/${client.id}` : "/contacts"}
                  className="text-sm font-medium hover:underline"
                >
                  {primary?.name || client?.name || crm.customerName(job) || "Add a homeowner"}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {primary?.phone ? formatPhone(primary.phone) : "No phone"}
                  {primary ? " · Primary" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                {primary?.phone ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    nativeButton={false}
                    render={<a href={`tel:${primary.phone}`} />}
                    aria-label={`Call ${primary.name}`}
                  >
                    <Phone />
                  </Button>
                ) : null}
                {primary?.phone ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    nativeButton={false}
                    render={<Link href={`/messages?job=${job.id}&contact=${primary.id}`} />}
                    aria-label={`Text ${primary.name}`}
                  >
                    <MessageSquare />
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <section>
            <p className="mb-1 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Details
            </p>
            <DetailRow label="Seed">
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
            </DetailRow>
            <DetailRow label="Assigned">
              <PeopleChips
                names={job.assigned}
                options={crm.teamMembers}
                empty="Add crew"
                onRemove={(name) => patch(assignedCrewPatch(job.assigned.filter((item) => item !== name), crm.staff))}
                onAdd={(name) => patch(assignedCrewPatch([...job.assigned, name], crm.staff))}
              />
            </DetailRow>
            <DetailRow label="Start">
              <Input
                type="date"
                value={job.startDate?.slice(0, 10) ?? ""}
                onChange={(event) => patch({ startDate: event.target.value })}
                className="h-7 border-0 bg-transparent px-0 text-right shadow-none"
              />
            </DetailRow>
            <DetailRow label="End">
              <Input
                type="date"
                value={job.substantialCompletion?.slice(0, 10) ?? ""}
                onChange={(event) => patch({ substantialCompletion: event.target.value || null })}
                className="h-7 border-0 bg-transparent px-0 text-right shadow-none"
              />
            </DetailRow>
          </section>

          <section>
            <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Tags
            </p>
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
                placeholder="Add"
                className="h-7 w-20"
              />
            </div>
          </section>
        </aside>

        <div className="min-w-0">
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
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <TabsList variant="line" className="h-auto w-full justify-start overflow-x-auto rounded-none bg-transparent p-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="photos">
              Photos
              <span className="ml-1 text-muted-foreground">{photos.length}</span>
            </TabsTrigger>
            <TabsTrigger value="files">
              Files
              <span className="ml-1 text-muted-foreground">{fileCount}</span>
            </TabsTrigger>
            <TabsTrigger value="paper">
              Paper
              <span className="ml-1 text-muted-foreground">{estimates.length + invoices.length}</span>
            </TabsTrigger>
            <TabsTrigger value="financials">Financials</TabsTrigger>
            <TabsTrigger value="fields">Custom fields</TabsTrigger>
          </TabsList>
          <p className="shrink-0 text-right text-sm tabular-nums">
            <span className="font-medium">{formatCurrencyFull(books.invoiced)}</span>
            <span className="text-muted-foreground"> invoiced</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            <span className="text-muted-foreground">est. draft {formatCurrencyFull(draftEstimateTotal)}</span>
          </p>
        </div>

        <TabsContent value="overview" className="mt-0">
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <SummaryCard
              eyebrow="Estimate"
              title={featuredEstimate?.number ?? "No estimate yet"}
              href={featuredEstimate ? `/estimates/${featuredEstimate.id}` : undefined}
            >
              {featuredEstimate ? (
                <>
                  <p>
                    {ESTIMATE_STATUS_LABELS[featuredEstimate.status]}
                    {" · "}
                    {formatCurrencyFull(
                      amountForEstimate(
                        featuredEstimate,
                        crm.estimateLines,
                        workMarket(job, opportunity),
                      ),
                    )}
                  </p>
                  <p className="mt-1">
                    {hasEstimateSignature(featuredEstimate)
                      ? `Signed by ${featuredEstimate.signatureName}`
                      : featuredEstimate.status === "declined"
                        ? "Declined"
                        : "Open to collect a signature"}
                  </p>
                </>
              ) : (
                <p>Start a proposal from New.</p>
              )}
            </SummaryCard>
            <SummaryCard
              eyebrow="Files"
              title={
                fileCount > 0
                  ? `${fileCount} uploaded`
                  : "No files yet"
              }
              onClick={() => setJobTab("files")}
            >
              {latestPage ? (
                <p>
                  {latestPage.title || "Untitled page"}
                  {PAGE_TEMPLATE_OPTIONS.find((option) => option.id === latestPage.template)
                    ? ` · ${PAGE_TEMPLATE_OPTIONS.find((option) => option.id === latestPage.template)?.title}`
                    : ""}
                </p>
              ) : jobFiles[0] ? (
                <p>{jobFiles[0].name}</p>
              ) : (
                <p>Photo reports and job files land here.</p>
              )}
            </SummaryCard>
            <SummaryCard
              eyebrow="Next step"
              title={nextStepTitle}
              onClick={() => setJobTab("paper")}
            >
              <p>This week</p>
              <p className="mt-1">{nextStepDate}</p>
            </SummaryCard>
          </div>

          <section className="mb-6">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Description
            </p>
            <Textarea
              defaultValue={job.description}
              placeholder="Add a description"
              rows={3}
              className="rounded-md"
              onBlur={(event) => {
                if (event.target.value !== job.description) {
                  patch({ description: event.target.value });
                }
              }}
            />
          </section>

          <JobSection
            title="Related contacts"
            defaultOpen={false}
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
                        <div className="flex shrink-0 items-center gap-0.5">
                          {!deleted && !contact.isReferralPartner && !job.subcontractorIds.includes(contact.id) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setPrimaryHomeowner(contact.id)}
                            >
                              Make primary
                            </Button>
                          ) : null}
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
                        </div>
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

          <section className="pt-2" id="job-activity">
            <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Activity
            </p>
            {jobMail.length > 0 ? (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Tagged mail</p>
                <ul className="space-y-2">
                  {jobMail.map((message) => (
                    <li key={message.id}>
                      <Link
                        href={mailHref({ thread: message.threadId || message.id, job: job.id })}
                        className="block rounded-md border px-3 py-2 hover:bg-muted/50"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {message.subject.trim() || "(no subject)"}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatInboxTime(message.receivedAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {message.direction === "outbound" ? "To" : "From"}{" "}
                          {message.fromName || message.fromEmail} · {message.snippet || message.bodyText}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ActivityComposer entityType="job" entityId={job.id} focusRequest={activityFocus} />
            <div className="mt-4">
              <ActivityList
                items={activities}
                empty="No field notes yet. Log a call, text, or what the crew needs to see."
              />
            </div>
          </section>
        </TabsContent>

        <TabsContent value="photos" className="mt-0">
          <JobPhotosPanel
            jobId={job.id}
            disabled={deleted}
            onAddPhoto={() => setPhotoOpen(true)}
          />
        </TabsContent>

        <TabsContent value="files" className="mt-0 space-y-8">
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
          <JobEagleviewPanel jobId={job.id} disabled={deleted} />
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

        <TabsContent value="financials" className="mt-0">
          <JobFinancials job={job} />
        </TabsContent>

        <TabsContent value="paper" className="mt-0 space-y-4">
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
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href="/material-orders/templates" />}
                >
                  Templates
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={materialPending}
                  onClick={() => setMaterialTemplateOpen(true)}
                >
                  From template
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={materialPending}
                  onClick={() => void startMaterialOrder(job.id)}
                >
                  New
                </Button>
              </div>
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

        <TabsContent value="fields" className="mt-0">
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
        </div>
      </div>
      </div>

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
      <MaterialOrderFromTemplateDialog
        jobId={job.id}
        open={materialTemplateOpen}
        onOpenChange={setMaterialTemplateOpen}
      />
      <StartEstimateDialogHost flow={startEstimateFlow} />
      {openReport ? (
        <PhotoReportBuilder job={job} report={openReport} onClose={() => setReportId(null)} />
      ) : null}
      <DeleteJobDialog job={job} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
