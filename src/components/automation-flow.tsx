"use client";

import Link from "next/link";
import {
  Bell,
  Clock,
  DollarSign,
  Filter,
  GitBranch,
  Columns3,
  ListTodo,
  Mail,
  MessageSquare,
  Minus,
  Plus,
  Search,
  StickyNote,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_TRIGGERS,
  summarizeAction,
  type AutomationAction,
  type AutomationActionKind,
  type AutomationTriggerKind,
  type WorkflowStep,
  type WorkflowWaitUnit,
} from "@/lib/automations";
import { formatDuration, formatWait } from "@/lib/automations/workflow";
import { cn } from "@/lib/utils";

type RenderAction = (
  action: AutomationAction,
  onChange: (patch: Partial<AutomationAction>) => void,
  onRemove: () => void,
  error: string | undefined,
  section: "settings" | "test",
) => ReactNode;

type Lane = "main" | "yes" | "no" | "timeout";

type Panel =
  | { type: "trigger" }
  | { type: "reply" }
  | { type: "step"; lane: Lane; id: string };

type PaletteBlock =
  | { type: "trigger"; trigger: AutomationTriggerKind }
  | { type: "action"; kind: AutomationActionKind }
  | { type: "wait" }
  | { type: "reply" }
  | { type: "filter" };

type DropTarget = { lane: Lane; index: number };

const BLOCK_MIME = "application/x-truss-block";

const UNITS: { value: WorkflowWaitUnit; label: string }[] = [
  { value: "minutes", label: "minutes" },
  { value: "hours", label: "hours" },
  { value: "days", label: "days" },
];

const TRIGGER_BLOCKS: { trigger: AutomationTriggerKind; label: string }[] = [
  { trigger: "lead_created", label: "New lead created" },
  { trigger: "job_stage_changed", label: "Job stage changed" },
  { trigger: "estimate_won", label: "Proposal won" },
  { trigger: "appointment_scheduled", label: "Appointment booked" },
  { trigger: "invoice_paid", label: "Payment received" },
  { trigger: "job_created", label: "Job created" },
  { trigger: "lead_assigned", label: "Lead assigned" },
  { trigger: "estimate_sent", label: "Proposal sent" },
  { trigger: "estimate_lost", label: "Proposal lost" },
  { trigger: "invoice_sent", label: "Invoice sent" },
  { trigger: "lead_created_after_days", label: "Days after a new lead" },
  { trigger: "job_stage_after_days", label: "Days after a stage" },
  { trigger: "estimate_sent_after_days", label: "Days after a proposal" },
  { trigger: "event_in_days", label: "Days before an event" },
];

const ACTION_BLOCKS: { kind: AutomationActionKind; label: string }[] = [
  { kind: "send_sms", label: "Send text message" },
  { kind: "send_email", label: "Send email" },
  { kind: "notify_staff", label: "Notify a teammate" },
  { kind: "create_task", label: "Create task" },
  { kind: "set_job_stage", label: "Update job stage" },
  { kind: "set_job_value", label: "Update job value" },
  { kind: "add_note", label: "Add a job note" },
  { kind: "webhook", label: "Send webhook" },
];

