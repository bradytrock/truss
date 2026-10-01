"use client";

import { Clock, Plus } from "lucide-react";
import type { ReactNode } from "react";
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
import type { AutomationAction, WorkflowStep, WorkflowWaitUnit } from "@/lib/automations";

type RenderAction = (
  action: AutomationAction,
  onChange: (patch: Partial<AutomationAction>) => void,
  onRemove: () => void,
  error?: string,
) => ReactNode;

const UNITS: { value: WorkflowWaitUnit; label: string }[] = [
  { value: "minutes", label: "minutes" },
  { value: "hours", label: "hours" },
  { value: "days", label: "days" },
];

export function AutomationCanvas({
  triggerLabel,
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
}: {
  triggerLabel: string;
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
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-muted/40 bg-[radial-gradient(circle,color-mix(in_oklch,var(--foreground)_16%,transparent)_1px,transparent_1px)] bg-[size:18px_18px] p-6">
      <div className="mx-auto flex w-full flex-col items-center">
        <FlowCard kicker="Trigger">{triggerLabel}</FlowCard>
        <StepLane
          steps={steps}
          onSteps={onSteps}
          errorPrefix={mainErrorPrefix}
          fieldErrors={fieldErrors}
          defaultKind="send_sms"
          renderAction={renderAction}
        />
        {replyOn ? (
          <>
            <div className="h-3 w-px bg-border" />
            <FlowCard kicker="Wait for a reply">
              <WaitFields
                amount={replyAmount}
                unit={replyUnit}
                onAmount={onReplyAmount}
                onUnit={onReplyUnit}
              />
              <p className="text-xs text-muted-foreground">
                Yes, no, or silence. A reply counts when it starts with yes, yeah, ok, no, or nope. Checked about every 15 minutes.
              </p>
              {fieldErrors.workflow ? <p className="text-xs text-destructive">{fieldErrors.workflow}</p> : null}
              <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => onReplyOn(false)}>
                Remove split
              </Button>
            </FlowCard>
            <div className="grid w-full gap-4 pt-2 lg:grid-cols-3">
              <BranchLane
                title="Yes"
                steps={yesSteps}
                onSteps={onYesSteps}
                errorPrefix="flow.yes"
                fieldErrors={fieldErrors}
                renderAction={renderAction}
              />
              <BranchLane
                title="No"
                steps={noSteps}
                onSteps={onNoSteps}
                errorPrefix="flow.no"
                fieldErrors={fieldErrors}
                renderAction={renderAction}
              />
              <BranchLane
                title="No reply"
                steps={timeoutSteps}
                onSteps={onTimeoutSteps}
                errorPrefix="flow.timeout"
                fieldErrors={fieldErrors}
                renderAction={renderAction}
              />
            </div>
          </>
        ) : (
          <>
            <div className="h-3 w-px bg-border" />
            <Button type="button" variant="outline" size="sm" onClick={() => onReplyOn(true)}>
              Split on yes, no, or no reply
            </Button>
            <div className="h-3 w-px bg-border" />
            <EndMark />
          </>
        )}
      </div>
    </div>
  );
}

function BranchLane({
  title,
  steps,
  onSteps,
  errorPrefix,
  fieldErrors,
  renderAction,
}: {
  title: string;
  steps: WorkflowStep[];
  onSteps: (next: WorkflowStep[]) => void;
  errorPrefix: string;
  fieldErrors: Record<string, string>;
  renderAction: RenderAction;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border bg-background/80 p-3">
      <div className="mb-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium">{title}</div>
      <StepLane
        steps={steps}
        onSteps={onSteps}
        errorPrefix={errorPrefix}
        fieldErrors={fieldErrors}
        defaultKind="create_task"
        renderAction={renderAction}
      />
      <div className="h-3 w-px bg-border" />
      <EndMark />
    </div>
  );
}

function StepLane({
  steps,
  onSteps,
  errorPrefix,
  fieldErrors,
  defaultKind,
  renderAction,
}: {
  steps: WorkflowStep[];
  onSteps: (next: WorkflowStep[]) => void;
  errorPrefix: string;
  fieldErrors: Record<string, string>;
  defaultKind: "send_sms" | "create_task";
  renderAction: RenderAction;
}) {
  return (
    <>
      <InsertStep
        onAction={() => onSteps(insertStep(steps, 0, actionStep(defaultKind)))}
        onWait={() => onSteps(insertStep(steps, 0, waitStep()))}
      />
      {steps.map((step, index) => (
        <div key={step.id} className="flex w-full flex-col items-center">
          {step.kind === "wait" ? (
            <FlowCard kicker="Wait">
              <WaitFields
                amount={String(step.amount)}
                unit={step.unit}
                onAmount={(value) => onSteps(replaceStep(steps, step.id, { ...step, amount: Number(value) || 0 }))}
                onUnit={(unit) => onSteps(replaceStep(steps, step.id, { ...step, unit }))}
              />
              <p className="text-xs text-muted-foreground">Checked about every 15 minutes.</p>
              {fieldErrors[`${errorPrefix}.${index}`] ? (
                <p className="text-xs text-destructive">{fieldErrors[`${errorPrefix}.${index}`]}</p>
              ) : null}
              <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => onSteps(steps.filter((item) => item.id !== step.id))}>
                Remove wait
              </Button>
            </FlowCard>
          ) : (
            <div className="w-full">
              {renderAction(
                step.action,
                (patch) =>
                  onSteps(
                    replaceStep(steps, step.id, {
                      ...step,
                      action: { ...step.action, ...patch },
                    }),
                  ),
                () => onSteps(steps.filter((item) => item.id !== step.id)),
                fieldErrors[`${errorPrefix}.${index}`] || fieldErrors[`${errorPrefix}.${index}.merge`],
              )}
            </div>
          )}
          <InsertStep
            onAction={() => onSteps(insertStep(steps, index + 1, actionStep(defaultKind)))}
            onWait={() => onSteps(insertStep(steps, index + 1, waitStep()))}
          />
        </div>
      ))}
    </>
  );
}

function InsertStep({ onAction, onWait }: { onAction: () => void; onWait: () => void }) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-3 w-px bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="outline" size="icon-sm" className="rounded-full bg-background" aria-label="Add a step" />}
        >
          <Plus />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-40">
          <DropdownMenuItem onClick={onAction}>Add action</DropdownMenuItem>
          <DropdownMenuItem onClick={onWait}>
            <Clock data-icon="inline-start" />
            Add wait
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="h-3 w-px bg-border" />
    </div>
  );
}

function FlowCard({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <div className="grid w-full max-w-lg gap-2 rounded-xl border bg-background px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{kicker}</p>
      <div className="grid gap-2 text-sm">{children}</div>
    </div>
  );
}

function EndMark() {
  return <div className="rounded-full border bg-background px-4 py-1 text-xs font-medium text-muted-foreground">End</div>;
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

function insertStep(steps: WorkflowStep[], index: number, step: WorkflowStep) {
  return [...steps.slice(0, index), step, ...steps.slice(index)];
}

function replaceStep(steps: WorkflowStep[], id: string, next: WorkflowStep) {
  return steps.map((step) => (step.id === id ? next : step));
}

function actionStep(kind: "send_sms" | "create_task"): WorkflowStep {
  const id = crypto.randomUUID();
  if (kind === "create_task") {
    return { id, kind: "action", action: { id, kind: "create_task", title: "" } };
  }
  return { id, kind: "action", action: { id, kind: "send_sms", to: "customer", body: "" } };
}

function waitStep(): WorkflowStep {
  return { id: crypto.randomUUID(), kind: "wait", amount: 1, unit: "hours" };
}
