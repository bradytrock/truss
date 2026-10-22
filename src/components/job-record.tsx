"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  ImageIcon,
  Mail,
  MapPin,
  Maximize2,
  MessageSquare,
  Minimize2,
  MoreHorizontal,
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
import { daysUntil, formatCurrencyFull, formatDate, formatInboxTime, formatPhone, initials } from "@/lib/format";
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
import { projectTypeForMarket, workMarket } from "@/lib/market";
import { WORK_COLUMNS, WORK_COLUMN_LABELS, workColumnFor, type WorkColumn } from "@/lib/work-board";
import { COURSE } from "@/lib/training/engine";
import { recommendedChapterIds } from "@/lib/training/recommend";
import {
  ESTIMATE_STATUS_LABELS,
  JOB_MARKET_LABELS,
  isShelvedStage,
  type Contact,
  type Job,
  type JobStatus,
  type LeadSource,
  type PageTemplateId,
  type PhotoPageLayout,
  type PipelineStage,
  type Task,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { PhotoReportBuilder } from "@/components/photo-report-builder";
import { canSubmitProjectCloseout } from "@/lib/commission-closeout";
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

const JOB_TABS = ["overview", "photos", "files", "insurance", "financials", "paper"] as const;
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

const recordPanel =
  "rounded-[14px] border border-[#e6e3de] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)] dark:border-border dark:bg-card";

const quietSelect =
  "h-auto w-full justify-end gap-1 border-0 bg-transparent p-0 text-sm font-medium shadow-none hover:bg-transparent dark:bg-transparent [&_svg]:size-3.5";

const headerPill =
  "h-8 w-auto max-w-56 gap-1 rounded-full border border-[#e4e1dc] bg-white px-3 text-xs font-medium shadow-none dark:border-border dark:bg-card [&_svg]:size-3.5";

const outlineAction =
  "h-8 rounded-[10px] border-[#e4e1dc] bg-white px-3 shadow-none hover:bg-[#faf9f7] dark:border-border dark:bg-card dark:hover:bg-muted";

const STATUS_PILL: Record<WorkColumn, string> = {
  lead: "border-[#e4e1dc] bg-white text-foreground",
  proposal_sent: "border-transparent bg-[#f8efd8] text-foreground",
  supplementing: "border-transparent bg-[#e7eefc] text-foreground",
  in_progress: "border-transparent bg-[#e5f5ea] text-foreground",
  punch: "border-transparent bg-[#fdecdc] text-foreground",
  complete: "border-transparent bg-[#e7f6ee] text-foreground",
  on_hold: "border-transparent bg-[#f3f1ee] text-foreground",
  unqualified: "border-transparent bg-[#fde8e8] text-foreground",
  lost: "border-transparent bg-[#fde8e8] text-foreground",
  deleted: "border-transparent bg-[#f3f1ee] text-muted-foreground",
};

const STATUS_DOT: Record<WorkColumn, string> = {
  lead: "bg-[#8a847c]",
  proposal_sent: "bg-[#c2880a]",
  supplementing: "bg-[#3b6fe0]",
  in_progress: "bg-[#16a34a]",
  punch: "bg-[#ea580c]",
  complete: "bg-[#15803d]",
  on_hold: "bg-[#8a847c]",
  unqualified: "bg-[#dc2626]",
  lost: "bg-[#dc2626]",
  deleted: "bg-[#8a847c]",
};

function formatJobSpan(start?: string | null, end?: string | null) {
  const startDay = start?.slice(0, 10) ?? "";
  const endDay = end?.slice(0, 10) ?? "";
  if (!startDay && !endDay) return "";
  if (!startDay) return formatDate(endDay);
  if (!endDay || endDay === startDay) return formatDate(startDay);
  const startDate = new Date(`${startDay}T12:00:00`);
  const endDate = new Date(`${endDay}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${formatDate(startDay)} – ${formatDate(endDay)}`;
  }
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();
  if (sameMonth) {
    const month = startDate.toLocaleDateString("en-US", { month: "short" });
    return `${month} ${startDate.getDate()} – ${endDate.getDate()}, ${startDate.getFullYear()}`;
  }
  if (sameYear) {
    const left = startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const right = endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${left} – ${right}, ${startDate.getFullYear()}`;
  }
  return `${formatDate(startDay)} – ${formatDate(endDay)}`;
}

function nextStepDetail(dueAt?: string | null) {
  if (!dueAt) return "Due this week · no date set";
  const days = daysUntil(dueAt);
  if (days === null) return "Due this week · no date set";
  if (days < 0) return `Overdue · ${formatDate(dueAt)}`;
  if (days === 0) return "Due today";
  if (days <= 7) return `Due this week · ${formatDate(dueAt)}`;
  return `Due ${formatDate(dueAt)}`;
}

function stageForCopy(column: WorkColumn): PipelineStage {
  if (column === "proposal_sent") return "bid_submitted";
  if (column === "supplementing") return "supplementing";
  if (column === "in_progress" || column === "punch" || column === "complete" || column === "on_hold") {
    return "awarded";
  }
  return "pursuing";
}

function statusForCopy(column: WorkColumn): JobStatus {
  if (column === "punch") return "punch";
  if (column === "complete") return "complete";
  if (column === "on_hold") return "on_hold";
  if (column === "in_progress") return "in_progress";
  return "precon";
}

function JobSection({
  title,
  count,
  defaultOpen = true,
  actions,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={recordPanel}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span className="text-sm font-medium">{title}</span>
        </button>
        {open ? actions : null}
        {typeof count === "number" ? (
          <span className="text-sm tabular-nums text-muted-foreground">{count}</span>
        ) : null}
      </div>
      {open ? <div className="border-t border-[#eeeae6] px-4 py-3 dark:border-border">{children}</div> : null}
    </section>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7.75rem_minmax(0,1fr)] items-center gap-3 border-b border-[#eeeae6] py-2.5 last:border-b-0 dark:border-border">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="min-w-0 text-right text-sm">{children}</div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  disabled,
  empty = "Set date",
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
  empty?: string;
}) {
  const day = value?.slice(0, 10) ?? "";
  return (
    <label className="relative inline-flex cursor-pointer items-center justify-end gap-1 text-sm">
      <span className={day ? "font-medium text-foreground" : "text-muted-foreground"}>
        {day ? formatDate(day) : empty}
      </span>
      <ChevronDown className="size-3.5 text-muted-foreground" />
      <input
        type="date"
        value={day}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        aria-label={label}
      />
    </label>
  );
}

function SummaryCard({
  eyebrow,
  title,
  body,
  action,
  href,
  onClick,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: string;
  href?: string;
  onClick?: () => void;
}) {
  const linkClass = "mt-auto pt-3 text-left text-sm font-medium text-primary hover:underline";
  return (
    <div className={cn(recordPanel, "flex min-h-[148px] flex-col p-4")}>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-snug text-muted-foreground">{body}</p>
      {action && href ? (
        <Link href={href} className={linkClass}>
          {action} →
        </Link>
      ) : null}
      {action && !href && onClick ? (
        <button type="button" onClick={onClick} className={linkClass}>
          {action} →
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
        <Badge key={name} variant="secondary" className="h-6 gap-1 rounded-full bg-[#f1efec] px-2 font-normal text-foreground dark:bg-muted">
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
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-xs"
                className="size-6 rounded-full border-[#e4e1dc] bg-white dark:border-border dark:bg-card"
                aria-label="Add assignee"
              />
            }
          >
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
  expanded = false,
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
  const requestedTab = parseJobTab(searchParams.get("tab"));
  const tab =
    (requestedTab === "financials" && !showFinancials) ||
    (requestedTab === "paper" && !showPaper) ||
    (requestedTab === "insurance" && !showInsurance)
      ? "overview"
      : requestedTab;
  const [photoOffset, setPhotoOffset] = useState(0);
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
  const [tagDraft, setTagDraft] = useState("");
  const [street, setStreet] = useState(job.street);
  const [city, setCity] = useState(job.city);
  const [state, setState] = useState(job.state);
  const [postalCode, setPostalCode] = useState(job.postalCode);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [filePicker, setFilePicker] = useState(0);
  const [taskDraft, setTaskDraft] = useState<Task | null>(null);
  const [taskTitleDefault, setTaskTitleDefault] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState(job.code);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [closeoutBusy, setCloseoutBusy] = useState(false);

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
  const closeout = (crm.commissionCloseouts ?? []).find((item) => item.jobId === job.id) ?? null;
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
  const nextStepTitle =
    nextTask?.title.trim() ||
    (pipelineColumn === "lead" ? "Scope review" : WORK_COLUMN_LABELS[pipelineColumn]);
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

  function addTag() {
    const value = tagDraft.trim();
    if (!value) return;
    patch({ tags: uniqueNames([...job.tags, value]) });
    setTagDraft("");
  }

  function openAddress() {
    setStreet(job.street);
    setCity(job.city);
    setState(job.state);
    setPostalCode(job.postalCode);
    setAddressOpen(true);
  }

  function openNextStepDate() {
    setTaskDraft(nextTask ?? null);
    setTaskTitleDefault(nextTask ? "" : nextStepTitle);
    setTaskOpen(true);
  }

  function uploadFiles() {
    if (deleted) return;
    setJobTab("files");
    setFilePicker((value) => value + 1);
  }

  async function duplicateJob() {
    if (deleted || duplicating) return;
    if (!job.primaryContactId && !opportunity?.primaryContactId) {
      toast.error("Add a homeowner before duplicating this job.");
      return;
    }
    setDuplicating(true);
    try {
      const stage = stageForCopy(pipelineColumn);
      const created = await crm.addOpportunity({
        name: job.name,
        clientId: job.clientId,
        primaryContactId: job.primaryContactId || opportunity?.primaryContactId || "",
        stage: isShelvedStage(stage) ? "pursuing" : stage,
        value: 0,
        bidDueAt: opportunity?.bidDueAt ?? null,
        preBidWalkAt: opportunity?.preBidWalkAt ?? null,
        location: job.location || address || "Address TBD",
        projectType: opportunity?.projectType || projectTypeForMarket(job.market || "residential"),
        market: job.market || opportunity?.market,
        deliveryMethod: opportunity?.deliveryMethod || "insurance_claim",
        estimator: job.projectManager || opportunity?.estimator || crm.user.name,
        ownerStaffId: job.ownerStaffId,
        originatorStaffId: opportunity?.originatorStaffId,
        nextStep: opportunity?.nextStep || "Review the duplicated job.",
        leadSource: job.leadSource || opportunity?.leadSource || "",
        referralContactId: opportunity?.referralContactId ?? null,
        street: job.street,
        city: job.city,
        state: job.state,
        postalCode: job.postalCode,
        notes: job.description,
      });
      const copy = created.costingJob;
      if (!copy?.id) {
        toast.error("The lead opened, but the job copy did not.");
        return;
      }
      const saved = await crm.updateJob(copy.id, {
        status: statusForCopy(pipelineColumn),
        trades: job.trades,
        description: job.description,
        tags: job.tags,
        startDate: job.startDate,
        substantialCompletion: job.substantialCompletion,
        assigned: job.assigned,
        relatedContactIds: job.relatedContactIds,
        subcontractorIds: job.subcontractorIds,
        leadSource: job.leadSource,
        projectManager: job.projectManager,
        superintendent: job.superintendent,
        market: job.market,
        salesRep: job.salesRep,
      });
      if (saved) toast.success("Job duplicated.");
      else toast.message("Job duplicated. Some details did not copy.");
      router.replace(jobRecordHref(copy.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate this job.");
    } finally {
      setDuplicating(false);
    }
  }

  const dateSpan = formatJobSpan(job.startDate, job.substantialCompletion);
  const namedHomeowner = primary?.name?.trim() || client?.name?.trim() || "";
  const resolvedCustomer = crm.customerName(job).trim();
  const homeownerName =
    namedHomeowner || (resolvedCustomer && resolvedCustomer !== "Homeowner" ? resolvedCustomer : "");

  const newMenu = !deleted ? (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            disabled={estimatePending || materialPending}
            aria-label="Create on this job"
            className="h-8 rounded-[10px] px-3"
          />
        }
      >
        <Plus data-icon="inline-start" />
        {estimatePending || materialPending ? "Opening…" : "New"}
        <ChevronDown data-icon="inline-end" className="size-3.5" />
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
    <div className={cn("flex h-full min-h-0 flex-col bg-[#f6f5f2] dark:bg-background", className)}>
      <header className="shrink-0 px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {job.code ? (
              <span className="inline-flex h-8 items-center rounded-[10px] border border-[#e4e1dc] bg-white px-2.5 font-mono text-xs font-medium dark:border-border dark:bg-card">
                {job.code}
              </span>
            ) : null}
            {job.code ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="size-8 rounded-[10px] border-[#e4e1dc] bg-white shadow-none dark:border-border dark:bg-card"
                onClick={() => copyText(job.code, "Job code")}
                aria-label="Copy job code"
              >
                <Copy />
              </Button>
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
              <SelectTrigger className={cn(headerPill, STATUS_PILL[pipelineColumn])} aria-label="Pipeline status">
                <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[pipelineColumn])} />
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
              <SelectTrigger className={cn(headerPill, "border-[#e4e1dc]")} aria-label="Residential">
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
              separator=" · "
              className={cn(headerPill, "max-w-none border-[#e4e1dc]")}
              onChange={(trades) => patch({ trades })}
            />
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {onToggleExpand ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8 text-muted-foreground"
                onClick={onToggleExpand}
                aria-label={expanded ? "Shrink job" : "Expand job"}
              >
                {expanded ? <Minimize2 /> : <Maximize2 />}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-8 text-muted-foreground"
                    aria-label="More job actions"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
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
                <DropdownMenuItem onClick={() => copyText(address, "Address")} disabled={!address}>
                  Copy address
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => copyText(`${window.location.origin}${jobRecordHref(job.id)}`, "Job link")}
                >
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTagsOpen(true)}>Edit tags</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {onClose ? (
              <Button type="button" variant="ghost" size="icon-sm" className="size-8" onClick={onClose} aria-label="Close">
                <XIcon />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1
            id="job-window-title"
            className="min-w-0 font-heading text-[1.7rem] leading-tight font-medium text-balance"
          >
            {job.name}
          </h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {primary?.phone ? (
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                className={outlineAction}
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
              className={outlineAction}
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
                className={outlineAction}
                disabled={closeoutBusy}
                onClick={() => {
                  setCloseoutBusy(true);
                  void crm.submitCommissionCloseout(job.id).finally(() => setCloseoutBusy(false));
                }}
              >
                <Send data-icon="inline-start" />
                {closeout?.status === "returned" ? "Send again for closeout" : "Send for closeout"}
              </Button>
            ) : null}
            {newMenu}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={openAddress}
            className="inline-flex items-center gap-1.5 hover:text-foreground"
          >
            <MapPin className="size-3.5" />
            {cityLine || address || "Add a job-site address"}
          </button>
          {job.projectManager ? (
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" />
              PM {job.projectManager}
            </span>
          ) : null}
          {dateSpan ? (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {dateSpan}
            </span>
          ) : null}
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (typeof value === "string") setJobTab(parseJobTab(value));
        }}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="flex shrink-0 items-end justify-between gap-4 border-b border-[#e6e3de] px-5 pt-3 dark:border-border">
          <TabsList variant="line" className="h-auto w-auto justify-start gap-4 overflow-visible rounded-none bg-transparent px-0 pb-0">
            <TabsTrigger value="overview" className="flex-none rounded-none px-0 pb-2.5 after:bottom-0 after:bg-primary">
              Overview
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex-none rounded-none px-0 pb-2.5 after:bottom-0 after:bg-primary">
              Photos
              <span className="text-muted-foreground">{photos.length}</span>
            </TabsTrigger>
            <TabsTrigger value="files" className="flex-none rounded-none px-0 pb-2.5 after:bottom-0 after:bg-primary">
              Files
              <span className="text-muted-foreground">{fileCount}</span>
            </TabsTrigger>
            {showPaper ? (
              <TabsTrigger value="paper" className="flex-none rounded-none px-0 pb-2.5 after:bottom-0 after:bg-primary">
                Paper
                <span className="text-muted-foreground">{estimates.length + invoices.length}</span>
              </TabsTrigger>
            ) : null}
            {showInsurance ? (
              <TabsTrigger value="insurance" className="flex-none rounded-none px-0 pb-2.5 after:bottom-0 after:bg-primary">
                Insurance
                {claimMath?.openCount ? (
                  <span className="text-muted-foreground">{claimMath.openCount}</span>
                ) : null}
              </TabsTrigger>
            ) : null}
            {showFinancials ? (
              <TabsTrigger value="financials" className="flex-none rounded-none px-0 pb-2.5 after:bottom-0 after:bg-primary">
                Financials
              </TabsTrigger>
            ) : null}
          </TabsList>
          <p className="shrink-0 pb-2.5 text-sm tabular-nums">
            {showFinancials && books ? (
              <>
                <span className="font-semibold">{formatCurrencyFull(books.invoiced)}</span>
                <span className="text-muted-foreground"> invoiced</span>
                <span className="ml-3 text-muted-foreground">
                  {formatCurrencyFull(draftEstimateTotal)} est. draft
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold">{soldFor > 0 ? formatCurrencyFull(soldFor) : "Not sold"}</span>
                {soldFor > 0 ? <span className="text-muted-foreground"> sold</span> : null}
              </>
            )}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {deleted ? (
            <div className={cn(recordPanel, "px-4 py-3")}>
              <p className="text-sm font-medium">This job is in Deleted.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {job.deletedBy ? `${job.deletedBy} removed it` : "Removed"}
                {job.deletedAt ? ` ${formatDate(job.deletedAt)}` : ""}.
                {job.deletedReason ? ` Reason: ${job.deletedReason}` : ""}
              </p>
            </div>
          ) : null}

          {codeReview && canEditCode && !deleted ? (
            <div className={cn(recordPanel, "px-4 py-3")}>
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
            <div className={cn(recordPanel, "px-4 py-3")}>
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

          <TabsContent value="overview" className="mt-0">
            <div className="grid gap-5 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
              <aside className="min-w-0 space-y-3">
                <section className={cn(recordPanel, "p-4")}>
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Homeowner
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f6d6de] text-sm font-semibold text-[#9a3d4d]">
                      {initials(homeownerName) || "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={primary ? `/contacts?contact=${primary.id}` : client ? `/clients/${client.id}` : "/contacts"}
                        className="block truncate text-sm font-semibold hover:underline"
                      >
                        {homeownerName || "Add a homeowner"}
                      </Link>
                      <p className="truncate text-sm text-muted-foreground">
                        {primary?.phone ? formatPhone(primary.phone) : "No phone"}
                      </p>
                    </div>
                    {primary?.phone ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="size-8 rounded-[10px] border-[#e4e1dc] bg-white shadow-none dark:border-border dark:bg-card"
                          nativeButton={false}
                          render={<a href={`tel:${primary.phone}`} />}
                          aria-label={`Call ${primary.name}`}
                        >
                          <Phone />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="size-8 rounded-[10px] border-[#e4e1dc] bg-white shadow-none dark:border-border dark:bg-card"
                          nativeButton={false}
                          render={<Link href={`/messages?job=${job.id}&contact=${primary.id}`} />}
                          aria-label={`Text ${primary.name}`}
                        >
                          <MessageSquare />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </section>

                <div
                  className={cn(
                    "relative overflow-hidden rounded-[14px] bg-[#fbfaf8] dark:bg-muted",
                    shownPhoto
                      ? "border border-[#e6e3de] dark:border-border"
                      : "border border-dashed border-[#d7d3ce] dark:border-border",
                  )}
                >
                  {shownPhoto ? (
                    <button type="button" onClick={() => setPhotoViewOpen(true)} className="block w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shownPhoto.imageUrl}
                        alt={shownPhoto.caption || job.name}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </button>
                  ) : managePhotos && !deleted ? (
                    <button
                      type="button"
                      onClick={() => setPhotoOpen(true)}
                      className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 text-muted-foreground"
                    >
                      <ImageIcon className="size-6" />
                      <span className="text-sm">Add a job-site photo</span>
                    </button>
                  ) : (
                    <div className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <ImageIcon className="size-6" />
                      <span className="text-sm">No job-site photo yet</span>
                    </div>
                  )}
                  {shownPhoto && job.primaryPhotoId === shownPhoto.id ? (
                    <span className="absolute bottom-3 left-3 rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
                      Primary
                    </span>
                  ) : null}
                  {photos.length > 0 ? (
                    <span className="absolute right-3 bottom-3 rounded-md bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground">
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

                <div className={cn(recordPanel, "px-4")}>
                  <DetailRow label="Lead source">
                    <Select
                      value={job.leadSource || undefined}
                      disabled={deleted}
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
                    <DateField
                      label="Start date"
                      value={job.startDate}
                      disabled={deleted}
                      onChange={(value) => patch({ startDate: value })}
                    />
                  </DetailRow>
                  <DetailRow label="End">
                    <DateField
                      label="End date"
                      value={job.substantialCompletion}
                      disabled={deleted}
                      onChange={(value) => patch({ substantialCompletion: value || null })}
                    />
                  </DetailRow>
                  <DetailRow label="Assigned">
                    <PeopleChips
                      names={job.assigned ?? []}
                      options={deleted ? [] : crm.teamMembers}
                      empty="Add crew"
                      onRemove={(name) => patch(assignedCrewPatch(job.assigned.filter((item) => item !== name), crm.staff))}
                      onAdd={(name) => patch(assignedCrewPatch([...job.assigned, name], crm.staff))}
                    />
                  </DetailRow>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={outlineAction}
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
                    className={outlineAction}
                    disabled={deleted || duplicating}
                    onClick={() => void duplicateJob()}
                  >
                    <Copy data-icon="inline-start" />
                    {duplicating ? "Duplicating…" : "Duplicate"}
                  </Button>
                  <Button variant="outline" size="sm" className={outlineAction} onClick={openAddress}>
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Button>
                </div>
              </aside>

              <div className="min-w-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard
                    eyebrow="Estimate"
                    title={featuredEstimate?.number ?? "No estimate yet"}
                    body={
                      featuredEstimate
                        ? `${ESTIMATE_STATUS_LABELS[featuredEstimate.status]} · ${formatCurrencyFull(
                            amountForEstimate(
                              featuredEstimate,
                              crm.estimateLines,
                              workMarket(job, opportunity),
                            ),
                          )}${
                            hasEstimateSignature(featuredEstimate)
                              ? ` · Signed by ${featuredEstimate.signatureName}`
                              : featuredEstimate.status === "declined"
                                ? " · Declined"
                                : ""
                          }`
                        : allowEstimates
                          ? "Build one from a measurement report or by hand."
                          : "Ops will draft the proposal."
                    }
                    action={
                      featuredEstimate
                        ? "Open estimate"
                        : allowEstimates && !deleted
                          ? "Create estimate"
                          : undefined
                    }
                    href={featuredEstimate ? `/estimates/${featuredEstimate.id}` : undefined}
                    onClick={
                      featuredEstimate || deleted || !allowEstimates ? undefined : promptJobEstimate
                    }
                  />
                  <SummaryCard
                    eyebrow="Files"
                    title={fileCount > 0 ? `${fileCount} file${fileCount === 1 ? "" : "s"}` : "No files yet"}
                    body={
                      latestPage
                        ? [
                            latestPage.title || "Untitled page",
                            PAGE_TEMPLATE_OPTIONS.find((option) => option.id === latestPage.template)?.title,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : jobFiles[0]?.name || "Photo reports and job files land here."
                    }
                    action={deleted ? undefined : fileCount > 0 ? "Open files" : "Upload"}
                    onClick={
                      deleted ? undefined : fileCount > 0 ? () => setJobTab("files") : uploadFiles
                    }
                  />
                  {showInsurance ? (
                    <SummaryCard
                      eyebrow="Insurance"
                      title={claim?.carrier || "No claim yet"}
                      body={
                        claim && claimMath
                          ? [
                              claim.claimNumber || "No claim number",
                              claim.adjusterName,
                              claimMath.openCount
                                ? `${claimMath.openCount} supplement${claimMath.openCount === 1 ? "" : "s"} open`
                                : "",
                              showFinancials
                                ? `${formatCurrencyFull(claimMath.outstanding)} still to collect`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : "Carrier, supplements and insurance checks."
                      }
                      action={claim ? "Open claim" : "Add claim"}
                      onClick={() => setJobTab("insurance")}
                    />
                  ) : null}
                  <SummaryCard
                    eyebrow="Next step"
                    title={nextStepTitle}
                    body={nextStepDetail(nextTask?.dueAt)}
                    action={deleted ? undefined : "Set date"}
                    onClick={deleted ? undefined : openNextStepDate}
                  />
                </div>

                <section>
                  <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Description
                  </p>
                  <Textarea
                    defaultValue={job.description}
                    placeholder="Scope, roof type, damage notes..."
                    rows={3}
                    disabled={deleted}
                    className="min-h-[76px] rounded-[12px] border-[#e6e3de] bg-white dark:border-border dark:bg-card"
                    onBlur={(event) => {
                      if (event.target.value !== job.description) {
                        patch({ description: event.target.value });
                      }
                    }}
                  />
                </section>

          <JobSection
            title="Related contacts"
            count={related.length}
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

          <section className={cn(recordPanel, "p-4")} id="job-activity">
            {jobMail.length > 0 ? (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Tagged mail</p>
                <ul className="space-y-2">
                  {jobMail.map((message) => (
                    <li key={message.id}>
                      <Link
                        href={mailHref({ thread: message.threadId || message.id, job: job.id })}
                        className="block rounded-[12px] border border-[#e6e3de] px-3 py-2 hover:bg-[#faf9f7] dark:border-border dark:hover:bg-muted"
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
            <ActivityComposer variant="record" entityType="job" entityId={job.id} focusRequest={activityFocus} />
            <div className="mt-4 border-t border-[#eeeae6] pt-3 dark:border-border">
              <ActivityList
                variant="record"
                items={activities}
                empty="No field notes yet. Log a call, text, or what the crew needs to see."
              />
            </div>
          </section>
              </div>
            </div>
            {canTrash ? (
              <div className="mt-4 flex justify-end">
                {deleted ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary hover:bg-primary/10 hover:text-primary"
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
                    Restore job
                  </Button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete job
                  </button>
                )}
              </div>
            ) : null}
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

        <TabsContent value="files" className="mt-0 space-y-8">
          {showFinancials ? (
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
          <RoofMeasureEntry jobId={job.id} disabled={deleted} />
          <JobEagleviewPanel jobId={job.id} disabled={deleted} />
          <JobFilesPanel jobId={job.id} disabled={deleted} openPicker={filePicker} />
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
              {allowPages && !deleted ? (
                <Button size="sm" onClick={() => setPageCreateOpen(true)}>
                  <FileText data-icon="inline-start" />
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
              <p className="text-sm text-muted-foreground">
                {allowPages
                  ? "Pages are branded job documents you send out — work orders, photo documentation, inspections, closeouts, and claim packets. Pick a template, then share a link or download a PDF."
                  : "Pages are branded job documents ops sends out. You can open any page already on this job."}
              </p>
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

        {showPaper ? (
        <TabsContent value="paper" className="mt-0 space-y-4">
          <AutomationRuns jobId={job.id} />
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Tasks</p>
              {deleted ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTaskDraft(null);
                    setTaskTitleDefault("");
                    setTaskOpen(true);
                  }}
                >
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
        onOpenChange={(open) => {
          setTaskOpen(open);
          if (!open) {
            setTaskDraft(null);
            setTaskTitleDefault("");
          }
        }}
        task={taskDraft}
        defaultTitle={taskTitleDefault}
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
      <Dialog open={tagsOpen} onOpenChange={setTagsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tags</DialogTitle>
          </DialogHeader>
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
              className="h-8 w-36"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setTagsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteJobDialog job={job} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