export function AutomationCanvas({
  triggerLabel,
  triggerDetail,
  triggerError,
  steps,
  onSteps,
  mainErrorPrefix,
  replyOn,
  onReplyOn,
  replyAmount,
  replyUnit,
  onReplyAmount,
  onReplyUnit,
  yesSteps,
  noSteps,
  timeoutSteps,
  onYesSteps,
  onNoSteps,
  onTimeoutSteps,
  fieldErrors,
  renderAction,
  triggerEditor,
  onPickTrigger,
  onUseFilter,
  issueCount,
  runsHref,
}: {
  triggerLabel: string;
  triggerDetail: string;
  triggerError?: boolean;
  steps: WorkflowStep[];
  onSteps: (next: WorkflowStep[]) => void;
  mainErrorPrefix: string;
  replyOn: boolean;
  onReplyOn: (on: boolean) => void;
  replyAmount: string;
  replyUnit: WorkflowWaitUnit;
  onReplyAmount: (value: string) => void;
  onReplyUnit: (unit: WorkflowWaitUnit) => void;
  yesSteps: WorkflowStep[];
  noSteps: WorkflowStep[];
  timeoutSteps: WorkflowStep[];
  onYesSteps: (next: WorkflowStep[]) => void;
  onNoSteps: (next: WorkflowStep[]) => void;
  onTimeoutSteps: (next: WorkflowStep[]) => void;
  fieldErrors: Record<string, string>;
  renderAction: RenderAction;
  triggerEditor: ReactNode;
  onPickTrigger: (kind: AutomationTriggerKind) => void;
  onUseFilter: () => void;
  issueCount: number;
  runsHref?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [hoverDrop, setHoverDrop] = useState<DropTarget | null>(null);
  const dragBlock = useRef<PaletteBlock | null>(null);
  const skipClick = useRef(false);
  const lanes = {
    main: { steps, setSteps: onSteps, errorPrefix: mainErrorPrefix },
    yes: { steps: yesSteps, setSteps: onYesSteps, errorPrefix: "flow.yes" },
    no: { steps: noSteps, setSteps: onNoSteps, errorPrefix: "flow.no" },
    timeout: { steps: timeoutSteps, setSteps: onTimeoutSteps, errorPrefix: "flow.timeout" },
  };
  const openStep = panel?.type === "step" ? findStep(lanes[panel.lane].steps, panel.id) : null;
  const nodeCount =
    1 + steps.length + (replyOn ? 1 + yesSteps.length + noSteps.length + timeoutSteps.length : 0);

  function addTo(lane: Lane, index: number, step: WorkflowStep) {
    const bucket = lanes[lane];
    bucket.setSteps(insertStep(bucket.steps, index, step));
    setPanel({ type: "step", lane, id: step.id });
  }

  function removeFrom(lane: Lane, id: string) {
    const bucket = lanes[lane];
    bucket.setSteps(bucket.steps.filter((step) => step.id !== id));
    if (panel?.type === "step" && panel.id === id) setPanel(null);
  }

  function targetLane(): DropTarget {
    if (panel?.type === "step" && panel.lane !== "main") {
      return { lane: panel.lane, index: lanes[panel.lane].steps.length };
    }
    return { lane: "main", index: steps.length };
  }

  function place(block: PaletteBlock, lane: Lane, index: number) {
    if (block.type === "trigger") {
      onPickTrigger(block.trigger);
      setPanel({ type: "trigger" });
      return;
    }
    if (block.type === "filter") {
      onUseFilter();
      setPanel({ type: "trigger" });
      return;
    }
    if (block.type === "reply") {
      onReplyOn(true);
      setPanel({ type: "reply" });
      return;
    }
    if (block.type === "wait") {
      addTo(lane, index, waitStep());
      return;
    }
    addTo(lane, index, actionStep(block.kind));
  }

  function readBlock(event: DragEvent): PaletteBlock | null {
    if (dragBlock.current) return dragBlock.current;
    const raw = event.dataTransfer.getData(BLOCK_MIME);
    if (!raw) return null;
    try {
      return asBlock(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function onPaletteDragStart(event: DragEvent, block: PaletteBlock) {
    skipClick.current = true;
    dragBlock.current = block;
    event.dataTransfer.setData(BLOCK_MIME, JSON.stringify(block));
    event.dataTransfer.effectAllowed = "copy";
  }

  function onPaletteClick(block: PaletteBlock) {
    if (skipClick.current) return;
    const target = targetLane();
    place(block, target.lane, target.index);
  }

  function dropOn(event: DragEvent, lane: Lane, index: number) {
    event.preventDefault();
    event.stopPropagation();
    setHoverDrop(null);
    const block = readBlock(event);
    if (block) place(block, lane, index);
  }

  const laneProps = {
    fieldErrors,
    hoverDrop,
    onHover: setHoverDrop,
    onDrop: dropOn,
    onPlace: place,
    selected: panel?.type === "step" ? panel : null,
    onOpen: (lane: Lane, id: string) => setPanel({ type: "step", lane, id }),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <BlockPalette
        query={query}
        onQuery={setQuery}
        onDragStart={onPaletteDragStart}
        onDragEnd={() => {
          dragBlock.current = null;
          setHoverDrop(null);
          requestAnimationFrame(() => {
            skipClick.current = false;
          });
        }}
        onClick={onPaletteClick}
      />

      <div
        className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-[#f4f5f7] bg-[radial-gradient(circle,#d5d8e0_1.1px,transparent_1.1px)] bg-[size:18px_18px] dark:bg-[#16181d] dark:bg-[radial-gradient(circle,#2c3038_1.1px,transparent_1.1px)]"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setHoverDrop(null);
          const block = readBlock(event);
          if (!block) return;
          const target = targetLane();
          place(block, target.lane, target.index);
        }}
      >
        <div className="pointer-events-none absolute top-3 right-3 left-3 z-10 flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs shadow-sm">
            <span className={cn("size-2 rounded-full", issueCount > 0 ? "bg-destructive" : "bg-emerald-500")} />
            <span>
              {nodeCount} step{nodeCount === 1 ? "" : "s"} · {issueLabel(issueCount)}
            </span>
          </div>
          <div className="pointer-events-auto flex items-center gap-1 rounded-lg border bg-background p-1 shadow-sm">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.6, Math.round((value - 0.1) * 10) / 10))}>
              <Minus />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.5, Math.round((value + 0.1) * 10) / 10))}>
              <Plus />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setZoom(1)}>
              Fit
            </Button>
          </div>
        </div>

        <div className="min-h-full w-max min-w-full px-10 pt-16 pb-16" style={{ zoom }}>
          <div className="mx-auto flex w-max flex-col items-center">
            <FlowNode
              kicker="Trigger"
              kickerClass="text-blue-600"
              icon={Zap}
              iconClass="bg-blue-500 text-white"
              title={triggerLabel}
              subtitle={triggerDetail}
              selected={panel?.type === "trigger"}
              error={triggerError}
              onOpen={() => setPanel({ type: "trigger" })}
            />
            <StepLane lane="main" steps={steps} errorPrefix={mainErrorPrefix} allowSplit={!replyOn} trailing={replyOn ? "spine" : "plus"} {...laneProps} />
            {replyOn ? (
              <>
                <FlowNode
                  kicker="If / else"
                  kickerClass="text-violet-600"
                  icon={GitBranch}
                  iconClass="bg-violet-500 text-white"
                  title="They replied?"
                  subtitle={`Yes, no, or no reply in ${formatDuration(Number(replyAmount) || 0, replyUnit)}`}
                  selected={panel?.type === "reply"}
                  error={Boolean(fieldErrors.workflow)}
                  onOpen={() => setPanel({ type: "reply" })}
                />
                <Fork>
                  <ForkArm edge="start" title="Yes" titleClass="text-emerald-600">
                    <StepLane lane="yes" steps={yesSteps} errorPrefix="flow.yes" trailing="plus" {...laneProps} />
                  </ForkArm>
                  <ForkArm edge="middle" title="No" titleClass="text-rose-600">
                    <StepLane lane="no" steps={noSteps} errorPrefix="flow.no" trailing="plus" {...laneProps} />
                  </ForkArm>
                  <ForkArm edge="end" title="No reply" titleClass="text-muted-foreground">
                    <StepLane lane="timeout" steps={timeoutSteps} errorPrefix="flow.timeout" trailing="plus" {...laneProps} />
                  </ForkArm>
                </Fork>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {panel ? (
        <Inspector
          panel={panel}
          step={openStep}
          stepMeta={describePanel(panel, lanes, openStep)}
          triggerEditor={triggerEditor}
          replyAmount={replyAmount}
          replyUnit={replyUnit}
          onReplyAmount={onReplyAmount}
          onReplyUnit={onReplyUnit}
          replyError={fieldErrors.workflow}
          waitError={
            panel.type === "step" && openStep
              ? fieldErrors[`${lanes[panel.lane].errorPrefix}.${indexOf(lanes[panel.lane].steps, openStep.id)}`]
              : undefined
          }
          onWaitAmount={(value) => {
            if (panel.type !== "step" || openStep?.kind !== "wait") return;
            lanes[panel.lane].setSteps(replaceStep(lanes[panel.lane].steps, openStep.id, { ...openStep, amount: Number(value) || 0 }));
          }}
          onWaitUnit={(unit) => {
            if (panel.type !== "step" || openStep?.kind !== "wait") return;
            lanes[panel.lane].setSteps(replaceStep(lanes[panel.lane].steps, openStep.id, { ...openStep, unit }));
          }}
          onClose={() => setPanel(null)}
          onDelete={() => {
            if (panel.type === "reply") {
              onReplyOn(false);
              setPanel(null);
              return;
            }
            if (panel.type === "step") removeFrom(panel.lane, panel.id);
          }}
          runsHref={runsHref}
          actionNode={
            panel.type === "step" && openStep?.kind === "action"
              ? renderAction(
                  openStep.action,
                  (patch) => {
                    const bucket = lanes[panel.lane];
                    bucket.setSteps(replaceStep(bucket.steps, openStep.id, { ...openStep, action: { ...openStep.action, ...patch } }));
                  },
                  () => removeFrom(panel.lane, openStep.id),
                  fieldErrors[`${lanes[panel.lane].errorPrefix}.${indexOf(lanes[panel.lane].steps, openStep.id)}`] ||
                    fieldErrors[`${lanes[panel.lane].errorPrefix}.${indexOf(lanes[panel.lane].steps, openStep.id)}.merge`],
                  "settings",
                )
              : null
          }
          actionTest={
            panel.type === "step" && openStep?.kind === "action"
              ? renderAction(openStep.action, () => undefined, () => undefined, undefined, "test")
              : null
          }
        />
      ) : null}
    </div>
  );
}

