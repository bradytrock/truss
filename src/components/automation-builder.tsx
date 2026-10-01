"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AutomationCanvas } from "@/components/automation-flow";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_ACTIONS,
  AUTOMATION_CONDITION_FIELD_LABELS,
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_MERGE_FIELD_LABELS,
  AUTOMATION_MERGE_FIELDS,
  AUTOMATION_OPERATOR_LABELS,
  AUTOMATION_OPERATORS,
  AUTOMATION_TRIGGER_LABELS,
  AUTOMATION_TRIGGERS,
  AUTOMATION_VALUE_MODE_LABELS,
  AUTOMATION_VALUE_MODES,
  buildAutomationMerge,
  defaultRequiresConfirmation,
  summarizeTrigger,
  validateAutomationDraft,
  workflowOf,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTriggerKind,
  type AutomationValueMode,
  type WorkflowStep,
  type WorkflowWaitUnit,
} from "@/lib/automations";
import { estimateTotalForContext, previewActionLine } from "@/lib/automations/queue";
import { smsSegmentCount } from "@/lib/automations/merge";
import { useCrm } from "@/lib/crm-store";
import { documentOwnerStaff } from "@/lib/document-owner";
import { leadSourceChoices, leadSourceLabel } from "@/lib/leads";
import { JOB_MARKET_LABELS, JOB_STATUS_LABELS, PROJECT_TYPE_LABELS, type Job } from "@/lib/types";
import { WORK_COLUMN_LABELS, WORK_COLUMNS } from "@/lib/work-board";

const STAGE_OPTIONS = WORK_COLUMNS.filter((column) => column !== "deleted");

function mostRecentJob(jobs: Job[]) {
  return [...jobs].sort((left, right) => (right.startDate ?? "").localeCompare(left.startDate ?? ""))[0];
}

