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
import { KanbanScroller } from "@/components/board-scroll-slider";
import { MarketBadge, TypeBadge } from "@/components/status-badge";
import { EmptyState, RecordCode } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { daysUntil, formatCurrency, formatDateShort } from "@/lib/format";
import { leadSourceLabel } from "@/lib/leads";
import { parseMarket } from "@/lib/market";
import {
  SELECTABLE_PIPELINE_STAGES,
  STAGE_LABELS,
  type Opportunity,
  type PipelineStage,
} from "@/lib/types";
import { boardCardDetails } from "@/lib/work-board";
import { cn } from "@/lib/utils";

const columnAccent: Record<PipelineStage, string> = {
  pursuing: "bg-foreground/25",
  estimating: "bg-foreground/40",
  bid_submitted: "bg-primary",
  interview: "bg-primary",
  supplementing: "bg-primary",
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
    const dropped = (SELECTABLE_PIPELINE_STAGES as readonly PipelineStage[]).includes(overId as PipelineStage)
      ? (overId as PipelineStage)
      : opportunities.find((item) => item.id === overId)?.stage;
    const overStage = dropped === "estimating" ? "supplementing" : dropped;

    if (!overStage || overStage === opportunity.stage) return;
    void (async () => {
      const created = await moveOpportunity(opportunity.id, overStage);
      if (overStage === "awarded") {
        toast.success(
          created
            ? `Job Sold. ${opportunity.name} stays on the books as ${created.code || created.name}.`
            : `Moved ${opportunity.name} to Job Sold.`
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
            : "Open a new lead or write an estimate. Each card is already a job you can cost against. Signing moves it to Job Sold."
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
      <KanbanScroller>
        <div className="flex min-h-[32rem] gap-2 pb-3">
          {SELECTABLE_PIPELINE_STAGES.map((stage) => {
            const cards = filtered.filter((opportunity) =>
              stage === "supplementing"
                ? opportunity.stage === "supplementing" || opportunity.stage === "estimating"
                : opportunity.stage === stage,
            );
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
      </KanbanScroller>
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
        "flex w-[168px] shrink-0 flex-col rounded-md border bg-card",
        isOver && "border-primary"
      )}
    >
      <div className="border-b px-1.5 py-1.5">
        <div className="flex items-center gap-1">
          <span className={cn("size-1.5 shrink-0 rounded-full", columnAccent[stage])} />
          <h2 className="min-w-0 truncate text-xs font-medium">{STAGE_LABELS[stage]}</h2>
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{count}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">
          {count === 0 ? "No work in this stage" : formatCurrency(total)}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-1">{children}</div>
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
  const details = boardCardDetails({
    title: opportunity.name,
    customerName,
    location: opportunity.location,
    street: opportunity.street,
    city: opportunity.city,
    state: opportunity.state,
    postalCode: opportunity.postalCode,
  });

  return (
    <Card
      ref={setNodeRef}
      size="sm"
      className={cn(
          "bg-card shadow-none [--card-spacing:--spacing(1.5)]",
          isDragging && !overlay && "opacity-40",
          overlay && "w-[158px] shadow-md"
      )}
    >
      <CardContent className="space-y-1">
        <div>
          <div className="flex items-start gap-0.5">
            <button
              type="button"
              className="mt-px cursor-grab touch-none text-muted-foreground hover:text-foreground"
              aria-label="Drag pursuit"
              {...listeners}
              {...attributes}
            >
              <GripVertical className="size-3" />
            </button>
            <div className="min-w-0 flex-1">
              <RecordCode code={opportunity.code} />
            </div>
          </div>
          <div className="mt-0.5 w-full">
            <Link
              href={`/opportunities/${opportunity.id}`}
              className="block text-xs font-medium leading-tight hover:underline"
            >
              {details.title}
            </Link>
            {details.streetLine ? (
              <p className="mt-0.5 text-xs font-medium leading-tight">{details.streetLine}</p>
            ) : null}
            {details.locality ? (
              <p className="mt-0.5 text-[11px] leading-tight">{details.locality}</p>
            ) : null}
            {details.showLocation && !details.streetLine && !details.locality ? (
              <p className="mt-0.5 text-xs leading-tight">{details.location}</p>
            ) : null}
            {details.showCustomer ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{details.customer}</p>
            ) : null}
            {opportunity.leadSource ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {leadSourceLabel(opportunity.leadSource)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="font-heading text-xs font-medium tabular-nums">
            {formatCurrency(opportunity.value)}
          </span>
          <MarketBadge market={parseMarket(opportunity.market, opportunity.projectType)} />
          <TypeBadge type={opportunity.projectType} />
        </div>
        {opportunity.bidDueAt ? (
          <div className="flex items-center justify-end text-[11px] text-muted-foreground">
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
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
