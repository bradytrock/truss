"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EyeOff, GripVertical, LayoutGrid, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  HOME_MODULE_LABELS,
  HOME_SPAN_OPTIONS,
  SALES_HOME_MODULE_IDS,
  defaultHomeLayout,
  hiddenHomeLayout,
  homeModuleSpanClass,
  loadHomeLayout,
  reorderHomeLayout,
  saveHomeLayout,
  setHomeModuleHidden,
  setHomeModuleSpan,
  visibleHomeLayout,
  type HomeModuleId,
  type HomeModulePlacement,
  type HomeModuleSpan,
} from "@/lib/home-layout";
import { cn } from "@/lib/utils";

export function HomeDashboardCanvas({
  companyId,
  staffId,
  editing,
  availableIds,
  salesIntro,
  renderModule,
}: {
  companyId: string;
  staffId: string;
  editing: boolean;
  availableIds: HomeModuleId[];
  salesIntro?: ReactNode;
  renderModule: (id: HomeModuleId) => ReactNode;
}) {
  const [layout, setLayout] = useState(() => loadHomeLayout(companyId, staffId));
  const available = useMemo(() => new Set(availableIds), [availableIds]);
  const visible = useMemo(() => visibleHomeLayout(layout, available), [available, layout]);
  const hidden = useMemo(() => hiddenHomeLayout(layout, available), [available, layout]);
  const showSalesIntro = visible.some((item) => SALES_HOME_MODULE_IDS.includes(item.id));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function commit(next: HomeModulePlacement[]) {
    setLayout(next);
    saveHomeLayout(companyId, staffId, next);
  }

  function onDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    if (!overId || event.active.id === overId) return;
    commit(reorderHomeLayout(layout, String(event.active.id), String(overId)));
  }

  return (
    <div className="space-y-3">
      {editing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[#c9c9c9] bg-[#f3f3f3] px-3 py-2">
          <p className="text-xs text-[#706e6b]">
            Drag modules to rearrange. Change width or hide anything you do not want on Home.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              commit(defaultHomeLayout());
              toast.success("Dashboard reset to the default layout.");
            }}
          >
            <RotateCcw data-icon="inline-start" />
            Reset layout
          </Button>
        </div>
      ) : null}

      {showSalesIntro ? salesIntro : null}

      {visible.length === 0 && !editing ? (
        <div className="rounded-sm border border-dashed border-[#c9c9c9] px-4 py-10 text-center">
          <LayoutGrid className="mx-auto size-6 text-[#706e6b]" />
          <p className="mt-2 text-sm font-medium text-[#181818]">Every module is hidden.</p>
          <p className="mt-1 text-sm text-[#706e6b]">Customize the dashboard to add them back.</p>
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((item) => item.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            {visible.map((item) => (
              <SortableHomeModule
                key={item.id}
                item={item}
                editing={editing}
                onHide={() => {
                  commit(setHomeModuleHidden(layout, item.id, true));
                  toast.success(`${HOME_MODULE_LABELS[item.id]} is off this dashboard.`);
                }}
                onSpan={(span) => commit(setHomeModuleSpan(layout, item.id, span))}
              >
                {renderModule(item.id)}
              </SortableHomeModule>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editing && hidden.length > 0 ? (
        <section className="rounded-sm border border-[#c9c9c9] bg-white px-3 py-3">
          <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
            Off this dashboard
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hidden.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => commit(setHomeModuleHidden(layout, item.id, false))}
              >
                <Plus data-icon="inline-start" />
                {HOME_MODULE_LABELS[item.id]}
              </Button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SortableHomeModule({
  item,
  editing,
  children,
  onHide,
  onSpan,
}: {
  item: HomeModulePlacement;
  editing: boolean;
  children: ReactNode;
  onHide: () => void;
  onSpan: (span: HomeModuleSpan) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !editing,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "col-span-1 min-w-0",
        homeModuleSpanClass(item.span),
        isDragging && "z-20 opacity-80",
      )}
    >
      {editing ? (
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
            {HOME_MODULE_LABELS[item.id]}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="cursor-grab touch-none active:cursor-grabbing"
              aria-label={`Move ${HOME_MODULE_LABELS[item.id]}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical />
            </Button>
            <Popover>
              <PopoverTrigger
                type="button"
                className="hover:bg-muted inline-flex size-6 items-center justify-center rounded-[min(var(--radius-md),10px)] text-xs font-semibold text-[#0176d3]"
                aria-label={`Resize ${HOME_MODULE_LABELS[item.id]}`}
              >
                {HOME_SPAN_OPTIONS.find((option) => option.span === item.span)?.label ?? "Size"}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-2">
                <p className="px-1 pb-1.5 text-xs text-muted-foreground">Module width</p>
                <div className="grid grid-cols-2 gap-1">
                  {HOME_SPAN_OPTIONS.map((option) => (
                    <Button
                      key={option.span}
                      type="button"
                      size="sm"
                      variant={option.span === item.span ? "secondary" : "outline"}
                      onClick={() => onSpan(option.span)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onHide}
              aria-label={`Hide ${HOME_MODULE_LABELS[item.id]}`}
            >
              <EyeOff />
            </Button>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
