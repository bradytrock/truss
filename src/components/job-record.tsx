"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  Calendar,
  ChevronDown,
  Copy,
  Ellipsis,
  FileText,
  ImageIcon,
  Mail,
  MapPin,
  Maximize2,
  MessageSquare,
  Minimize2,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AddressStreetField } from "@/components/address-street-field";
import { ActivityComposer, ActivityList } from "@/components/activity";
import { AddPhotoDialog, CreateInvoiceDialog } from "@/components/create-ops-dialogs";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { TaskRow } from "@/components/task-row";
import { StartEstimateButton, StartEstimateDialogHost } from "@/components/start-estimate-button";
import { LogExpenseDialog } from "@/components/log-financial-dialogs";
import { CreatePageDialog } from "@/components/create-page-dialog";
import { DeleteJobDialog } from "@/components/delete-job-dialog";
import { JobFilesPanel } from "@/components/job-files";
import { JobEagleviewPanel } from "@/components/job-eagleview";
import { RoofMeasureEntry } from "@/components/roof-measure-entry";
import { JobCompanyCamPanel } from "@/components/job-companycam";
import { JobPhotosPanel } from "@/components/job-photos-panel";
import { PhotoViewer } from "@/components/photo-viewer";
import { JobFinancials } from "@/components/job-financials";
import { JobCloseout } from "@/components/job-closeout";
import { JobInsurancePanel } from "@/components/job-insurance-panel";
import { claimTotals } from "@/lib/insurance";
import { AutomationRuns } from "@/components/automation-runs";
import { PaperArchiveButton } from "@/components/paper-archive-button";
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
import { TradesMenu } from "@/components/trades-field";
import { EstimateStatusBadge, InvoiceStatusBadge, QbStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate, formatInboxTime, formatPhone } from "@/lib/format";
import { mailHref } from "@/lib/job-emails";
import { assignedCrewPatch, isDeletedJob, jobAddress, jobRecordHref, mapsUrl, primaryHomeownerPatch, uniqueIds, uniqueNames } from "@/lib/job-record";
import {
  canReviewJobCodes,
  isJobCodeReviewTask,
  parseJobCodeReviewNotes,
  suggestedJobCode,
  existingRecordCodes,
} from "@/lib/job-code";
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
import { amountForEstimate, featuredEstimateForJob, jobSoldAmount } from "@/lib/estimate-totals";
import { jobProfitAndLoss } from "@/lib/job-financials";
import { hasEstimateSignature } from "@/lib/estimate-signature";
import { workMarket } from "@/lib/market";
import { WORK_COLUMNS, WORK_COLUMN_LABELS, workColumnFor, type WorkColumn } from "@/lib/work-board";
import { COURSE } from "@/lib/training/engine";
import { recommendedChapterIds } from "@/lib/training/recommend";
import {
  ESTIMATE_STATUS_LABELS,
  JOB_MARKET_LABELS,
  type Contact,
  type Job,
  type LeadSource,
  type PageTemplateId,
  type PhotoPageLayout,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { PhotoReportBuilder } from "@/components/photo-report-builder";
import { CloseoutVentDialog } from "@/components/closeout-vents";
import { canSubmitProjectCloseout, closeoutHasVentRecord } from "@/lib/commission-closeout";
import {
  canCreateEstimates,
  canCreatePages,
  canDeleteJobs,
  canEditPages,
  canManageCompanyCamMapping,
  canManageJobPhotos,
  canViewInsurance,
  canViewJobPaper,
  canViewProjectFinancials,
  canViewTraining,
} from "@/lib/visibility";
import { useStartEstimate } from "@/lib/start-estimate";
import { useStartMaterialOrder } from "@/lib/start-material-order";
import { materialOrderLinesFor, materialOrderTotal } from "@/lib/material-orders";
import { archivedPaper, livePaper } from "@/lib/paper-archive";
import { MaterialOrderFromTemplateDialog } from "@/components/material-order-from-template-dialog";
import { JobTagField } from "@/components/job-tag-field";
import { jobTagSuggestions } from "@/lib/job-tags";

const JOB_TABS = ["overview", "photos", "files", "insurance", "financials", "closeout", "paper"] as const;
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
  meta,
  defaultOpen = true,
  actions,
  children,
}: {
  title: string;
  meta?: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b">
      <div className="flex items-center gap-2 py-3">
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
          {meta != null ? (
            <span className="ml-auto text-xs font-normal tracking-normal text-muted-foreground normal-case">
              {meta}
            </span>
          ) : null}
        </button>
        {actions}
      </div>
      {open ? <div className="pb-4">{children}</div> : null}
    </section>
  );
}

function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

function formatJobRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "";
  if (start && end) {
    const left = new Date(`${start.slice(0, 10)}T12:00:00`);
    const right = new Date(`${end.slice(0, 10)}T12:00:00`);
    if (
      !Number.isNaN(left.getTime()) &&
      !Number.isNaN(right.getTime()) &&
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth()
    ) {
      const month = left.toLocaleDateString("en-US", { month: "short" });
      return `${month} ${left.getDate()} – ${right.getDate()}, ${right.getFullYear()}`;
    }
    return `${formatDate(start)} – ${formatDate(end)}`;
  }
  return formatDate(start || end);
}

const COLUMN_PILL: Record<WorkColumn, string> = {
  lead: "border-amber-200 bg-amber-50 text-amber-950",
  proposal_sent: "border-sky-200 bg-sky-50 text-sky-950",
  supplementing: "border-blue-200 bg-blue-50 text-blue-950",
  in_progress: "border-emerald-200 bg-emerald-50 text-emerald-950",
  punch: "border-orange-200 bg-orange-50 text-orange-950",
  complete: "border-emerald-200 bg-emerald-50 text-emerald-950",
  on_hold: "border-zinc-200 bg-zinc-100 text-zinc-800",
  unqualified: "border-rose-200 bg-rose-50 text-rose-900",
  lost: "border-rose-200 bg-rose-50 text-rose-900",
  deleted: "border-zinc-300 bg-zinc-100 text-zinc-700",
};

const COLUMN_DOT: Record<WorkColumn, string> = {
  lead: "bg-amber-500",
  proposal_sent: "bg-sky-500",
  supplementing: "bg-blue-500",
  in_progress: "bg-emerald-500",
  punch: "bg-orange-500",
  complete: "bg-emerald-600",
  on_hold: "bg-zinc-400",
  unqualified: "bg-rose-400",
  lost: "bg-rose-600",
  deleted: "bg-zinc-500",
};