export function AutomationBuilder({ automationId }: { automationId?: string }) {
  const crm = useCrm();
  const router = useRouter();
  const existing = automationId ? crm.book.automations.find((item) => item.id === automationId) : undefined;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [triggerKind, setTriggerKind] = useState<AutomationTriggerKind>(existing?.triggerKind ?? "job_stage_changed");
  const [stage, setStage] = useState(existing?.triggerConfig.stage ?? "complete");
  const [days, setDays] = useState(String(existing?.triggerConfig.days ?? 3));
  const [conditions, setConditions] = useState<AutomationCondition[]>(existing?.conditions ?? []);
  const existingWorkflow = workflowOf(existing?.triggerConfig);
  const [steps, setSteps] = useState<WorkflowStep[]>(() => {
    if (existingWorkflow && existingWorkflow.steps.length > 0) return existingWorkflow.steps;
    return (existing?.actions ?? []).map((action) => ({ id: action.id, kind: "action" as const, action }));
  });
  const [replyOn, setReplyOn] = useState(Boolean(existingWorkflow?.reply));
  const [replyAmount, setReplyAmount] = useState(String(existingWorkflow?.reply?.amount ?? 24));
  const [replyUnit, setReplyUnit] = useState<WorkflowWaitUnit>(existingWorkflow?.reply?.unit ?? "hours");
  const [yesSteps, setYesSteps] = useState<WorkflowStep[]>(existingWorkflow?.reply?.yes ?? []);
  const [noSteps, setNoSteps] = useState<WorkflowStep[]>(existingWorkflow?.reply?.no ?? []);
  const [timeoutSteps, setTimeoutSteps] = useState<WorkflowStep[]>(existingWorkflow?.reply?.timeout ?? []);
  const [confirmationOverride, setConfirmationOverride] = useState<boolean | null>(
    existing ? existing.requiresConfirmation : null,
  );
  const [oncePerJob, setOncePerJob] = useState(existing?.oncePerJob ?? true);
  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const [smsConfigured, setSmsConfigured] = useState<boolean | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewJobId, setPreviewJobId] = useState("");

  useEffect(() => {
    void fetch("/api/messages/send")
      .then((response) => response.json())
      .then((payload) => setSmsConfigured(Boolean(payload?.configured)))
      .catch(() => setSmsConfigured(false));
  }, []);

  const newestJob = mostRecentJob(crm.jobs);
  const selectedPreviewId = previewJobId || newestJob?.id || "";

  const previewJob = crm.getJob(selectedPreviewId) ?? newestJob;
  const previewContact = previewJob
    ? crm.getContact(previewJob.primaryContactId) ?? crm.contacts[0]
    : crm.contacts[0];
  const previewOwner = previewJob
    ? documentOwnerStaff({
        job: previewJob,
        opportunity: previewJob.opportunityId ? crm.getOpportunity(previewJob.opportunityId) : undefined,
        staff: crm.book.staff,
      })
    : crm.effectiveStaff;
  const previewTotal = previewJob ? estimateTotalForContext(crm.book, previewJob) : null;
  const merge = useMemo(
    () =>
      buildAutomationMerge({
        company: crm.company,
        staff: previewOwner,
        job: previewJob,
        contact: previewContact,
        estimateTotal: previewTotal,
        reviewUrl:
          crm.googleLocations.find((location) => location.isDefault)?.reviewUrl ||
          crm.googleLocations[0]?.reviewUrl ||
          "",
      }),
    [crm.company, crm.googleLocations, previewContact, previewJob, previewOwner, previewTotal],
  );
  const mainActions = useMemo(
    () => steps.flatMap((step) => (step.kind === "action" ? [step.action] : [])),
    [steps],
  );
  const flowOn =
    replyOn ||
    [steps, yesSteps, noSteps, timeoutSteps].some((list) => list.some((step) => step.kind === "wait"));
  const requiresConfirmation = confirmationOverride ?? defaultRequiresConfirmation(mainActions);

  const draft = useMemo(
    () => ({
      name,
      triggerKind,
      triggerConfig: {
        ...(needsStage(triggerKind) ? { stage } : {}),
        ...(needsDays(triggerKind) ? { days: Number(days) || 0 } : {}),
        ...(flowOn
          ? {
              workflow: {
                enabled: true as const,
                steps,
                ...(replyOn
                  ? {
                      reply: {
                        amount: Number(replyAmount) || 0,
                        unit: replyUnit,
                        yes: yesSteps,
                        no: noSteps,
                        timeout: timeoutSteps,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      },
      conditions,
      actions: mainActions,
    }),
    [
      conditions,
      days,
      flowOn,
      mainActions,
      name,
      noSteps,
      replyAmount,
      replyOn,
      replyUnit,
      stage,
      steps,
      timeoutSteps,
      triggerKind,
      yesSteps,
    ],
  );
  const validation = validateAutomationDraft(draft, { smsConfigured });
  const snapshot = JSON.stringify({
    name,
    description,
    triggerKind,
    stage,
    days,
    conditions,
    steps,
    replyOn,
    replyAmount,
    replyUnit,
    yesSteps,
    noSteps,
    timeoutSteps,
    confirmationOverride,
    oncePerJob,
    enabled,
  });
  const [initialSnapshot] = useState(snapshot);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const saveLabel =
    savedSnapshot === snapshot ? "Saved just now" : snapshot !== initialSnapshot ? "Unsaved changes" : "";

  async function save(nextEnabled = enabled) {
    setAttemptedSave(true);
    if (!validation.ok) {
      toast.error(validation.errors[0] ?? "Fix the highlighted fields.");
      return;
    }
    setSaving(true);
    const saved = await crm.saveAutomation({
      id: existing?.id,
      name,
      description,
      triggerKind,
      triggerConfig: draft.triggerConfig,
      conditions,
      actions: draft.actions,
      requiresConfirmation,
      oncePerJob,
      enabled: nextEnabled,
    });
    setSaving(false);
    if (!saved) return;
    setEnabled(nextEnabled);
    setSavedSnapshot(
      JSON.stringify({
        name,
        description,
        triggerKind,
        stage,
        days,
        conditions,
        steps,
        replyOn,
        replyAmount,
        replyUnit,
        yesSteps,
        noSteps,
        timeoutSteps,
        confirmationOverride,
        oncePerJob,
        enabled: nextEnabled,
      }),
    );
    toast.success(nextEnabled ? "Automation published." : "Automation saved.");
    if (!existing) router.push(`/settings/automations/${saved.id}`);
  }

  async function test() {
    const job = previewJob ?? newestJob;
    if (!existing || !job) {
      toast.error(existing ? "Add a job first so we can dry-run against it." : "Publish the automation first, then test it.");
      return;
    }
    const result = await crm.testAutomation(existing.id, job.id);
    if (result) toast.message(result);
  }

  return (
    <div className="-m-5 flex h-[calc(100dvh-3rem)] flex-col overflow-hidden bg-background sm:-m-7">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Link href="/settings/automations" className="shrink-0 text-sm text-muted-foreground hover:text-foreground">
          Automations
        </Link>
        <span className="text-muted-foreground">/</span>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name this automation"
          aria-label="Automation name"
          aria-invalid={validation.fieldErrors.name ? true : undefined}
          className="h-8 max-w-sm border-transparent bg-transparent px-1 text-sm font-medium shadow-none focus-visible:border-border"
        />
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
          {enabled ? "LIVE" : "DRAFT"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {saveLabel ? <span className="hidden text-xs text-muted-foreground sm:inline">{saveLabel}</span> : null}
          <Button type="button" variant="outline" onClick={() => void test()}>
            Test run
          </Button>
          <Button
            type="button"
            className="bg-neutral-950 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
            onClick={() => void save(true)}
            disabled={saving}
          >
            {saving ? "Publishing…" : "Publish"}
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Automation settings" onClick={() => setSettingsOpen(true)}>
            <Settings2 />
          </Button>
        </div>
      </header>
      {attemptedSave && validation.errors[0] ? (
        <p className="shrink-0 border-b bg-destructive/5 px-4 py-2 text-sm text-destructive">{validation.errors[0]}</p>
      ) : null}

      <AutomationCanvas
        triggerLabel={summarizeTrigger(triggerKind, draft.triggerConfig)}
        triggerDetail={conditions.length === 0 ? "Any job" : `${conditions.length} filter${conditions.length === 1 ? "" : "s"}`}
        triggerError={Boolean(validation.fieldErrors.trigger) || Object.keys(validation.fieldErrors).some((key) => key.startsWith("condition."))}
        steps={steps}
        onSteps={setSteps}
        mainErrorPrefix={flowOn ? "flow.main" : "action"}
        replyOn={replyOn}
        onReplyOn={setReplyOn}
        replyAmount={replyAmount}
        replyUnit={replyUnit}
        onReplyAmount={setReplyAmount}
        onReplyUnit={setReplyUnit}
        yesSteps={yesSteps}
        noSteps={noSteps}
        timeoutSteps={timeoutSteps}
        onYesSteps={setYesSteps}
        onNoSteps={setNoSteps}
        onTimeoutSteps={setTimeoutSteps}
        fieldErrors={validation.fieldErrors}
        onPickTrigger={setTriggerKind}
        onUseFilter={() => {
          setConditions((current) =>
            current.length > 0
              ? current
              : [...current, { id: crypto.randomUUID(), field: "job.city", operator: "eq", value: "" }],
          );
        }}
        issueCount={validation.errors.length}
        runsHref={existing ? `/settings/automations/${existing.id}/runs` : undefined}
        renderAction={(action, onChange, _onRemove, error, section) => (
          <ActionCard
            action={action}
            error={error}
            staff={crm.book.staff}
            merge={merge}
            estimateTotal={previewTotal}
            previewJobName={previewJob ? `${previewJob.code} · ${previewJob.name}` : ""}
            jobs={crm.jobs.map((job) => ({ id: job.id, label: `${job.code} · ${job.name}` }))}
            previewJobId={previewJob?.id ?? ""}
            onPreviewJob={setPreviewJobId}
            onChange={onChange}
            section={section}
          />
        )}
        triggerEditor={
          <div className="grid gap-4">
          <Field label="Trigger">
            <Select
              value={triggerKind}
              onValueChange={(value) => setTriggerKind(String(value) as AutomationTriggerKind)}
              items={AUTOMATION_TRIGGERS.map((kind) => ({
                value: kind,
                label: AUTOMATION_TRIGGER_LABELS[kind],
              }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_TRIGGERS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {AUTOMATION_TRIGGER_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {needsStage(triggerKind) ? (
            <Field label="Stage" error={validation.fieldErrors.trigger}>
              <Select
                value={stage}
                onValueChange={(value) => setStage(String(value) as typeof stage)}
                items={STAGE_OPTIONS.map((column) => ({
                  value: column,
                  label: WORK_COLUMN_LABELS[column],
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((column) => (
                    <SelectItem key={column} value={column}>
                      {WORK_COLUMN_LABELS[column]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {needsDays(triggerKind) ? (
            <Field label="Days" error={validation.fieldErrors.trigger}>
              <Input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </Field>
          ) : null}
          <div className="grid gap-3">
            <p className="text-sm font-medium">Filters</p>
            <p className="text-xs text-muted-foreground">Optional. All of these are true.</p>
          {conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No extra filters. The trigger is enough.</p>
          ) : (
            conditions.map((condition, index) => (
              <div key={condition.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_8rem_1fr_auto]">
                <Select
                  value={condition.field}
                  onValueChange={(value) =>
                    patchCondition(conditions, setConditions, condition.id, { field: String(value) as AutomationCondition["field"] })
                  }
                  items={AUTOMATION_CONDITION_FIELDS.map((field) => ({
                    value: field,
                    label: AUTOMATION_CONDITION_FIELD_LABELS[field],
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTOMATION_CONDITION_FIELDS.map((field) => (
                      <SelectItem key={field} value={field}>
                        {AUTOMATION_CONDITION_FIELD_LABELS[field]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={condition.operator}
                  onValueChange={(value) =>
                    patchCondition(conditions, setConditions, condition.id, {
                      operator: String(value) as AutomationCondition["operator"],
                    })
                  }
                  items={AUTOMATION_OPERATORS.map((operator) => ({
                    value: operator,
                    label: AUTOMATION_OPERATOR_LABELS[operator],
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTOMATION_OPERATORS.map((operator) => (
                      <SelectItem key={operator} value={operator}>
                        {AUTOMATION_OPERATOR_LABELS[operator]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {condition.operator === "is_set" || condition.operator === "is_empty" ? (
                  <p className="self-center text-xs text-muted-foreground">No value needed</p>
                ) : (
                  <ConditionValue
                    condition={condition}
                    staff={crm.book.staff}
                    onChange={(value) => patchCondition(conditions, setConditions, condition.id, { value })}
                  />
                )}
                <Button variant="ghost" size="sm" onClick={() => setConditions(conditions.filter((item) => item.id !== condition.id))}>
                  Remove
                </Button>
                {validation.fieldErrors[`condition.${index}`] ? (
                  <p className="text-xs text-destructive sm:col-span-4">{validation.fieldErrors[`condition.${index}`]}</p>
                ) : null}
              </div>
            ))
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              setConditions([
                ...conditions,
                { id: crypto.randomUUID(), field: "job.city", operator: "eq", value: "" },
              ])
            }
          >
            Add condition
          </Button>
          </div>
          </div>
        }
      />

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>Name, confirmation, and how often this runs.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4 pb-6">
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional. Shown on the automations list."
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(value === true)} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={requiresConfirmation}
                onCheckedChange={(value) => setConfirmationOverride(value === true)}
              />
              Ask before sending
            </label>
            <p className="text-xs text-muted-foreground">
              {mainActions.length === 0 || defaultRequiresConfirmation(mainActions)
                ? "On by default for texts and emails to a customer or a number you type. The job owner confirms on Home or the job. Job value and stage changes in the same rule wait with that message."
                : "Job updates, notes, and texts to your own team run on their own. Turn this on if you still want a yes first."}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={oncePerJob} onCheckedChange={(value) => setOncePerJob(value === true)} />
              Only run once per job
            </label>
            <p className="text-xs text-muted-foreground">
              Publish turns this automation on. Save settings keeps the Active box as it is.
            </p>
            <Button type="button" variant="outline" className="w-fit" onClick={() => void save(enabled)} disabled={saving}>
              Save settings
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function recipientOptions(kind: AutomationAction["kind"]) {
  if (kind === "notify_staff") {
    return [
      { value: "rep", label: "Job owner" },
      { value: "staff", label: "A teammate" },
    ];
  }
  if (kind === "send_email") {
    return [
      { value: "customer", label: "Customer" },
      { value: "rep", label: "Job owner" },
      { value: "staff", label: "A teammate" },
      { value: "email", label: "An email address" },
    ];
  }
  return [
    { value: "customer", label: "Customer" },
    { value: "rep", label: "Job owner" },
    { value: "staff", label: "A teammate" },
    { value: "phone", label: "A phone number" },
    { value: "group", label: "Group message" },
  ];
}

function patchForKind(action: AutomationAction, kind: AutomationAction["kind"]): Partial<AutomationAction> {
  if (kind === "set_job_value") return { kind, valueMode: action.valueMode ?? "estimate" };
  if (kind === "set_job_stage") return { kind, stage: action.stage || "proposal_sent" };
  if (kind === "add_note") return { kind };
  if (kind === "notify_staff") return { kind, to: action.to === "staff" ? "staff" : "rep" };
  if (kind === "send_email") {
    const to = action.to === "phone" ? "email" : action.to === "group" ? "customer" : action.to ?? "customer";
    return { kind, to };
  }
  if (kind === "send_sms") {
    const to = action.to === "email" ? "phone" : action.to ?? "customer";
    return { kind, to };
  }
  return { kind };
}

function needsStage(kind: AutomationTriggerKind) {
  return kind === "job_stage_changed" || kind === "job_stage_after_days";
}

function needsDays(kind: AutomationTriggerKind) {
  return (
    kind === "job_stage_after_days" ||
    kind === "lead_created_after_days" ||
    kind === "estimate_sent_after_days" ||
    kind === "event_in_days"
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function patchCondition(
  conditions: AutomationCondition[],
  setConditions: (next: AutomationCondition[]) => void,
  id: string,
  patch: Partial<AutomationCondition>,
) {
  setConditions(conditions.map((item) => (item.id === id ? { ...item, ...patch } : item)));
}

function ConditionValue({
  condition,
  staff,
  onChange,
}: {
  condition: AutomationCondition;
  staff: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  if (condition.field === "job.stage") {
    return (
      <Select
        value={condition.value}
        onValueChange={(value) => onChange(String(value))}
        items={STAGE_OPTIONS.map((column) => ({ value: column, label: WORK_COLUMN_LABELS[column] }))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGE_OPTIONS.map((column) => (
            <SelectItem key={column} value={column}>
              {WORK_COLUMN_LABELS[column]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (condition.field === "job.status") {
    return (
      <Select
        value={condition.value}
        onValueChange={(value) => onChange(String(value))}
        items={Object.entries(JOB_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (condition.field === "job.projectType") {
    return (
      <Select
        value={condition.value}
        onValueChange={(value) => onChange(String(value))}
        items={Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (condition.field === "job.leadSource") {
    const choices = leadSourceChoices(condition.value);
    return (
      <Select
        value={condition.value}
        onValueChange={(value) => onChange(String(value))}
        items={choices.map((value) => ({ value, label: leadSourceLabel(value) || value }))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((value) => (
            <SelectItem key={value} value={value}>
              {leadSourceLabel(value) || value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (condition.field === "job.market") {
    return (
      <Select
        value={condition.value}
        onValueChange={(value) => onChange(String(value))}
        items={Object.entries(JOB_MARKET_LABELS).map(([value, label]) => ({ value, label }))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(JOB_MARKET_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (condition.field === "rep.id") {
    return (
      <Select
        value={condition.value}
        onValueChange={(value) => onChange(String(value))}
        items={staff.map((member) => ({ value: member.id, label: member.name }))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {staff.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return <Input value={condition.value} onChange={(event) => onChange(event.target.value)} />;
}

function ActionCard({
  action,
  error,
  staff,
  merge,
  estimateTotal,
  previewJobName,
  jobs,
  previewJobId,
  onPreviewJob,
  onChange,
  section = "settings",
}: {
  action: AutomationAction;
  error?: string;
  staff: { id: string; name: string; phone?: string; email?: string }[];
  merge: ReturnType<typeof buildAutomationMerge>;
  estimateTotal: number | null;
  previewJobName: string;
  jobs: { id: string; label: string }[];
  previewJobId: string;
  onPreviewJob: (id: string) => void;
  onChange: (patch: Partial<AutomationAction>) => void;
  section?: "settings" | "test";
}) {
  const preview = previewActionLine(action, merge, estimateTotal);
  const sms = action.kind === "send_sms" || action.kind === "notify_staff" ? smsSegmentCount(preview) : null;
  const messageKind = action.kind === "send_sms" || action.kind === "send_email" || action.kind === "notify_staff";
  const recipients = recipientOptions(action.kind);

  function insertMerge(field: string) {
    const target = action.kind === "create_task" ? "title" : "body";
    const current = (target === "title" ? action.title : action.body) ?? "";
    const token = `{{${field}}}`;
    const next = current && !/\s$/.test(current) ? `${current} ${token}` : `${current}${token}`;
    onChange({ [target]: next });
  }

  if (section === "test") {
    return (
      <div className="grid gap-3">
        {action.kind === "webhook" ? (
          <p className="text-sm text-muted-foreground">Webhook steps post the job payload. Test run does not call the URL.</p>
        ) : (
          <div className="rounded-md bg-muted/60 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
              {jobs.length > 0 ? (
                <Select
                  value={previewJobId}
                  onValueChange={(value) => onPreviewJob(String(value))}
                  items={jobs.map((job) => ({ value: job.id, label: job.label }))}
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap text-sm">{preview || "Nothing to preview yet."}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {previewJobName ? `Using ${previewJobName}. ` : "No job in this company yet. "}
              {sms ? `${sms.chars} characters · ${sms.segments} SMS segment${sms.segments === 1 ? "" : "s"}. ` : null}
              Test run does not send.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {action.kind === "create_task" ? null : (
        <Field label="Step name">
          <Input
            value={action.title ?? ""}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="Intro text to homeowner"
          />
        </Field>
      )}
      <Field label="Action">
        <Select
          value={action.kind}
          onValueChange={(value) => onChange(patchForKind(action, String(value) as AutomationAction["kind"]))}
          items={AUTOMATION_ACTIONS.map((kind) => ({ value: kind, label: AUTOMATION_ACTION_LABELS[kind] }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTOMATION_ACTIONS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {AUTOMATION_ACTION_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {action.kind === "send_sms" || action.kind === "notify_staff" ? (
        <Field label="Send from">
          <Input readOnly value="This office's text line" />
        </Field>
      ) : null}
      {messageKind ? (
        <Field label="Send to">
          <Select
            value={action.to ?? (action.kind === "notify_staff" ? "rep" : "customer")}
            onValueChange={(value) => onChange({ to: String(value) as AutomationAction["to"] })}
            items={recipients}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {recipients.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {action.kind === "set_job_value" ? (
        <Field label="Job value">
          <Select
            value={action.valueMode ?? "estimate"}
            onValueChange={(value) => onChange({ valueMode: String(value) as AutomationValueMode })}
            items={AUTOMATION_VALUE_MODES.map((mode) => ({
              value: mode,
              label: AUTOMATION_VALUE_MODE_LABELS[mode],
            }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTOMATION_VALUE_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {AUTOMATION_VALUE_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {action.kind === "set_job_value" && (action.valueMode ?? "estimate") === "amount" ? (
        <CurrencyInput
          value={action.amount ?? ""}
          onValueChange={(text) => {
            const amount = Number(text);
            onChange({ amount: text === "" || text === "." || !Number.isFinite(amount) ? undefined : amount });
          }}
        />
      ) : null}
      {action.kind === "set_job_stage" ? (
        <Field label="Stage">
          <Select
            value={action.stage || "proposal_sent"}
            onValueChange={(value) => onChange({ stage: String(value) as AutomationAction["stage"] })}
            items={STAGE_OPTIONS.map((column) => ({
              value: column,
              label: WORK_COLUMN_LABELS[column],
            }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map((column) => (
                <SelectItem key={column} value={column}>
                  {WORK_COLUMN_LABELS[column]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {action.to === "staff" ? (
        <Field label="Teammate">
          <Select
            value={action.staffId ?? ""}
            onValueChange={(value) => onChange({ staffId: String(value) })}
            items={staff.map((member) => ({ value: member.id, label: member.name }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {staff.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {action.to === "phone" ? (
        <Field label="Phone number">
          <Input
            value={action.phone ?? ""}
            onChange={(event) => onChange({ phone: event.target.value })}
            placeholder="(214) 555-0100"
          />
        </Field>
      ) : null}
      {action.to === "email" ? (
        <Field label="Email address">
          <Input
            type="email"
            value={action.email ?? ""}
            onChange={(event) => onChange({ email: event.target.value })}
            placeholder="name@example.com"
          />
        </Field>
      ) : null}
      {action.kind === "send_email" ? (
        <Field label="Subject">
          <Input
            value={action.subject ?? ""}
            onChange={(event) => onChange({ subject: event.target.value })}
            placeholder="Subject"
          />
          <p className="text-xs text-muted-foreground">
            Also texts that person&apos;s mobile through this office&apos;s Photon project. Email is the backup if the text cannot send.
          </p>
        </Field>
      ) : null}
      {action.kind === "create_task" ? (
        <Field label="Task title">
          <Input
            value={action.title ?? ""}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="Call them back"
          />
        </Field>
      ) : null}
      {action.kind === "webhook" ? (
        <Field label="Webhook URL">
          <Input
            value={action.url ?? ""}
            onChange={(event) => onChange({ url: event.target.value })}
            placeholder="https://example.com/hooks/truss"
          />
        </Field>
      ) : null}
      {action.kind === "send_sms" ||
      action.kind === "send_email" ||
      action.kind === "notify_staff" ||
      action.kind === "add_note" ? (
        <Field label={action.kind === "add_note" ? "Note" : "Message"}>
          <Textarea
            value={action.body ?? ""}
            onChange={(event) => onChange({ body: event.target.value })}
            placeholder={
              action.kind === "add_note"
                ? "Note on the job. Merge fields work here too."
                : "Hi {{contactName}}, this is {{staffName}} with {{companyName}}."
            }
            rows={5}
          />
        </Field>
      ) : null}
      {action.kind === "create_task" ||
      action.kind === "webhook" ||
      action.kind === "set_job_value" ||
      action.kind === "set_job_stage" ? null : (
        <div className="flex flex-wrap gap-1.5">
          {AUTOMATION_MERGE_FIELDS.map((field) => (
            <button
              key={field}
              type="button"
              className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              onClick={() => insertMerge(field)}
            >
              + {AUTOMATION_MERGE_FIELD_LABELS[field]}
            </button>
          ))}
        </div>
      )}
      {action.kind === "send_sms" && action.to === "group" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          One iMessage group for the homeowners on the job. The job needs at least two mobile numbers.
        </p>
      ) : null}
      {action.kind === "send_sms" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Add an If / else after this text to take a yes, no, or no-reply path.
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
