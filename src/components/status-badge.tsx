import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CLIENT_TYPE_LABELS,
  ESTIMATE_STATUS_LABELS,
  EVENT_KIND_LABELS,
  INVOICE_STATUS_LABELS,
  JOB_STATUS_LABELS,
  PHOTO_CATEGORY_LABELS,
  PROJECT_TYPE_LABELS,
  STAGE_LABELS,
  type ClientType,
  type EstimateStatus,
  type EventKind,
  type InvoiceStatus,
  type JobStatus,
  type PhotoCategory,
  type PipelineStage,
  type ProjectType,
} from "@/lib/types";

const quiet =
  "border-border bg-transparent font-medium text-foreground/80";
const hot = "border-primary/30 bg-primary/8 font-medium text-primary";
const done = "border-border bg-foreground/[0.06] font-medium text-foreground";
const danger = "border-destructive/30 bg-destructive/8 font-medium text-destructive";
const mute = "border-border bg-transparent font-medium text-muted-foreground";

const stageClass: Record<PipelineStage, string> = {
  pursuing: quiet,
  estimating: quiet,
  bid_submitted: hot,
  interview: hot,
  awarded: done,
  lost: mute,
};

const jobClass: Record<JobStatus, string> = {
  precon: quiet,
  in_progress: hot,
  punch: hot,
  complete: done,
  on_hold: mute,
};

const estimateClass: Record<EstimateStatus, string> = {
  draft: mute,
  sent: hot,
  viewed: hot,
  accepted: done,
  declined: danger,
};

const invoiceClass: Record<InvoiceStatus, string> = {
  draft: mute,
  sent: quiet,
  partial: hot,
  paid: done,
  overdue: danger,
  void: mute,
};

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return (
    <Badge variant="outline" className={cn(stageClass[stage])}>
      {STAGE_LABELS[stage]}
    </Badge>
  );
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge variant="outline" className={cn(jobClass[status])}>
      {JOB_STATUS_LABELS[status]}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: ProjectType | ClientType }) {
  const label =
    type in PROJECT_TYPE_LABELS
      ? PROJECT_TYPE_LABELS[type as ProjectType]
      : CLIENT_TYPE_LABELS[type as ClientType];
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {label}
    </Badge>
  );
}

export function EstimateStatusBadge({ status }: { status: EstimateStatus }) {
  return (
    <Badge variant="outline" className={cn(estimateClass[status])}>
      {ESTIMATE_STATUS_LABELS[status]}
    </Badge>
  );
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge variant="outline" className={cn(invoiceClass[status])}>
      {INVOICE_STATUS_LABELS[status]}
    </Badge>
  );
}

export function EventKindBadge({ kind }: { kind: EventKind }) {
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {EVENT_KIND_LABELS[kind]}
    </Badge>
  );
}

export function PhotoCategoryBadge({ category }: { category: PhotoCategory }) {
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {PHOTO_CATEGORY_LABELS[category]}
    </Badge>
  );
}
