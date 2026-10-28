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
import { GripVertical, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KanbanScroller } from "@/components/board-scroll-slider";
import { EmptyState, RecordCode } from "@/components/page-chrome";
import { DeleteJobDialog } from "@/components/delete-job-dialog";
import { useCrm } from "@/lib/crm-store";
import { boardEstimateTags } from "@/lib/estimate-totals";
import { formatCurrency, initials } from "@/lib/format";
import { leadSourceLabel } from "@/lib/leads";
import { phoneQueryMatches } from "@/lib/phone";
import { parseMarket, workMarket } from "@/lib/market";
import { unweightedContractValue } from "@/lib/pipeline-path";
import { estimatesForJob } from "@/lib/won";
import {
  WORK_COLUMNS,
  WORK_COLUMN_LABELS,
  boardCardAddress,
  boardCardCue,
  boardCardDetails,
  boardCardName,
  isShelvedWorkColumn,
  isWorkColumn,
  workColumnFor,
  type BoardCueTone,
  type WorkColumn,
} from "@/lib/work-board";
import { canDeleteJobs, jobMatchesOwnerFilter } from "@/lib/visibility";
import { dedupeJobsByOpportunity, isDeletedJob, jobRecordHref } from "@/lib/job-record";
import type { Estimate, EstimateLine, Job, Opportunity } from "@/lib/types";
import { cn } from "@/lib/utils";

function contractOnBoard(
  crm: {
    getOpportunity: (id: string) => Opportunity | undefined;
    estimates?: Estimate[];
    estimateLines?: EstimateLine[];
  },
  job: Job,
) {
  const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
  return unweightedContractValue({
    job,
    opportunity,
    estimates: crm.estimates ?? [],
    lines: crm.estimateLines ?? [],
  });
}

const cueTone: Record<BoardCueTone, string> = {
  fresh: "bg-emerald-50 text-emerald-800",
  attention: "bg-sky-50 text-sky-800",
  steady: "bg-neutral-100 text-neutral-600",
  aging: "bg-amber-50 text-amber-900",
  done: "bg-emerald-50 text-emerald-800",
  muted: "bg-neutral-100 text-neutral-500",
};

const OWNER_DOTS = ["#7c5cbf", "#e07a2f", "#2f9e6b", "#3b82c4", "#c43b6e", "#b0892e"];

function ownerDot(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return OWNER_DOTS[hash % OWNER_DOTS.length] ?? OWNER_DOTS[0];
}

