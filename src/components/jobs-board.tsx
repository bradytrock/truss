"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { EmptyState, RecordCode } from "@/components/page-chrome";
import { JobStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency } from "@/lib/format";
import {
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  type Job,
  type JobStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const columnAccent: Record<JobStatus, string> = {
  precon: "bg-foreground/25",
  in_progress: "bg-primary",
  punch: "bg-foreground",
  complete: "bg-foreground/40",
  on_hold: "bg-foreground/15",
};

export function JobsBoard({ query }: { query: string }) {
  const { jobs, customerName, updateJob } = useCrm();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (!needle) return true;
      const customer = customerName(job);
      return (
        job.code.toLowerCase().includes(needle) ||
        job.name.toLowerCase().includes(needle) ||
        job.location.toLowerCase().includes(needle) ||
        customer.toLowerCase().includes(needle) ||
        job.projectManager.toLowerCase().includes(needle)
      );
    });
  }, [customerName, jobs, query]);

  const active = jobs.find((job) => job.id === activeId) ?? null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const job = jobs.find((item) => item.id === String(active.id));
    if (!job) return;

    const overId = String(over.id);
    const overStatus = JOB_STATUSES.includes(overId as JobStatus)
      ? (overId as JobStatus)
      : jobs.find((item) => item.id === overId)?.status;

    if (!overStatus || overStatus === job.status) return;
    void (async () => {
      await updateJob(job.id, { status: overStatus });
      toast.success(`${job.code || job.name} → ${JOB_STATUS_LABELS[overStatus]}.`);
    })();
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        title={query ? "No jobs match that search" : "No jobs yet"}
        description={
          query
            ? "Try a job code, homeowner, or city."
            : "Award a pursuit on the pipeline, or log an existing contract."
        }
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <ScrollArea className="w-full">
        <div className="flex min-h-[32rem] gap-3 pb-3">
          {JOB_STATUSES.map((status) => {
            const cards = filtered.filter((job) => job.status === status);
            const total = cards.reduce((sum, job) => sum + job.contractValue, 0);
            return (
              <JobColumn key={status} status={status} count={cards.length} total={total}>
                {cards.map((job) => (
                  <JobCard key={job.id} job={job} customerName={customerName(job)} />
                ))}
              </JobColumn>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <DragOverlay>
        {active ? (
          <JobCard job={active} customerName={customerName(active)} overlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function JobColumn({
  status,
  count,
  total,
  children,
}: {
  status: JobStatus;
  count: number;
  total: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[272px] shrink-0 flex-col rounded-md border bg-card",
        isOver && "border-primary"
      )}
    >
      <div className="border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full", columnAccent[status])} />
          <h2 className="text-sm font-medium">{JOB_STATUS_LABELS[status]}</h2>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>
        </div>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {count === 0 ? "No work in this stage" : formatCurrency(total)}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">{children}</div>
    </div>
  );
}

function JobCard({
  job,
  customerName,
  overlay,
}: {
  job: Job;
  customerName: string;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    disabled: overlay,
  });

  return (
    <Card
      ref={setNodeRef}
      size="sm"
      className={cn(
        "bg-card shadow-none",
        isDragging && !overlay && "opacity-40",
        overlay && "w-[248px] shadow-md"
      )}
    >
      <CardContent className="space-y-2">
        <div className="flex items-start gap-1">
          <button
            type="button"
            className="mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground"
            aria-label="Drag job"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-3.5" />
          </button>
          <div className="min-w-0 flex-1">
            <RecordCode code={job.code} />
            <Link
              href={`/jobs/${job.id}`}
              className="mt-0.5 block text-sm font-medium leading-snug hover:underline"
            >
              {job.name}
            </Link>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{customerName}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading text-sm font-medium tabular-nums">
            {formatCurrency(job.contractValue)}
          </span>
          <JobStatusBadge status={job.status} />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{job.location}</span>
          <span className="shrink-0 truncate">{job.projectManager}</span>
        </div>
      </CardContent>
    </Card>
  );
}
