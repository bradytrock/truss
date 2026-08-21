"use client";

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
import { MarketBadge } from "@/components/status-badge";
import { LeadAssigneeSelect } from "@/components/lead-assignee";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency } from "@/lib/format";
import { leadSourceLabel } from "@/lib/leads";
import { parseMarket, workMarket } from "@/lib/market";
import { acceptedAmountForJob } from "@/lib/estimate-totals";
import {
  WORK_COLUMNS,
  WORK_COLUMN_LABELS,
  boardValue,
  isWorkColumn,
  workColumnFor,
  type WorkColumn,
} from "@/lib/work-board";
import { assignmentOptions, canAssignLeadsToAnyone } from "@/lib/visibility";
import { dedupeJobsByOpportunity } from "@/lib/job-record";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

const columnAccent: Record<WorkColumn, string> = {
  lead: "bg-foreground/25",
  estimating: "bg-foreground/40",
  proposal_sent: "bg-primary",
  in_progress: "bg-primary",
  punch: "bg-foreground",
  complete: "bg-foreground/40",
  on_hold: "bg-foreground/15",
  lost: "bg-foreground/15",
};

export function JobsBoard({
  query,
  onSelectJob,
}: {
  query: string;
  onSelectJob: (jobId: string) => void;
}) {
  const crm = useCrm();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dedupeJobsByOpportunity(crm.jobs).filter((job) => {
      if (!needle) return true;
      const customer = crm.customerName(job);
      const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
      return (
        job.code.toLowerCase().includes(needle) ||
        job.name.toLowerCase().includes(needle) ||
        job.location.toLowerCase().includes(needle) ||
        customer.toLowerCase().includes(needle) ||
        job.projectManager.toLowerCase().includes(needle) ||
        (opportunity?.code.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [crm, query]);

  const active = crm.jobs.find((job) => job.id === activeId) ?? null;

  function columnOf(job: Job): WorkColumn {
    const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
    return workColumnFor(job, opportunity);
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const job = crm.jobs.find((item) => item.id === String(active.id));
    if (!job) return;

    const overId = String(over.id);
    const overColumn = isWorkColumn(overId)
      ? overId
      : (() => {
          const other = crm.jobs.find((item) => item.id === overId);
          return other ? columnOf(other) : null;
        })();

    if (!overColumn || overColumn === columnOf(job)) return;
    void (async () => {
      await crm.moveWork(job.id, overColumn);
      toast.success(`${job.code || job.name} → ${WORK_COLUMN_LABELS[overColumn]}.`);
    })();
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        title={query ? "No jobs match that search" : "No jobs yet"}
        description={
          query
            ? "Try a job code, homeowner, or city."
            : "Open a new lead. The card stays on this board from the first call through punch."
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
          {WORK_COLUMNS.map((column) => {
            const cards = filtered.filter((job) => columnOf(job) === column);
            const total = cards.reduce((sum, job) => {
              const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
              const signed = acceptedAmountForJob(
                job,
                crm.estimates,
                crm.estimateLines,
                workMarket(job, opportunity),
              );
              return sum + boardValue(job, opportunity, signed);
            }, 0);
            return (
              <JobColumn key={column} column={column} count={cards.length} total={total}>
                {cards.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    customerName={crm.customerName(job)}
                    onSelectJob={onSelectJob}
                  />
                ))}
              </JobColumn>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <DragOverlay>
        {active ? (
          <JobCard
            job={active}
            customerName={crm.customerName(active)}
            overlay
            onSelectJob={onSelectJob}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function JobColumn({
  column,
  count,
  total,
  children,
}: {
  column: WorkColumn;
  count: number;
  total: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[272px] shrink-0 flex-col rounded-md border bg-card",
        isOver && "border-primary",
      )}
    >
      <div className="border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full", columnAccent[column])} />
          <h2 className="text-sm font-medium">{WORK_COLUMN_LABELS[column]}</h2>
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
  onSelectJob,
}: {
  job: Job;
  customerName: string;
  overlay?: boolean;
  onSelectJob: (jobId: string) => void;
}) {
  const crm = useCrm();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    disabled: overlay,
  });
  const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
  const market = workMarket(job, opportunity);
  const people = assignmentOptions(
    crm.viewer,
    crm.book.staff,
    opportunity?.ownerStaffId || job.ownerStaffId,
    crm.user.role,
  );
  const ownerId = opportunity?.ownerStaffId || job.ownerStaffId;
  const canReassign =
    Boolean(opportunity) &&
    (canAssignLeadsToAnyone(crm.viewer, crm.user.role) ||
      people.length > 1 ||
      people.some((member) => member.id !== ownerId));
  const ownerName =
    crm.book.staff.find((member) => member.id === ownerId)?.name ?? job.projectManager;

  return (
    <Card
      ref={setNodeRef}
      size="sm"
      className={cn(
        "bg-card shadow-none",
        isDragging && !overlay && "opacity-40",
        overlay && "w-[248px] shadow-md",
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
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              if (!overlay) onSelectJob(job.id);
            }}
          >
            <RecordCode code={job.code} />
            <span className="mt-0.5 block text-sm font-medium leading-snug hover:underline">
              {job.name}
            </span>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{customerName}</p>
            {job.leadSource ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {leadSourceLabel(job.leadSource)}
              </p>
            ) : null}
          </button>
        </div>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => {
            if (!overlay) onSelectJob(job.id);
          }}
        >
          <span className="font-heading text-sm font-medium tabular-nums">
            {formatCurrency(
              boardValue(
                job,
                opportunity,
                acceptedAmountForJob(job, crm.estimates, crm.estimateLines, market),
              ),
            )}
          </span>
          <MarketBadge market={parseMarket(market)} />
        </button>
        <div
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {canReassign && !overlay && opportunity ? (
            <LeadAssigneeSelect
              size="sm"
              value={opportunity.ownerStaffId}
              people={people}
              onChange={(staffId) => {
                void crm.assignOpportunityOwner(opportunity.id, staffId).then((ok) => {
                  if (!ok) return;
                  const name = people.find((member) => member.id === staffId)?.name ?? "teammate";
                  toast.success(`Assigned to ${name}.`);
                });
              }}
            />
          ) : (
            <p className="truncate text-[11px] text-muted-foreground">{ownerName}</p>
          )}
        </div>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left text-xs text-muted-foreground"
          onClick={() => {
            if (!overlay) onSelectJob(job.id);
          }}
        >
          <span className="min-w-0 truncate">{job.location}</span>
        </button>
      </CardContent>
    </Card>
  );
}