export function JobsBoard({
  query,
  ownerIds,
  showClosed = false,
  onSelectJob,
}: {
  query: string;
  ownerIds?: Set<string> | null;
  showClosed?: boolean;
  onSelectJob: (jobId: string) => void;
}) {
  const crm = useCrm();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Job | null>(null);
  const canTrash = canDeleteJobs(crm.viewer) && !crm.impersonatedStaff;
  const columns = canTrash ? WORK_COLUMNS : WORK_COLUMNS.filter((column) => column !== "deleted");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dedupeJobsByOpportunity(crm.jobs ?? []).filter((job) => {
      if (!canTrash && isDeletedJob(job)) return false;
      const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
      if (!jobMatchesOwnerFilter(job, opportunity, ownerIds, crm.book.staff)) return false;
      if (!needle) return true;
      const customer = crm.customerName(job);
      const linkedPhones = [job.primaryContactId, ...job.relatedContactIds]
        .map((id) => (id ? crm.book.contacts.find((contact) => contact.id === id)?.phone : undefined));
      if (opportunity?.primaryContactId) {
        linkedPhones.push(
          crm.book.contacts.find((contact) => contact.id === opportunity.primaryContactId)?.phone,
        );
      }
      if (linkedPhones.some((phone) => phoneQueryMatches(phone, query))) return true;
      return (
        (job.code ?? "").toLowerCase().includes(needle) ||
        (job.name ?? "").toLowerCase().includes(needle) ||
        (job.location ?? "").toLowerCase().includes(needle) ||
        customer.toLowerCase().includes(needle) ||
        (job.projectManager ?? "").toLowerCase().includes(needle) ||
        (opportunity?.code.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [canTrash, crm, ownerIds, query]);

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
    if (overColumn === "deleted") {
      if (!canTrash) return;
      setPendingDelete(job);
      return;
    }
    void (async () => {
      await crm.moveWork(job.id, overColumn);
      const label = WORK_COLUMN_LABELS[overColumn];
      toast.success(
        isDeletedJob(job)
          ? `${job.code || job.name} restored to ${label}.`
          : overColumn === "unqualified"
            ? `${job.code || job.name} marked unqualified.`
            : `${job.code || job.name} → ${label}.`,
      );
    })();
  }

  if (filtered.length === 0) {
    const searching = Boolean(query.trim());
    const noneSelected = ownerIds !== undefined && ownerIds !== null && ownerIds.size === 0;
    const peopleFilter = ownerIds !== undefined && ownerIds !== null;
    return (
      <EmptyState
        title={
          noneSelected
            ? "No people selected"
            : searching
              ? "No jobs match that search"
              : peopleFilter
                ? "No jobs for those people"
                : "No jobs yet"
        }
        description={
          noneSelected
            ? "Check the people whose pipelines you want on this board, or choose Select all."
            : searching
              ? "Try a job code, homeowner, phone, or city. People still checked in the filter stay in play."
              : peopleFilter
                ? "Those seats have nothing on this board. Check someone else, or Select all."
                : "Open a new lead. The card stays on this board from the first call through punch."
        }
      />
    );
  }

  const searching = Boolean(query.trim());
  const visibleColumns = columns.filter((column) => {
    if (!isShelvedWorkColumn(column)) return true;
    if (showClosed) return true;
    if (searching) return filtered.some((job) => columnOf(job) === column);
    return false;
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <KanbanScroller fill>
          <div className="flex h-full min-h-0 items-stretch gap-3">
            {visibleColumns.map((column) => {
              const cards = filtered.filter((job) => columnOf(job) === column);
              const total = cards.reduce((sum, job) => sum + contractOnBoard(crm, job), 0);
              return (
                <JobColumn key={column} column={column} count={cards.length} total={total}>
                  {cards.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      column={column}
                      customerName={crm.customerName(job)}
                      onSelectJob={onSelectJob}
                    />
                  ))}
                </JobColumn>
              );
            })}
          </div>
        </KanbanScroller>
      </div>
      <DragOverlay>
        {active ? (
          <JobCard
            job={active}
            column={columnOf(active)}
            customerName={crm.customerName(active)}
            overlay
            onSelectJob={onSelectJob}
          />
        ) : null}
      </DragOverlay>
      <DeleteJobDialog
        job={pendingDelete}
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      />
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
        "flex h-full min-h-0 w-[17.5rem] shrink-0 flex-col overflow-y-auto overscroll-contain",
        isOver && "rounded-xl bg-black/[0.03]",
      )}
    >
      <div className="sticky top-0 z-10 shrink-0 bg-background px-0.5 pb-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="pt-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {WORK_COLUMN_LABELS[column]}
          </h2>
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        </div>
        <p className="mt-1 font-heading text-[1.65rem] leading-none font-medium tabular-nums tracking-tight">
          {formatCurrency(total)}
        </p>
      </div>
      <div className="flex flex-col gap-2 px-0.5 pt-0.5 pb-8">
        {count === 0 && isOver ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground">Drop here</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function JobOpenLink({
  jobId,
  overlay,
  onSelectJob,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  jobId: string;
  overlay?: boolean;
  onSelectJob: (jobId: string) => void;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  if (overlay) {
    return <div className={className}>{children}</div>;
  }
  return (
    <Link
      href={jobRecordHref(jobId)}
      scroll={false}
      className={className}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        onSelectJob(jobId);
      }}
    >
      {children}
    </Link>
  );
}