function BlockPalette({
  query,
  onQuery,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  query: string;
  onQuery: (value: string) => void;
  onDragStart: (event: DragEvent, block: PaletteBlock) => void;
  onDragEnd: () => void;
  onClick: (block: PaletteBlock) => void;
}) {
  const needle = query.trim().toLowerCase();
  const triggers = TRIGGER_BLOCKS.filter((item) => item.label.toLowerCase().includes(needle));
  const actions = ACTION_BLOCKS.filter((item) => item.label.toLowerCase().includes(needle));
  const logic = [
    { block: { type: "reply" } as PaletteBlock, label: "If / else", icon: GitBranch, iconClass: "bg-violet-500" },
    { block: { type: "filter" } as PaletteBlock, label: "Filter", icon: Filter, iconClass: "bg-slate-500" },
    { block: { type: "wait" } as PaletteBlock, label: "Wait (delay)", icon: Clock, iconClass: "bg-slate-700" },
  ].filter((item) => item.label.toLowerCase().includes(needle));

  return (
    <aside className="flex max-h-52 shrink-0 flex-col border-b bg-background md:max-h-none md:w-60 md:border-r md:border-b-0">
      <div className="border-b px-3 py-3">
        <p className="text-sm font-semibold">Blocks</p>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search blocks"
            aria-label="Search blocks"
            className="h-8 pl-7"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <PaletteGroup title="Triggers">
          {triggers.map((item) => (
            <PaletteItem
              key={item.trigger}
              label={item.label}
              icon={Zap}
              iconClass="bg-blue-500"
              onDragStart={(event) => onDragStart(event, { type: "trigger", trigger: item.trigger })}
              onDragEnd={onDragEnd}
              onClick={() => onClick({ type: "trigger", trigger: item.trigger })}
            />
          ))}
        </PaletteGroup>
        <PaletteGroup title="Actions">
          {actions.map((item) => {
            const visuals = actionVisual(item.kind);
            return (
              <PaletteItem
                key={item.kind}
                label={item.label}
                icon={visuals.icon}
                iconClass={visuals.swatch}
                onDragStart={(event) => onDragStart(event, { type: "action", kind: item.kind })}
                onDragEnd={onDragEnd}
                onClick={() => onClick({ type: "action", kind: item.kind })}
              />
            );
          })}
        </PaletteGroup>
        <PaletteGroup title="Logic & timing">
          {logic.map((item) => (
            <PaletteItem
              key={item.label}
              label={item.label}
              icon={item.icon}
              iconClass={item.iconClass}
              onDragStart={(event) => onDragStart(event, item.block)}
              onDragEnd={onDragEnd}
              onClick={() => onClick(item.block)}
            />
          ))}
        </PaletteGroup>
        {triggers.length + actions.length + logic.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">No blocks match.</p>
        ) : null}
      </div>
      <p className="border-t px-3 py-3 text-xs leading-relaxed text-muted-foreground">
        Drag a block onto the canvas, or onto a line to insert it between steps.
      </p>
    </aside>
  );
}

function PaletteGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{title}</p>
      <div className="grid gap-0.5">{children}</div>
    </div>
  );
}

function PaletteItem({
  label,
  icon: Icon,
  iconClass,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  label: string;
  icon: typeof Zap;
  iconClass: string;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
    >
      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-[4px] text-white", iconClass)}>
        <Icon className="size-3" />
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function StepLane({
  lane,
  steps,
  errorPrefix,
  fieldErrors,
  allowSplit,
  trailing,
  hoverDrop,
  onHover,
  onDrop,
  onPlace,
  selected,
  onOpen,
}: {
  lane: Lane;
  steps: WorkflowStep[];
  errorPrefix: string;
  fieldErrors: Record<string, string>;
  allowSplit?: boolean;
  trailing: "plus" | "spine";
  hoverDrop: DropTarget | null;
  onHover: (target: DropTarget | null) => void;
  onDrop: (event: DragEvent, lane: Lane, index: number) => void;
  onPlace: (block: PaletteBlock, lane: Lane, index: number) => void;
  selected: { lane: Lane; id: string } | null;
  onOpen: (lane: Lane, id: string) => void;
}) {
  return (
    <>
      {steps.map((step, index) => (
        <div key={step.id} className="flex flex-col items-center">
          <Spine
            hot={hoverDrop?.lane === lane && hoverDrop.index === index}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onHover({ lane, index });
            }}
            onDrop={(event) => onDrop(event, lane, index)}
          />
          <StepNode
            step={step}
            selected={selected?.lane === lane && selected.id === step.id}
            error={fieldErrors[`${errorPrefix}.${index}`] || fieldErrors[`${errorPrefix}.${index}.merge`]}
            onOpen={() => onOpen(lane, step.id)}
          />
        </div>
      ))}
      {trailing === "plus" ? (
        <PlusDrop
          hot={hoverDrop?.lane === lane && hoverDrop.index === steps.length}
          allowSplit={allowSplit}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onHover({ lane, index: steps.length });
          }}
          onDrop={(event) => onDrop(event, lane, steps.length)}
          onPlace={(block) => onPlace(block, lane, steps.length)}
        />
      ) : (
        <Spine
          hot={hoverDrop?.lane === lane && hoverDrop.index === steps.length}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onHover({ lane, index: steps.length });
          }}
          onDrop={(event) => onDrop(event, lane, steps.length)}
        />
      )}
    </>
  );
}