const QUICK_PAGE_TEMPLATES: Array<{ id: PageTemplateId; title: string }> = [
  { id: "work_order", title: "Work order" },
  { id: "photos", title: "Photo documentation" },
  { id: "inspection", title: "Inspection" },
  { id: "completion", title: "Closeout" },
  { id: "claim", title: "Claim packet" },
];

function WorkRow({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid items-start gap-2 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] sm:items-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="min-w-0 text-sm">{children}</div>
      <div className="flex flex-wrap justify-end gap-1">{action}</div>
    </div>
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
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 py-2.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="min-w-0 text-right text-sm">{children}</div>
    </div>
  );
}

function SummaryCard({
  eyebrow,
  title,
  detail,
  action,
  href,
  onClick,
}: {
  eyebrow: string;
  title: string;
  detail: ReactNode;
  action?: string;
  href?: string;
  onClick?: () => void;
}) {
  const actionClass = "mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline";
  return (
    <div className="flex h-full flex-col rounded-[12px] border bg-card p-4">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{eyebrow}</p>
      <p className="mt-3 text-lg leading-snug font-semibold">{title}</p>
      <div className="mt-1 flex-1 text-sm text-muted-foreground">{detail}</div>
      {action && href ? (
        <Link href={href} className={actionClass}>
          {action}
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
      {action && !href && onClick ? (
        <button type="button" onClick={onClick} className={cn(actionClass, "text-left")}>
          {action}
          <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </div>
  );
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
  const title = contact.title ?? "";
  if (job.subcontractorIds?.includes(contact.id)) return "Trade";
  if (contact.isReferralPartner) return title.toLowerCase().includes("adjuster") ? "Adjuster" : "Referral";
  if (title.toLowerCase().includes("adjuster")) return "Adjuster";
  if (contact.clientId) return title || "Company";
  return title || "Homeowner";
}

export function JobRecord({
  job,
  className,
  onClose,
  expanded,
  onToggleExpand,
}: {
  job: Job;
  className?: string;
  onClose?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const crm = useCrm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const startEstimateFlow = useStartEstimate();
  const { prompt: startEstimate, pending: estimatePending } = startEstimateFlow;
  const { start: startMaterialOrder, pending: materialPending } = useStartMaterialOrder();
  const seatRole = crm.effectiveStaff?.role;
  const showFinancials = canViewProjectFinancials(seatRole);
  const showPaper = canViewJobPaper(seatRole);
  const showInsurance = canViewInsurance(seatRole);
  const allowEstimates = canCreateEstimates(seatRole);
  const allowPages = canCreatePages(seatRole);
  const editPages = canEditPages(seatRole);
  const allowCompanyCamMap = canManageCompanyCamMapping(seatRole);
  const showTraining = canViewTraining(seatRole);
  const managePhotos = canManageJobPhotos(seatRole);
  const closeout = (crm.commissionCloseouts ?? []).find((item) => item.jobId === job.id) ?? null;
  const showCloseout = showFinancials && closeout != null;
  const requestedTab = parseJobTab(searchParams.get("tab"));
  const tab =
    (requestedTab === "financials" && !showFinancials) ||
    (requestedTab === "paper" && !showPaper) ||
    (requestedTab === "insurance" && !showInsurance) ||
    (requestedTab === "closeout" && !showCloseout)
      ? "overview"
      : requestedTab;
  const [addressOpen, setAddressOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoViewOpen, setPhotoViewOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [materialTemplateOpen, setMaterialTemplateOpen] = useState(false);
  const [activityFocus, setActivityFocus] = useState(0);
  const [reportId, setReportId] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [pageCreateOpen, setPageCreateOpen] = useState(false);
  const [pageCreating, setPageCreating] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [street, setStreet] = useState(job.street);
  const [city, setCity] = useState(job.city);
  const [state, setState] = useState(job.state);
  const [postalCode, setPostalCode] = useState(job.postalCode);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState(job.code);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [closeoutBusy, setCloseoutBusy] = useState(false);
  const [ventOpen, setVentOpen] = useState(false);
  const [ventSession, setVentSession] = useState(0);

  const canTrash = canDeleteJobs(crm.viewer) && !crm.impersonatedStaff;
  const deleted = isDeletedJob(job);

  function setJobTab(next: JobTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
  }

  function promptJobEstimate() {
    if (!allowEstimates) return;
    startEstimate({
      jobId: job.id,
      opportunityId: job.opportunityId,
      contactId: job.primaryContactId,
      clientId: job.clientId,
    });
  }

  function openNew(kind: "estimate" | "invoice" | "interaction" | "expense" | "materials") {
    if (deleted) return;
    if (kind === "estimate") {
      if (!allowEstimates) return;
      if (showPaper) setJobTab("paper");
      promptJobEstimate();
      return;
    }
    if (kind === "materials") {
      if (showPaper) setJobTab("paper");
      void startMaterialOrder(job.id);
      return;
    }
    if (kind === "invoice") {
      if (!showFinancials) return;
      if (showPaper) setJobTab("paper");
      setInvoiceOpen(true);
      return;
    }
    if (kind === "expense") {
      if (!showFinancials) return;
      setJobTab("financials");
      setExpenseOpen(true);
      return;
    }
    setJobTab("overview");
    window.setTimeout(() => setActivityFocus((value) => value + 1), 50);
  }

  const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
  const claim = (crm.jobInsurance ?? []).find((item) => item.jobId === job.id);
  const claimMath = claim ? claimTotals(claim) : null;
  const client = crm.getClient(job.clientId);
  const primary = crm.getContact(job.primaryContactId);
  const photos = livePhotos(crm.photos, job.id);
  const reports = crm.photoReports.filter((report) => report.jobId === job.id);
  const openReport = reportId ? reports.find((report) => report.id === reportId) : undefined;
  const hero = primaryJobPhoto(crm.photos, job);
  const shownPhoto = hero ?? photos[0] ?? null;
  const address = jobAddress(job);
  const cityLine = [job.city, [job.state, job.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const jobFiles = (crm.jobFiles ?? []).filter((file) => file.jobId === job.id);
  const fileCount = jobFiles.length + reports.length;
  const jobEstimates = crm.estimates.filter((estimate) => estimate.jobId === job.id);
  const jobInvoices = crm.invoices.filter((invoice) => invoice.jobId === job.id);
  const jobMaterialOrders = (crm.materialOrders ?? []).filter((order) => order.jobId === job.id);
  const estimates = livePaper(jobEstimates);
  const invoices = livePaper(jobInvoices);
  const materialOrders = livePaper(jobMaterialOrders);
  const archivedEstimates = archivedPaper(jobEstimates);
  const archivedInvoices = archivedPaper(jobInvoices);
  const archivedMaterialOrders = archivedPaper(jobMaterialOrders);
  const archivedPaperCount = archivedEstimates.length + archivedInvoices.length + archivedMaterialOrders.length;
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
  const actor = crm.effectiveStaff;
  const canSendCloseout =
    !deleted &&
    Boolean(actor) &&
    canSubmitProjectCloseout({
      role: actor?.role,
      title: actor?.title,
      viewerName: actor?.name ?? "",
      viewerStaffId: actor?.id,
      projectManager: job.projectManager,
      ownerStaffId: job.ownerStaffId,
    }) &&
    (!closeout || closeout.status === "returned");
  const canEditCode = canReviewJobCodes(crm.effectiveStaff?.role);
  const codeReviewTask = tasks.find((task) => !task.completed && isJobCodeReviewTask(task));
  const codeReview = codeReviewTask ? parseJobCodeReviewNotes(codeReviewTask.notes) : null;
  const suggestedCode = codeReview
    ? codeReview.suggestedCode ||
      suggestedJobCode(
        job.projectManager || codeReview.toName,
        job.code,
        existingRecordCodes([...crm.jobs, ...crm.opportunities]),
      )
    : "";
  const tagSuggestions = useMemo(
    () => jobTagSuggestions(crm.jobs.map((item) => item.tags ?? [])),
    [crm.jobs],
  );
  const pmOptions = [
    ...crm.staff.filter((member) => !member.locked),
    ...(job.projectManager && !crm.staff.some((member) => member.name === job.projectManager)
      ? [{ id: `pm-${job.id}`, name: job.projectManager, locked: false }]
      : []),
  ];
  const books = showFinancials
    ? jobProfitAndLoss({
        job,
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        payments: crm.payments,
        expenses: crm.expenses,
        basis: "accrual",
      })
    : null;
  const soldFor = jobSoldAmount(job, crm.estimates, crm.estimateLines);
  const draftEstimateTotal = estimates
    .filter((estimate) => estimate.status === "draft")
    .reduce(
      (sum, estimate) => sum + amountForEstimate(estimate, crm.estimateLines, workMarket(job, opportunity)),
      0,
    );
  const featuredEstimate = featuredEstimateForJob(estimates);
  const nextTask = tasks
    .filter((task) => !task.completed)
    .slice()
    .sort((left, right) => (left.dueAt || "z").localeCompare(right.dueAt || "z"))[0];
  const pipelineColumn = workColumnFor(job, opportunity);
  const nextStepTitle = nextTask?.title.trim() || WORK_COLUMN_LABELS[pipelineColumn];
  const nextStepDetail = nextTask?.dueAt
    ? formatDate(nextTask.dueAt)
    : pipelineColumn === "lead"
      ? "No inspection date set"
      : "Due this week · no date set";
  const nextStepAction = nextTask ? "Open tasks" : pipelineColumn === "lead" ? "Set inspection" : "Set date";
  const hasWork = estimates.length + invoices.length + tasks.length + materialOrders.length > 0;
  const dateRange = formatJobRange(job.startDate, job.substantialCompletion);
  const homeownerName = primary?.name || client?.name || crm.customerName(job) || "Add a homeowner";
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

  async function startPage(template: PageTemplateId, photoLayout: PhotoPageLayout) {
    if (!allowPages) return;
    setPageCreating(true);
    try {
      const created = await crm.addPhotoReport(
        createPhotoReport({
          job,
          customer: crm.customerName(job),
          photos,
          author: crm.user.name,
          template,
          photoLayout,
          opportunity,
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

  function assignProjectManager(name: string) {
    const member = crm.staff.find((item) => item.name === name);
    patch({
      projectManager: name,
      ownerStaffId: member?.id || job.ownerStaffId,
      assigned: uniqueNames([name, ...(job.assigned ?? [])]),
    });
  }

  async function decideCode(decision: "redo" | "keep" | "change", code?: string) {
    setReviewBusy(true);
    try {
      const ok = await crm.decideJobCodeReview(job.id, decision, code);
      if (ok) setCodeOpen(false);
    } finally {
      setReviewBusy(false);
    }
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

  async function duplicateJob() {
    if (deleted || duplicating) return;
    setDuplicating(true);
    try {
      const created = await crm.addJob({
        name: job.name,
        opportunityId: null,
        clientId: job.clientId,
        primaryContactId: job.primaryContactId,
        status: job.status,
        contractValue: job.contractValue,
        startDate: job.startDate,
        substantialCompletion: job.substantialCompletion,
        superintendent: job.superintendent,
        projectManager: job.projectManager,
        location: job.location,
        description: job.description,
        tags: job.tags,
        street: job.street,
        city: job.city,
        state: job.state,
        postalCode: job.postalCode,
        lat: job.lat,
        lng: job.lng,
        salesRep: job.salesRep,
        assigned: job.assigned,
        subcontractorIds: job.subcontractorIds,
        relatedContactIds: job.relatedContactIds,
        customFields: job.customFields,
        projectType: job.projectType,
        leadSource: job.leadSource,
        market: job.market,
        trades: job.trades,
      });
      toast.success(`Duplicated as ${created.code}.`);
      router.replace(jobRecordHref(created.id), { scroll: false });
    } catch {
      // addJob already reports the failure.
    } finally {
      setDuplicating(false);
    }
  }

  const newMenu = !deleted ? (
    <DropdownMenu>
        <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            className="rounded-lg"
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
        {allowEstimates ? (
          <DropdownMenuItem onClick={() => openNew("estimate")}>New estimate</DropdownMenuItem>
        ) : null}
        {showFinancials ? (
          <DropdownMenuItem onClick={() => openNew("invoice")}>New invoice</DropdownMenuItem>
        ) : null}
        {showPaper ? (
          <>
            <DropdownMenuItem onClick={() => openNew("materials")}>New material order</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMaterialTemplateOpen(true)}>
              New material order from template
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuItem onClick={() => openNew("interaction")}>New interaction</DropdownMenuItem>
        {showFinancials ? (
          <DropdownMenuItem onClick={() => openNew("expense")}>New expense</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      <div className="shrink-0 px-4 pt-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {job.code ? (
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 font-mono text-xs"
                onClick={() => copyText(job.code, "Job code")}
              >
                {job.code}
                <Copy className="size-3 text-muted-foreground" />
              </button>
            ) : null}
            <Select
              value={pipelineColumn}
              disabled={deleted}
              onValueChange={(value) => {
                if (!value || deleted) return;
                const column = value as WorkColumn;
                if (column === pipelineColumn || column === "deleted") return;
                void crm.moveWork(job.id, column);
                toast.success("Pipeline status updated.");
              }}
              items={WORK_COLUMNS.filter((column) => column !== "deleted" || pipelineColumn === "deleted").map((column) => ({
                value: column,
                label: WORK_COLUMN_LABELS[column],
              }))}
            >
              <SelectTrigger className={cn(pillSelect, "bg-card", COLUMN_PILL[pipelineColumn])} aria-label="Pipeline status">
                <span className={cn("size-1.5 rounded-full", COLUMN_DOT[pipelineColumn])} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_COLUMNS.filter((column) => column !== "deleted" || pipelineColumn === "deleted").map((column) => (
                  <SelectItem key={column} value={column}>
                    {WORK_COLUMN_LABELS[column]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={job.market || "residential"}
              disabled={deleted}
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
              <SelectTrigger className={cn(pillSelect, "bg-card")} aria-label="Residential">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="residential">{JOB_MARKET_LABELS.residential}</SelectItem>
                <SelectItem value="commercial">{JOB_MARKET_LABELS.commercial}</SelectItem>
              </SelectContent>
            </Select>
            <TradesMenu
              value={job.trades}
              disabled={deleted}
              emptyLabel="Add trades"
              separator=" · "
              onChange={(trades) => patch({ trades })}
            />
          </div>
          <div className="flex items-center gap-1">
            {onToggleExpand ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onToggleExpand}
                aria-label={expanded ? "Shrink job window" : "Expand job window"}
              >
                {expanded ? <Minimize2 /> : <Maximize2 />}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="More job actions" />}>
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                {job.code ? (
                  <DropdownMenuItem onClick={() => copyText(job.code, "Job code")}>Copy job code</DropdownMenuItem>
                ) : null}
                {canEditCode && !deleted ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setCodeDraft(suggestedCode || job.code);
                      setCodeOpen(true);
                    }}
                  >
                    Change code
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            {onClose ? (
              <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
                <XIcon />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 id="job-window-title" className="font-heading text-[1.65rem] leading-tight font-medium text-balance">
              {job.name}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {cityLine || address || "Add a job-site address"}
              </span>
              {job.projectManager ? (
                <span className="inline-flex items-center gap-1">
                  <User className="size-3.5" />
                  PM {job.projectManager}
                </span>
              ) : null}
              {dateRange ? (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5" />
                  {dateRange}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {primary?.phone ? (
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                className="rounded-lg bg-card"
                render={<Link href={`/messages?job=${job.id}&contact=${primary.id}`} />}
              >
                <MessageSquare data-icon="inline-start" />
                Text
              </Button>
            ) : null}
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              className="rounded-lg bg-card"
              render={<Link href={mailHref({ job: job.id, contact: primary?.id })} />}
            >
              <Mail data-icon="inline-start" />
              Mail
            </Button>
            {canSendCloseout ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg bg-card"
                disabled={closeoutBusy}
                onClick={() => {
                  if (closeout && closeoutHasVentRecord(closeout)) {
                    setCloseoutBusy(true);
                    void crm
                      .submitCommissionCloseout(job.id)
                      .then((saved) => {
                        if (saved) setJobTab("closeout");
                      })
                      .finally(() => setCloseoutBusy(false));
                    return;
                  }
                  setVentSession((value) => value + 1);
                  setVentOpen(true);
                }}
              >
                <Send data-icon="inline-start" />
                {closeout?.status === "returned" ? "Send again for closeout" : "Send for closeout"}
              </Button>
            ) : null}
            {newMenu}
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (typeof value === "string") setJobTab(parseJobTab(value));
        }}
        className="min-h-0 flex-1"
      >
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b px-4 sm:px-5">
          <TabsList variant="line" className="h-auto justify-start gap-4 overflow-visible rounded-none bg-transparent px-0 pt-3 pb-0">
            <TabsTrigger value="overview" className="flex-none px-0 after:bg-primary">Overview</TabsTrigger>
            <TabsTrigger value="photos" className="flex-none px-0 after:bg-primary">
              Photos
              <span className="text-primary tabular-nums">{photos.length}</span>
            </TabsTrigger>
            <TabsTrigger value="files" className="flex-none px-0 after:bg-primary">
              Files
              <span className="text-primary tabular-nums">{fileCount}</span>
            </TabsTrigger>
            {showPaper ? (
              <TabsTrigger value="paper" className="flex-none px-0 after:bg-primary">
                Paper
                <span className="text-primary tabular-nums">{estimates.length + invoices.length}</span>
              </TabsTrigger>
            ) : null}
            {showInsurance ? (
              <TabsTrigger value="insurance" className="flex-none px-0 after:bg-primary">
                Insurance
                {claimMath?.openCount ? (
                  <span className="text-primary tabular-nums">{claimMath.openCount}</span>
                ) : null}
              </TabsTrigger>
            ) : null}
            {showFinancials ? (
              <TabsTrigger value="financials" className="flex-none px-0 after:bg-primary">Financials</TabsTrigger>
            ) : null}
            {showCloseout ? (
              <TabsTrigger value="closeout" className="flex-none px-0 after:bg-primary">
                Closeout
              </TabsTrigger>
            ) : null}
          </TabsList>
          <p className="shrink-0 pb-2 text-sm tabular-nums">
            {showFinancials && books ? (
              <>
                <span className="font-medium">{formatCurrencyFull(books.invoiced)}</span>
                <span className="text-muted-foreground"> invoiced</span>
                <span className="mx-2 text-muted-foreground"> </span>
                <span className="font-medium text-primary">{formatCurrencyFull(draftEstimateTotal)}</span>
                <span className="text-muted-foreground"> est. draft</span>
              </>
            ) : (
              <>
                <span className="font-medium">{soldFor > 0 ? formatCurrencyFull(soldFor) : "Not sold"}</span>
                <span className="text-muted-foreground">{soldFor > 0 ? " sold" : ""}</span>
              </>
            )}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {deleted ? (
            <div className="mx-4 mt-4 rounded-[12px] border bg-muted/60 px-4 py-3 sm:mx-5">
              <p className="text-sm font-medium">This job is in Deleted.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {job.deletedBy ? `${job.deletedBy} removed it` : "Removed"}
                {job.deletedAt ? ` ${formatDate(job.deletedAt)}` : ""}.
                {job.deletedReason ? ` Reason: ${job.deletedReason}` : ""}
              </p>
            </div>
          ) : null}

          {codeReview && canEditCode && !deleted ? (
            <div className="mx-4 mt-4 rounded-[12px] border bg-primary/8 px-4 py-3 sm:mx-5">
              <p className="text-sm font-medium">
                {job.projectManager || codeReview.toName || "A new project manager"} now owns this job.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Redo {job.code} as {suggestedCode} from their initials, keep the current code, or type a new one.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" disabled={reviewBusy} onClick={() => void decideCode("redo", suggestedCode)}>
                  {reviewBusy ? "Saving…" : `Redo as ${suggestedCode}`}
                </Button>
                <Button size="sm" variant="outline" disabled={reviewBusy} onClick={() => void decideCode("keep")}>
                  Keep {job.code}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reviewBusy}
                  onClick={() => {
                    setCodeDraft(suggestedCode || job.code);
                    setCodeOpen(true);
                  }}
                >
                  Change
                </Button>
              </div>
            </div>
          ) : null}

          {showFinancials && returnedDocs.length > 0 ? (
            <div className="mx-4 mt-4 rounded-[12px] border bg-primary/8 px-4 py-3 sm:mx-5">
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

          <div className="grid gap-6 px-4 py-5 sm:px-5 lg:grid-cols-[17.75rem_minmax(0,1fr)] lg:items-start">
            <aside className="min-w-0 space-y-4">
              <section>
                <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  Homeowner
                </p>
                <div className="flex items-center gap-3 rounded-[12px] border bg-card p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-medium text-rose-700">
                    {personInitials(homeownerName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={primary ? `/contacts?contact=${primary.id}` : client ? `/clients/${client.id}` : "/contacts"}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {homeownerName}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {primary?.phone ? formatPhone(primary.phone) : "No phone"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {primary?.phone ? (
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="bg-card"
                        nativeButton={false}
                        render={<a href={`tel:${primary.phone}`} />}
                        aria-label={`Call ${primary.name}`}
                      >
                        <Phone />
                      </Button>
                    ) : null}
                    {primary?.phone ? (
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="bg-card"
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

              <div className="relative overflow-hidden rounded-[12px] border bg-muted">
                {shownPhoto ? (
                  <button type="button" onClick={() => setPhotoViewOpen(true)} className="block w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={shownPhoto.imageUrl}
                      alt={shownPhoto.caption || job.name}
                      className="aspect-[16/10] w-full object-cover"
                    />
                  </button>
                ) : managePhotos && !deleted ? (
                  <button
                    type="button"
                    onClick={() => setPhotoOpen(true)}
                    className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 text-muted-foreground"
                  >
                    <ImageIcon className="size-8" />
                    <span className="text-sm">Add a job-site photo</span>
                  </button>
                ) : (
                  <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ImageIcon className="size-8" />
                    <span className="text-sm">No job-site photo yet</span>
                  </div>
                )}
                {shownPhoto && job.primaryPhotoId === shownPhoto.id ? (
                  <span className="absolute top-2 left-2 rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                    Primary
                  </span>
                ) : null}
                {photos.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setJobTab("photos")}
                    className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-lg bg-card px-2 py-1 text-xs font-medium shadow-sm"
                  >
                    <ImageIcon className="size-3.5" />
                    All {photos.length} photo{photos.length === 1 ? "" : "s"}
                  </button>
                ) : null}
              </div>

              <div className="divide-y rounded-[12px] border bg-card px-3">
                <DetailRow label="Lead source">
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
                <DetailRow label="Project manager">
                  <Select
                    value={job.projectManager || undefined}
                    disabled={deleted}
                    onValueChange={(value) => {
                      if (value) assignProjectManager(value);
                    }}
                    items={pmOptions.map((member) => ({
                      value: member.name,
                      label: member.name,
                    }))}
                  >
                    <SelectTrigger className={cn(quietSelect, !job.projectManager && "text-muted-foreground")}>
                      <SelectValue placeholder="Assign a project manager" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {pmOptions.map((member) => (
                        <SelectItem key={member.id} value={member.name}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DetailRow>
                <DetailRow label="Start">
                  <label className="relative inline-flex cursor-pointer items-center justify-end gap-1">
                    <span className={job.startDate ? "" : "text-muted-foreground"}>
                      {job.startDate ? formatDate(job.startDate) : "Set date"}
                    </span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                    <input
                      type="date"
                      aria-label="Start date"
                      value={job.startDate?.slice(0, 10) ?? ""}
                      onChange={(event) => patch({ startDate: event.target.value })}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                </DetailRow>
                <DetailRow label="End">
                  <label className="relative inline-flex cursor-pointer items-center justify-end gap-1">
                    <span className={job.substantialCompletion ? "" : "text-muted-foreground"}>
                      {job.substantialCompletion ? formatDate(job.substantialCompletion) : "Set date"}
                    </span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                    <input
                      type="date"
                      aria-label="End date"
                      value={job.substantialCompletion?.slice(0, 10) ?? ""}
                      onChange={(event) => patch({ substantialCompletion: event.target.value || null })}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                </DetailRow>
                <DetailRow label="Assigned">
                  <PeopleChips
                    names={job.assigned ?? []}
                    options={crm.teamMembers}
                    empty="Add crew"
                    onRemove={(name) => patch(assignedCrewPatch(job.assigned.filter((item) => item !== name), crm.staff))}
                    onAdd={(name) => patch(assignedCrewPatch([...job.assigned, name], crm.staff))}
                  />
                </DetailRow>
                <DetailRow label="Tags">
                  <JobTagField
                    tags={job.tags ?? []}
                    suggestions={tagSuggestions}
                    onChange={(tags) => crm.updateJob(job.id, { tags })}
                  />
                </DetailRow>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-card"
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
                  className="bg-card"
                  disabled={deleted || duplicating}
                  onClick={() => void duplicateJob()}
                >
                  <Copy data-icon="inline-start" />
                  {duplicating ? "Copying…" : "Duplicate"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-card"
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
                <div>
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
                      Delete job
                    </Button>
                  )}
                </div>
              ) : null}
            </aside>

            <div className="min-w-0">
        <TabsContent value="overview" className="mt-0">
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              eyebrow="Estimate"
              title={
                featuredEstimate
                  ? formatCurrencyFull(
                      amountForEstimate(featuredEstimate, crm.estimateLines, workMarket(job, opportunity)),
                    )
                  : "No estimate yet"
              }
              detail={
                featuredEstimate
                  ? `${featuredEstimate.number} · ${ESTIMATE_STATUS_LABELS[featuredEstimate.status].toLowerCase()}, ${
                      hasEstimateSignature(featuredEstimate)
                        ? `signed by ${featuredEstimate.signatureName}`
                        : featuredEstimate.status === "declined"
                          ? "declined"
                          : "not yet signed"
                    }`
                  : "Build one from a measurement report or by hand."
              }
              action={featuredEstimate ? "Open estimate" : allowEstimates && !deleted ? "Create estimate" : undefined}
              href={featuredEstimate ? `/estimates/${featuredEstimate.id}` : undefined}
              onClick={featuredEstimate || deleted || !allowEstimates ? undefined : promptJobEstimate}
            />
            <SummaryCard
              eyebrow="Files"
              title={fileCount > 0 ? `${fileCount} uploaded` : "No files yet"}
              detail={
                latestPage?.title ||
                jobFiles[0]?.name ||
                (featuredEstimate
                  ? "Measurements, reports and uploads."
                  : "Photo reports and job files land here.")
              }
              action={featuredEstimate || fileCount > 0 ? "Go to files" : "Upload"}
              onClick={() => setJobTab("files")}
            />
            {showInsurance ? (
              <SummaryCard
                eyebrow="Insurance"
                title={claim?.carrier || "No claim yet"}
                detail={
                  claim && claimMath
                    ? [
                        claim.claimNumber || "No claim number",
                        claim.adjusterName || null,
                        claimMath.openCount
                          ? `${claimMath.openCount} supplement${claimMath.openCount === 1 ? "" : "s"} open`
                          : null,
                        showFinancials ? `${formatCurrencyFull(claimMath.outstanding)} still to collect` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "Carrier, supplements and checks."
                }
                action={claim ? "Open claim" : featuredEstimate ? "Start the claim" : "Add claim"}
                onClick={() => setJobTab("insurance")}
              />
            ) : null}
            <SummaryCard
              eyebrow="Next step"
              title={nextStepTitle}
              detail={nextStepDetail}
              action={deleted ? undefined : nextStepAction}
              onClick={
                deleted
                  ? undefined
                  : () => {
                      if (nextTask && showPaper && !hasWork) setJobTab("paper");
                      else setTaskOpen(true);
                    }
              }
            />
          </div>

          {showPaper && hasWork ? (
            <section className="mb-6 overflow-hidden rounded-[12px] border bg-card">
              <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">Work on this job</p>
              </div>
              <WorkRow
                label={estimates.length ? `Estimates ${estimates.length}` : "Estimates"}
                action={
                  allowEstimates && !deleted ? (
                    <Button type="button" size="sm" variant="outline" className="bg-card" onClick={promptJobEstimate}>
                      <Plus data-icon="inline-start" />
                      New
                    </Button>
                  ) : null
                }
              >
                {estimates.length === 0 ? (
                  <span className="text-muted-foreground">No estimates yet.</span>
                ) : (
                  <ul className="space-y-2">
                    {estimates.map((estimate) => (
                      <li key={estimate.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link href={`/estimates/${estimate.id}`} className="font-medium hover:underline">
                          {estimate.number}
                        </Link>
                        <EstimateStatusBadge status={estimate.status} />
                        <span className="text-muted-foreground">
                          {hasEstimateSignature(estimate)
                            ? `Signed by ${estimate.signatureName}`
                            : estimate.status === "declined"
                              ? "Declined"
                              : "Open to collect a signature"}
                        </span>
                        <span className="ml-auto tabular-nums">
                          {formatCurrencyFull(
                            amountForEstimate(estimate, crm.estimateLines, workMarket(job, opportunity)),
                          )}
                        </span>
                        {!deleted ? (
                          <PaperArchiveButton
                            compact
                            archivedAt={estimate.archivedAt}
                            label={estimate.number}
                            onChange={(archivedAt) => crm.updateEstimate(estimate.id, { archivedAt })}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </WorkRow>
              {showFinancials ? (
                <WorkRow
                  label="Invoices"
                  action={
                    deleted ? null : (
                      <Button type="button" size="sm" variant="outline" className="bg-card" onClick={() => setInvoiceOpen(true)}>
                        <Plus data-icon="inline-start" />
                        New
                      </Button>
                    )
                  }
                >
                  {invoices.length === 0 ? (
                    <span className="text-muted-foreground">No invoices on this job.</span>
                  ) : (
                    <ul className="space-y-2">
                      {invoices.map((invoice) => (
                        <li key={invoice.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <button
                            type="button"
                            className="font-medium hover:underline"
                            onClick={() => router.replace(jobDocumentHref(job.id, "invoice", invoice.id), { scroll: false })}
                          >
                            {invoice.number}
                          </button>
                          <InvoiceStatusBadge status={derivedInvoiceStatus(invoice, crm.invoiceLines, crm.payments)} />
                          <span className="ml-auto tabular-nums text-muted-foreground">
                            {formatCurrencyFull(invoiceBalance(invoice.id, crm.invoiceLines, crm.payments))} due
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </WorkRow>
              ) : null}
              <WorkRow
                label="Tasks"
                action={
                  deleted ? null : (
                    <Button type="button" size="sm" variant="outline" className="bg-card" onClick={() => setTaskOpen(true)}>
                      <Plus data-icon="inline-start" />
                      New
                    </Button>
                  )
                }
              >
                {tasks.length === 0 ? (
                  <span className="text-muted-foreground">No tasks on this job yet.</span>
                ) : (
                  <ul className="divide-y overflow-hidden rounded-lg border">
                    {tasks.map((task) => (
                      <TaskRow key={task.id} task={task} onToggle={() => void crm.toggleTask(task.id)} />
                    ))}
                  </ul>
                )}
              </WorkRow>
              <WorkRow
                label="Material orders"
                action={
                  deleted ? null : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="bg-card"
                        disabled={materialPending}
                        onClick={() => setMaterialTemplateOpen(true)}
                      >
                        From template
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="bg-card"
                        disabled={materialPending}
                        onClick={() => void startMaterialOrder(job.id)}
                      >
                        <Plus data-icon="inline-start" />
                        New
                      </Button>
                    </>
                  )
                }
              >
                {materialOrders.length === 0 ? (
                  <span className="text-muted-foreground">
                    None yet. Build one from the price book — it does not follow the estimate.
                  </span>
                ) : (
                  <ul className="space-y-2">
                    {materialOrders.map((order) => {
                      const lines = materialOrderLinesFor(order.id, crm.materialOrderLines ?? []);
                      return (
                        <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <Link href={`/material-orders/${order.id}`} className="font-medium hover:underline">
                            {order.number}
                          </Link>
                          <span className="text-muted-foreground">{order.vendor.trim() || "No supplier yet"}</span>
                          {showFinancials ? (
                            <span className="ml-auto tabular-nums text-muted-foreground">
                              {formatCurrencyFull(materialOrderTotal(lines))} est.
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </WorkRow>
            </section>
          ) : null}

          {!hasWork ? (
          <>
          <section className="mb-2">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Description
            </p>
            <Textarea
              defaultValue={job.description}
              placeholder="Scope, roof type, damage notes..."
              rows={3}
              className="rounded-[12px] bg-card"
              onBlur={(event) => {
                if (event.target.value !== job.description) {
                  patch({ description: event.target.value });
                }
              }}
            />
          </section>

          <JobSection
            title="Related contacts"
            meta={related.length || undefined}
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
                          {formatPhone(contact.phone)}
                        </a>
                        <button type="button" onClick={() => copyText(formatPhone(contact.phone), "Phone")} aria-label="Copy phone">
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

          {showTraining ? (
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
          ) : null}
          </>
          ) : null}

          <section className="pt-2" id="job-activity">
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
            <ActivityComposer entityType="job" entityId={job.id} focusRequest={activityFocus} tone="record" />
            <ActivityList
              items={activities}
              tone="record"
              empty="No field notes yet. Log a call, text, or what the crew needs to see."
            />
            <AutomationRuns jobId={job.id} variant="activity" />
          </section>
        </TabsContent>

        <TabsContent value="photos" className="mt-0">
          <JobCompanyCamPanel
            jobId={job.id}
            disabled={deleted}
            mappingLocked={!allowCompanyCamMap}
          />
          <JobPhotosPanel
            jobId={job.id}
            disabled={deleted || !managePhotos}
            onAddPhoto={() => {
              if (managePhotos) setPhotoOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="files" className="mt-0 space-y-4">
          <section className="overflow-hidden rounded-[12px] border bg-card">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-medium">Roof measurements</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Measured lengths save on the job and feed the estimate.
              </p>
            </div>
            <RoofMeasureEntry jobId={job.id} disabled={deleted} embedded />
            <JobEagleviewPanel jobId={job.id} disabled={deleted} embedded />
          </section>
          <JobFilesPanel jobId={job.id} disabled={deleted} />
          {showFinancials ? (
          <section className="rounded-[12px] border bg-card p-4">
            <div className="mb-3">
              <p className="text-sm font-medium">Invoices, receipts and payments</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Open a file to see comments from accounting. Reply there, not on Approve.
              </p>
            </div>
            {financialDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing from accounting on this job yet.</p>
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
                        className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted/50"
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{itemTitle(item)}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {itemKindLabel(item.kind, item)}
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
          ) : null}
          <section className="rounded-[12px] border bg-card p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">Pages you send out</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Branded job documents. Share a link or download a PDF.
                </p>
              </div>
              {allowPages && !deleted ? (
                <Button size="sm" onClick={() => setPageCreateOpen(true)}>
                  <Plus data-icon="inline-start" />
                  New page
                </Button>
              ) : null}
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
              <div>
                <p className="text-sm text-muted-foreground">
                  {allowPages ? "No pages yet. Start from a template:" : "No pages on this job yet."}
                </p>
                {allowPages && !deleted ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {QUICK_PAGE_TEMPLATES.map((template) => (
                      <Button
                        key={template.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full bg-card"
                        disabled={pageCreating}
                        onClick={() => void startPage(template.id, "four")}
                      >
                        {template.title}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </TabsContent>

        {showInsurance ? (
          <TabsContent value="insurance" className="mt-0">
            <JobInsurancePanel job={job} readOnly={deleted} />
          </TabsContent>
        ) : null}

        {showFinancials ? (
          <TabsContent value="financials" className="mt-0">
            <JobFinancials job={job} />
          </TabsContent>
        ) : null}

        {showCloseout ? (
          <TabsContent value="closeout" className="mt-0">
            <JobCloseout job={job} />
          </TabsContent>
        ) : null}

        {showPaper ? (
        <TabsContent value="paper" className="mt-0 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Tasks</p>
              {deleted ? null : (
                <Button size="sm" variant="ghost" onClick={() => setTaskOpen(true)}>
                  New
                </Button>
              )}
            </div>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks on this job yet.</p>
            ) : (
              <ul className="divide-y divide-[#e5e5e5] overflow-hidden rounded-sm border border-[#c9c9c9] bg-white">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => void crm.toggleTask(task.id)}
                  />
                ))}
              </ul>
            )}
          </div>
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
              deleted ? (
                <p className="text-sm text-muted-foreground">No estimates tied to this job.</p>
              ) : (
                <button
                  type="button"
                  className="text-left text-sm text-muted-foreground hover:underline"
                  onClick={promptJobEstimate}
                >
                  No estimates yet. Click to create one.
                </button>
              )
            ) : (
              <ul className="space-y-2">
                {estimates.map((estimate) => (
                  <li key={estimate.id}>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/estimates/${estimate.id}`} className="text-sm font-medium hover:underline">
                        {estimate.number}
                      </Link>
                      {!deleted ? (
                        <PaperArchiveButton
                          compact
                          archivedAt={estimate.archivedAt}
                          label={estimate.number}
                          onChange={(archivedAt) => crm.updateEstimate(estimate.id, { archivedAt })}
                        />
                      ) : null}
                    </div>
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
          {showFinancials ? (
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
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          router.replace(jobDocumentHref(job.id, "invoice", invoice.id), { scroll: false })
                        }
                        className="text-sm font-medium hover:underline"
                      >
                        {invoice.number}
                      </button>
                      {!deleted ? (
                        <PaperArchiveButton
                          compact
                          archivedAt={invoice.archivedAt}
                          label={invoice.number}
                          onChange={(archivedAt) => crm.updateInvoice(invoice.id, { archivedAt })}
                        />
                      ) : null}
                    </div>
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
          ) : null}
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
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/material-orders/${order.id}`} className="text-sm font-medium hover:underline">
                          {order.number}
                        </Link>
                        {!deleted ? (
                          <PaperArchiveButton
                            compact
                            archivedAt={order.archivedAt}
                            label={order.number}
                            onChange={(archivedAt) => crm.updateMaterialOrder(order.id, { archivedAt })}
                          />
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {order.vendor.trim() || "No supplier yet"}
                        </span>
                        {showFinancials ? (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatCurrencyFull(materialOrderTotal(lines))} est.
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {archivedPaperCount > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] uppercase">Archived</p>
              <ul className="space-y-2">
                {archivedEstimates.map((estimate) => (
                  <li key={estimate.id} className="flex items-center justify-between gap-2">
                    <Link href={`/estimates/${estimate.id}`} className="text-sm text-muted-foreground hover:underline">
                      {estimate.number}
                    </Link>
                    {!deleted ? (
                      <PaperArchiveButton
                        compact
                        archivedAt={estimate.archivedAt}
                        label={estimate.number}
                        onChange={(archivedAt) => crm.updateEstimate(estimate.id, { archivedAt })}
                      />
                    ) : null}
                  </li>
                ))}
                {archivedInvoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-2">
                    <Link href={`/invoices/${invoice.id}`} className="text-sm text-muted-foreground hover:underline">
                      {invoice.number}
                    </Link>
                    {!deleted ? (
                      <PaperArchiveButton
                        compact
                        archivedAt={invoice.archivedAt}
                        label={invoice.number}
                        onChange={(archivedAt) => crm.updateInvoice(invoice.id, { archivedAt })}
                      />
                    ) : null}
                  </li>
                ))}
                {archivedMaterialOrders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-2">
                    <Link href={`/material-orders/${order.id}`} className="text-sm text-muted-foreground hover:underline">
                      {order.number}
                    </Link>
                    {!deleted ? (
                      <PaperArchiveButton
                        compact
                        archivedAt={order.archivedAt}
                        label={order.number}
                        onChange={(archivedAt) => crm.updateMaterialOrder(order.id, { archivedAt })}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </TabsContent>
        ) : null}

            </div>
          </div>
        </div>
      </Tabs>

      <Dialog open={addressOpen} onOpenChange={setAddressOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Job site</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="job-street">Street</Label>
              <AddressStreetField
                id="job-street"
                street={street}
                city={city}
                state={state}
                onStreetChange={setStreet}
                onPick={(address) => {
                  setStreet(address.street);
                  setCity(address.city);
                  setState(address.state || state);
                  setPostalCode(address.postalCode);
                }}
              />
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

      <CloseoutVentDialog
        key={ventSession}
        jobId={job.id}
        open={ventOpen}
        busy={closeoutBusy}
        onOpenChange={setVentOpen}
        onSubmit={(vents) => {
          setCloseoutBusy(true);
          void crm
            .submitCommissionCloseout(job.id, "", vents)
            .then((saved) => {
              if (!saved) return;
              setVentOpen(false);
              setJobTab("closeout");
            })
            .finally(() => setCloseoutBusy(false));
        }}
      />
      <AddPhotoDialog open={photoOpen} onOpenChange={setPhotoOpen} jobId={job.id} />
      <PhotoViewer
        photo={shownPhoto}
        open={photoViewOpen && Boolean(shownPhoto)}
        onOpenChange={setPhotoViewOpen}
        title={shownPhoto?.caption || job.name}
        description={
          shownPhoto
            ? shownPhoto.createdBy?.trim()
              ? `Taken by ${shownPhoto.createdBy.trim()} · ${formatDate(shownPhoto.takenAt)}`
              : formatDate(shownPhoto.takenAt)
            : undefined
        }
      />
      <CreatePageDialog
        open={pageCreateOpen}
        onOpenChange={setPageCreateOpen}
        pending={pageCreating}
        onCreate={(template, photoLayout) => void startPage(template, photoLayout)}
      />
      <CreateInvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        defaultClientId={job.clientId}
        defaultJobId={job.id}
        onCreated={() => setJobTab("paper")}
      />
      <LogExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} defaultJobId={job.id} />
      <CreateTaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        defaultRelatedType="job"
        defaultRelatedId={job.id}
        lockRelated
      />
      <MaterialOrderFromTemplateDialog
        jobId={job.id}
        open={materialTemplateOpen}
        onOpenChange={setMaterialTemplateOpen}
      />
      <StartEstimateDialogHost flow={startEstimateFlow} />
      {openReport ? (
        <PhotoReportBuilder
          job={job}
          report={openReport}
          readOnly={!editPages || deleted}
          onClose={() => setReportId(null)}
        />
      ) : null}
      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change job code</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="job-code-draft">Job code</Label>
            <Input
              id="job-code-draft"
              value={codeDraft}
              onChange={(event) => setCodeDraft(event.target.value)}
              placeholder={suggestedCode || job.code}
            />
            {suggestedCode ? (
              <p className="text-xs text-muted-foreground">
                Suggested from {job.projectManager || "the project manager"}: {suggestedCode}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Codes use the assigned project manager&apos;s initials and the original date stamp.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCodeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={reviewBusy || !codeDraft.trim()}
              onClick={() => void decideCode("change", codeDraft)}
            >
              {reviewBusy ? "Saving…" : "Save code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteJobDialog job={job} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
