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
import { TypeBadge } from "@/components/status-badge";
import { EmptyState, RecordCode } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { daysUntil, formatCurrency, formatDateShort } from "@/lib/format";
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  type Opportunity,
  type PipelineStage,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const columnAccent: Record<PipelineStage, string> = {
  pursuing: "bg-foreground/25",
  estimating: "bg-foreground/40",
  bid_submitted: "bg-primary",
  interview: "bg-primary",
  awarded: "bg-foreground",
  lost: "bg-foreground/15",
};

export function PipelineBoard({ query }: { query: string }) {
  const { opportunities, getContact, customerName, moveOpportunity } = useCrm();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return opportunities.filter((opportunity) => {
      if (!needle) return true;
      const customer = customerName(opportunity);
      const contact = getContact(opportunity.primaryContactId);
      return (
        opportunity.code.toLowerCase().includes(needle) ||
        opportunity.name.toLowerCase().includes(needle) ||
        opportunity.location.toLowerCase().includes(needle) ||
        customer.toLowerCase().includes(needle) ||
        (contact?.name.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [customerName, getContact, opportunities, query]);

  const active = opportunities.find((opportunity) => opportunity.id === activeId) ?? null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const opportunity = opportunities.find((item) => item.id === String(active.id));
    if (!opportunity) return;

    const overId = String(over.id);
    const overStage = PIPELINE_STAGES.includes(overId as PipelineStage)
      ? (overId as PipelineStage)
      : opportunities.find((item) => item.id === overId)?.stage;

    if (!overStage || overStage === opportunity.stage) return;
    void (async () => {
      const created = await moveOpportunity(opportunity.id, overStage);
      if (overStage === "awarded") {
        toast.success(
          created
            ? `Awarded. Opened ${opportunity.name} as a precon job.`
            : `Marked ${opportunity.name} awarded.`
        );
      } else if (overStage === "lost") {
        toast.message(`${opportunity.name} marked lost.`);
      } else {
        toast.success(`Moved to ${STAGE_LABELS[overStage]}.`);
      }
    })();
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        title={query ? "No pursuits match that search" : "Pipeline is empty"}
        description={
          query
            ? "Try a project name, client, or city."
            : "Open a pursuit from an RFP, a walk, or a conversation with an owner."
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
          {PIPELINE_STAGES.map((stage) => {
            const cards = filtered.filter((opportunity) => opportunity.stage === stage);
            const total = cards.reduce((sum, opportunity) => sum + opportunity.value, 0);
            return (
              <PipelineColumn
                key={stage}
                stage={stage}
                count={cards.length}
                total={total}
              >
                {cards.map((opportunity) => (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    customerName={customerName(opportunity)}
                  />
                ))}
              </PipelineColumn>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <DragOverlay>
        {active ? (
          <OpportunityCard
            opportunity={active}
            customerName={customerName(active)}
            overlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function PipelineColumn({
  stage,
  count,
  total,
  children,
}: {
  stage: PipelineStage;
  count: number;
  total: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

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
          <span className={cn("size-1.5 rounded-full", columnAccent[stage])} />
          <h2 className="text-sm font-medium">{STAGE_LABELS[stage]}</h2>
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

function OpportunityCard({
  opportunity,
  customerName,
  overlay,
}: {
  opportunity: Opportunity;
  customerName: string;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: opportunity.id,
    disabled: overlay,
  });
  const dueIn = daysUntil(opportunity.bidDueAt);

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
            aria-label="Drag pursuit"
            {...listeners}
            {...attributes}
          >
            <GripVertical className="size-3.5" />
          </button>
          <div className="min-w-0 flex-1">
            <RecordCode code={opportunity.code} />
            <Link
              href={`/opportunities/${opportunity.id}`}
              className="mt-0.5 block text-sm font-medium leading-snug hover:underline"
            >
              {opportunity.name}
            </Link>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{customerName}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading text-sm font-medium tabular-nums">
            {formatCurrency(opportunity.value)}
          </span>
          <TypeBadge type={opportunity.projectType} />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{opportunity.location}</span>
          {opportunity.bidDueAt ? (
            <span
              className={cn(
                "shrink-0 tabular-nums",
                dueIn !== null && dueIn <= 3 && dueIn >= 0 && "font-medium text-destructive",
                dueIn !== null && dueIn < 0 && opportunity.stage !== "awarded" && opportunity.stage !== "lost"
                  && "text-destructive"
              )}
            >
              {dueIn === 0
                ? "Due today"
                : dueIn === 1
                  ? "Due tomorrow"
                  : formatDateShort(opportunity.bidDueAt)}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