function StepNode({
  step,
  selected,
  error,
  onOpen,
}: {
  step: WorkflowStep;
  selected: boolean;
  error?: string;
  onOpen: () => void;
}) {
  if (step.kind === "wait") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-semibold tracking-wide shadow-sm",
          selected && "ring-2 ring-blue-500",
          error && "border-destructive",
        )}
      >
        <Clock className="size-3.5 text-muted-foreground" />
        WAIT {formatDuration(step.amount, step.unit)}
      </button>
    );
  }
  const visuals = actionVisual(step.action.kind);
  const named = step.action.kind !== "create_task" ? step.action.title?.trim() : "";
  return (
    <FlowNode
      kicker="Action"
      kickerClass="text-orange-600"
      icon={visuals.icon}
      iconClass={visuals.iconClass}
      title={named || actionLabel(step.action.kind)}
      subtitle={actionSubtitle(step.action)}
      selected={selected}
      error={Boolean(error)}
      onOpen={onOpen}
    />
  );
}

function FlowNode({
  kicker,
  kickerClass,
  icon: Icon,
  iconClass,
  title,
  subtitle,
  selected,
  error,
  onOpen,
}: {
  kicker: string;
  kickerClass: string;
  icon: typeof Zap;
  iconClass: string;
  title: string;
  subtitle: string;
  selected?: boolean;
  error?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-[260px] items-center gap-3 rounded-xl border bg-background px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.06)]",
        selected && "ring-2 ring-blue-500",
        error && "border-destructive",
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", iconClass)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[10px] font-semibold tracking-[0.14em] uppercase", kickerClass)}>{kicker}</span>
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