function JobCard({
  job,
  column,
  customerName,
  overlay,
  onSelectJob,
}: {
  job: Job;
  column: WorkColumn;
  customerName: string;
  overlay?: boolean;
  onSelectJob: (jobId: string) => void;
}) {
  const crm = useCrm();
  const canTrash = canDeleteJobs(crm.viewer) && !crm.impersonatedStaff;
  const deleted = isDeletedJob(job);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    disabled: overlay,
  });
  const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
  const market = parseMarket(workMarket(job, opportunity));
  const details = boardCardDetails({
    title: job.name,
    customerName,
    location: job.location,
    street: job.street,
    city: job.city,
    state: job.state,
    postalCode: job.postalCode,
  });
  const name = boardCardName(customerName, details.title || job.name);
  const address = boardCardAddress({
    street: job.street || details.streetLine,
    city: job.city || details.locality.split(",")[0]?.trim(),
    state: job.state,
    location: details.location || job.location,
  });
  const estimate = boardEstimateTags(estimatesForJob(job, crm.estimates ?? []))[0] ?? null;
  const cue = boardCardCue({
    column,
    openedAt: opportunity?.createdAt || job.startDate,
    startedAt: job.startDate || opportunity?.createdAt,
    estimate,
  });
  const value = contractOnBoard(crm, job);
  const owner =
    crm.book.staff.find((member) => member.id && member.id === job.ownerStaffId) ??
    crm.book.staff.find((member) => {
      const staffName = member.name.trim();
      return Boolean(staffName) && (staffName === job.projectManager || staffName === job.salesRep);
    });
  const mark = (owner?.initials || initials(owner?.name || job.projectManager || job.salesRep)).slice(0, 2);
  const source = leadSourceLabel(job.leadSource || opportunity?.leadSource);
  const showFooter = Boolean(mark || source || market === "commercial");

  return (
    <article
      ref={setNodeRef}
      className={cn(
        "rounded-xl border border-black/8 bg-card px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        isDragging && !overlay && "opacity-40",
        overlay && "w-[17.5rem] shadow-md",
        deleted && "opacity-80",
      )}
    >
      <div className="flex items-start gap-1">
        {overlay ? null : (
          <button
            type="button"
            className="mt-1 cursor-grab touch-none text-muted-foreground/70 hover:text-foreground"
            aria-label="Drag job"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <JobOpenLink
          jobId={job.id}
          overlay={overlay}
          onSelectJob={onSelectJob}
          className="min-w-0 flex-1 text-left"
          aria-label={`Open ${name}`}
        >
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-tight font-medium",
                cueTone[cue.tone],
              )}
            >
              <span className="size-1.5 shrink-0 rounded-full bg-current" />
              {cue.label}
            </span>
            <RecordCode code={job.code} className="shrink-0 pt-0.5" />
          </div>
          <p
            className={cn(
              "mt-2 leading-none tracking-tight",
              value > 0
                ? "font-heading text-[1.35rem] font-medium tabular-nums"
                : "text-base font-semibold",
            )}
          >
            {value > 0 ? formatCurrency(value) : "No estimate yet"}
          </p>
          <p className="mt-1.5 truncate text-sm font-semibold leading-tight">{name}</p>
          {address && address !== name ? (
            <p className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">{address}</p>
          ) : null}
          {showFooter ? (
            <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
              {mark ? (
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[9px] font-semibold tracking-wide text-white">
                  {mark}
                </span>
              ) : null}
              {mark ? (
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: ownerDot(owner?.id || mark) }}
                />
              ) : null}
              {source ? (
                <span className="min-w-0 truncate text-[11px] text-muted-foreground">{source}</span>
              ) : null}
              {market === "commercial" ? (
                <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Commercial
                </span>
              ) : null}
            </div>
          ) : null}
        </JobOpenLink>
      </div>
      {canTrash && deleted && !overlay ? (
        <div
          className="mt-2"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="w-full"
            onClick={() => {
              void crm.restoreJob(job.id).then((ok) => {
                if (ok) toast.success(`${job.code || job.name} is back on the board.`);
              });
            }}
          >
            <RotateCcw className="size-3" />
            Restore
          </Button>
          {job.deletedReason ? (
            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{job.deletedReason}</p>
          ) : null}
        </div>
      ) : deleted && job.deletedReason ? (
        <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{job.deletedReason}</p>
      ) : null}
    </article>
  );
}
