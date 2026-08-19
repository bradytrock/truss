import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CLIENT_TYPE_LABELS,
  JOB_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  STAGE_LABELS,
  type ClientType,
  type JobStatus,
  type PipelineStage,
  type ProjectType,
} from "@/lib/types";

const stageClass: Record<PipelineStage, string> = {
  pursuing: "bg-sky-100 text-sky-900 border-sky-200",
  estimating: "bg-amber-100 text-amber-950 border-amber-200",
  bid_submitted: "bg-violet-100 text-violet-900 border-violet-200",
  interview: "bg-orange-100 text-orange-950 border-orange-200",
  awarded: "bg-emerald-100 text-emerald-900 border-emerald-200",
  lost: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

const jobClass: Record<JobStatus, string> = {
  precon: "bg-sky-100 text-sky-900 border-sky-200",
  in_progress: "bg-amber-100 text-amber-950 border-amber-200",
  punch: "bg-orange-100 text-orange-950 border-orange-200",
  complete: "bg-emerald-100 text-emerald-900 border-emerald-200",
  on_hold: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return (
    <Badge variant="outline" className={cn("border font-medium", stageClass[stage])}>
      {STAGE_LABELS[stage]}
    </Badge>
  );
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge variant="outline" className={cn("border font-medium", jobClass[status])}>
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
    <Badge variant="secondary" className="font-normal">
      {label}
    </Badge>
  );
}