function Spine({
  hot,
  onDragOver,
  onDrop,
}: {
  hot: boolean;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}) {
  return (
    <div className="flex flex-col items-center py-0.5" onDragOver={onDragOver} onDrop={onDrop}>
      <div className={cn("h-3 w-px", hot ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-600")} />
      <div className={cn("size-2 rounded-full border bg-background", hot ? "border-blue-500" : "border-neutral-300 dark:border-neutral-600")} />
      <div className={cn("h-3 w-px", hot ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-600")} />
    </div>
  );
}

function PlusDrop({
  hot,
  allowSplit,
  onDragOver,
  onDrop,
  onPlace,
}: {
  hot: boolean;
  allowSplit?: boolean;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onPlace: (block: PaletteBlock) => void;
}) {
  return (
    <div className="flex flex-col items-center" onDragOver={onDragOver} onDrop={onDrop}>
      <div className={cn("h-4 w-px", hot ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-600")} />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex size-7 items-center justify-center rounded-full border bg-background text-foreground shadow-sm hover:bg-muted",
                hot && "border-blue-500",
              )}
              aria-label="Add a step"
            />
          }
        >
          <Plus className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-52">
          <DropdownMenuItem onClick={() => onPlace({ type: "action", kind: "send_sms" })}>Send text message</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onPlace({ type: "action", kind: "send_email" })}>Send email</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onPlace({ type: "action", kind: "create_task" })}>Create task</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onPlace({ type: "wait" })}>Wait</DropdownMenuItem>
          {allowSplit ? <DropdownMenuItem onClick={() => onPlace({ type: "reply" })}>If / else</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Fork({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-5 w-px bg-neutral-300 dark:bg-neutral-600" />
      <div className="grid grid-cols-3" style={{ width: 900 }}>
        {children}
      </div>
    </div>
  );
}

function ForkArm({
  edge,
  title,
  titleClass,
  children,
}: {
  edge: "start" | "middle" | "end";
  title: string;
  titleClass: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center px-3 pt-5">
      <div
        className={cn(
          "absolute top-0 h-px bg-neutral-300 dark:bg-neutral-600",
          edge === "start" && "right-0 left-1/2",
          edge === "end" && "right-1/2 left-0",
          edge === "middle" && "right-0 left-0",
        )}
      />
      <div className="absolute top-0 left-1/2 h-5 w-px -translate-x-1/2 bg-neutral-300 dark:bg-neutral-600" />
      <p className={cn("mb-1 text-xs font-semibold", titleClass)}>{title}</p>
      {children}
    </div>
  );
}

function Inspector({
  panel,
  step,
  stepMeta,
  triggerEditor,
  replyAmount,
  replyUnit,
  onReplyAmount,
  onReplyUnit,
  replyError,
  waitError,
  onWaitAmount,
  onWaitUnit,
  onClose,
  onDelete,
  runsHref,
  actionNode,
  actionTest,
}: {
  panel: Panel;
  step: WorkflowStep | null;
  stepMeta: string;
  triggerEditor: ReactNode;
  replyAmount: string;
  replyUnit: WorkflowWaitUnit;
  onReplyAmount: (value: string) => void;
  onReplyUnit: (unit: WorkflowWaitUnit) => void;
  replyError?: string;
  waitError?: string;
  onWaitAmount: (value: string) => void;
  onWaitUnit: (unit: WorkflowWaitUnit) => void;
  onClose: () => void;
  onDelete: () => void;
  runsHref?: string;
  actionNode: ReactNode;
  actionTest: ReactNode;
}) {
  const visuals = inspectorVisual(panel, step);
  const canDelete = panel.type !== "trigger";
  const panelKey = panel.type === "step" ? panel.id : panel.type;

  return (
    <aside className="flex max-h-[46%] w-full shrink-0 flex-col border-t bg-background md:max-h-none md:w-[340px] md:border-t-0 md:border-l">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", visuals.iconClass)}>
          <visuals.icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{visuals.title}</p>
          <p className="truncate text-xs text-muted-foreground">{stepMeta}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Close step" onClick={onClose}>
          <X />
        </Button>
      </div>
      <Tabs key={panelKey} defaultValue="settings" className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" className="w-full justify-start rounded-none border-b px-3">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
          <TabsTrigger value="log">Run log</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="settings" className="px-4 py-4">
            {panel.type === "trigger" ? triggerEditor : null}
            {panel.type === "reply" ? (
              <div className="grid gap-3">
                <p className="text-sm font-medium">Wait for a reply</p>
                <WaitFields amount={replyAmount} unit={replyUnit} onAmount={onReplyAmount} onUnit={onReplyUnit} />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Yes is yeah, ok, or sure. No is nope, stop, or not interested. Anything else leaves the wait open. Silence takes the no-reply path. Checked about every 15 minutes.
                </p>
                {replyError ? <p className="text-sm text-destructive">{replyError}</p> : null}
              </div>
            ) : null}
            {panel.type === "step" && step?.kind === "wait" ? (
              <div className="grid gap-3">
                <p className="text-sm font-medium">How long to wait</p>
                <WaitFields amount={String(step.amount)} unit={step.unit} onAmount={onWaitAmount} onUnit={onWaitUnit} />
                <p className="text-xs text-muted-foreground">Checked about every 15 minutes, so a short wait can land on the next check.</p>
                {waitError ? <p className="text-sm text-destructive">{waitError}</p> : null}
              </div>
            ) : null}
            {actionNode}
          </TabsContent>
          <TabsContent value="test" className="px-4 py-4">
            {actionTest ?? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Test run checks the whole automation against a job. It previews the steps and does not send a text or email.
              </p>
            )}
          </TabsContent>
          <TabsContent value="log" className="px-4 py-4">
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>Runs show up after this automation is published and a job matches the trigger.</p>
              {runsHref ? (
                <Link href={runsHref} className="font-medium text-foreground underline underline-offset-2">
                  Open run log
                </Link>
              ) : (
                <p>Publish this automation to start a run log.</p>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>
      <div className="flex items-center justify-between border-t px-4 py-3">
        {canDelete ? (
          <button type="button" className="text-sm font-medium text-red-600 hover:text-red-700" onClick={onDelete}>
            Delete step
          </button>
        ) : (
          <span />
        )}
        <Button type="button" className="bg-neutral-950 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950" onClick={onClose}>
          Done
        </Button>
      </div>
    </aside>
  );
}

function WaitFields({
  amount,
  unit,
  onAmount,
  onUnit,
}: {
  amount: string;
  unit: WorkflowWaitUnit;
  onAmount: (value: string) => void;
  onUnit: (unit: WorkflowWaitUnit) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        value={amount}
        onChange={(event) => onAmount(event.target.value)}
        className="w-24"
        aria-label="Wait length"
      />
      <Select value={unit} onValueChange={(value) => onUnit(String(value) as WorkflowWaitUnit)}>
        <SelectTrigger className="w-32" aria-label="Wait unit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNITS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function actionVisual(kind: AutomationAction["kind"]) {
  switch (kind) {
    case "send_sms":
      return { icon: MessageSquare, iconClass: "bg-orange-500 text-white", swatch: "bg-orange-500" };
    case "send_email":
      return { icon: Mail, iconClass: "bg-orange-500 text-white", swatch: "bg-orange-500" };
    case "create_task":
      return { icon: ListTodo, iconClass: "bg-orange-500 text-white", swatch: "bg-orange-500" };
    case "notify_staff":
      return { icon: Bell, iconClass: "bg-orange-500 text-white", swatch: "bg-orange-500" };
    case "set_job_value":
      return { icon: DollarSign, iconClass: "bg-orange-500 text-white", swatch: "bg-orange-500" };
    case "set_job_stage":
      return { icon: Columns3, iconClass: "bg-orange-500 text-white", swatch: "bg-orange-500" };
    case "add_note":
      return { icon: StickyNote, iconClass: "bg-orange-500 text-white", swatch: "bg-orange-500" };
    case "webhook":
      return { icon: Webhook, iconClass: "bg-orange-500 text-white", swatch: "bg-orange-500" };
    default:
      return { icon: Zap, iconClass: "bg-orange-500 text-white", swatch: "bg-orange-500" };
  }
}

function inspectorVisual(panel: Panel, step: WorkflowStep | null) {
  if (panel.type === "trigger") return { icon: Zap, iconClass: "bg-blue-500 text-white", title: "Trigger" };
  if (panel.type === "reply") return { icon: GitBranch, iconClass: "bg-violet-500 text-white", title: "If / else" };
  if (step?.kind === "wait") return { icon: Clock, iconClass: "bg-slate-700 text-white", title: formatWait(step.amount, step.unit) };
  if (step?.kind === "action") {
    const visuals = actionVisual(step.action.kind);
    return { icon: visuals.icon, iconClass: visuals.iconClass, title: actionLabel(step.action.kind) };
  }
  return { icon: Zap, iconClass: "bg-muted text-foreground", title: "Step" };
}

function actionLabel(kind: AutomationActionKind) {
  return ACTION_BLOCKS.find((item) => item.kind === kind)?.label ?? AUTOMATION_ACTION_LABELS[kind];
}

function actionSubtitle(action: AutomationAction) {
  if (action.kind === "send_sms" || action.kind === "notify_staff") return `Text · ${recipientShort(action)}`;
  if (action.kind === "send_email") return `Email · ${recipientShort(action)}`;
  if (action.kind === "create_task") return action.title?.trim() || "New task";
  if (action.kind === "set_job_stage") return "Move the job";
  if (action.kind === "set_job_value") return "Set the job value";
  if (action.kind === "webhook") return action.url?.trim() || "POST JSON";
  if (action.kind === "add_note") return clip(action.body || "") || "Note on the job";
  return summarizeAction(action);
}

function recipientShort(action: AutomationAction) {
  switch (action.to) {
    case "rep":
      return "to the job owner";
    case "staff":
      return "to a teammate";
    case "phone":
      return "to a phone number";
    case "group":
      return "to the group";
    case "email":
      return "to an email";
    default:
      return "to the customer";
  }
}

function describePanel(
  panel: Panel,
  lanes: Record<Lane, { steps: WorkflowStep[] }>,
  step: WorkflowStep | null,
) {
  if (panel.type === "trigger") return "When this automation starts";
  if (panel.type === "reply") return "Logic";
  if (panel.type !== "step" || !step) return "Step";
  const index = indexOf(lanes[panel.lane].steps, step.id);
  const kind = step.kind === "wait" ? "Wait" : "Action";
  if (panel.lane === "main") return `Step ${index + 2} · ${kind}`;
  const laneName = panel.lane === "yes" ? "Yes" : panel.lane === "no" ? "No" : "No reply";
  return `${laneName} · ${kind}`;
}

function issueLabel(count: number) {
  if (count === 0) return "no errors";
  if (count === 1) return "1 error";
  return `${count} errors`;
}

function asBlock(value: unknown): PaletteBlock | null {
  if (!value || typeof value !== "object") return null;
  const block = value as PaletteBlock;
  if (block.type === "wait" || block.type === "reply" || block.type === "filter") return block;
  if (block.type === "trigger" && AUTOMATION_TRIGGERS.includes(block.trigger)) return block;
  if (block.type === "action" && AUTOMATION_ACTIONS.includes(block.kind)) return block;
  return null;
}

function findStep(steps: WorkflowStep[], id: string) {
  return steps.find((step) => step.id === id) ?? null;
}

function indexOf(steps: WorkflowStep[], id: string) {
  return steps.findIndex((step) => step.id === id);
}

function insertStep(steps: WorkflowStep[], index: number, step: WorkflowStep) {
  return [...steps.slice(0, index), step, ...steps.slice(index)];
}

function replaceStep(steps: WorkflowStep[], id: string, next: WorkflowStep) {
  return steps.map((step) => (step.id === id ? next : step));
}

function actionStep(kind: AutomationActionKind): WorkflowStep {
  const id = crypto.randomUUID();
  if (kind === "create_task") return { id, kind: "action", action: { id, kind, title: "" } };
  if (kind === "set_job_value") return { id, kind: "action", action: { id, kind, valueMode: "estimate" } };
  if (kind === "set_job_stage") return { id, kind: "action", action: { id, kind, stage: "proposal_sent" } };
  if (kind === "add_note") return { id, kind: "action", action: { id, kind, body: "" } };
  if (kind === "webhook") return { id, kind: "action", action: { id, kind, url: "" } };
  if (kind === "notify_staff") return { id, kind: "action", action: { id, kind, to: "rep", body: "" } };
  if (kind === "send_email") return { id, kind: "action", action: { id, kind, to: "customer", subject: "", body: "" } };
  return { id, kind: "action", action: { id, kind: "send_sms", to: "customer", body: "" } };
}

function waitStep(): WorkflowStep {
  return { id: crypto.randomUUID(), kind: "wait", amount: 1, unit: "days" };
}

function clip(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 39)}…` : clean;
}
