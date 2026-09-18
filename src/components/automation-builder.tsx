"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  applyAutomationMerge,
  buildAutomationMerge,
  defaultRequiresConfirmation,
  smsSegmentCount,
  summarizeTrigger,
  validateAutomationDraft,
  type Automation,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTriggerKind,
} from "@/lib/automations";
import { useCrm } from "@/lib/crm-store";
import { documentOwnerStaff } from "@/lib/document-owner";
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
  const [actions, setActions] = useState<AutomationAction[]>(existing?.actions ?? []);
  const [requiresConfirmation, setRequiresConfirmation] = useState(
    existing?.requiresConfirmation ?? true,
  );
  const [oncePerJob, setOncePerJob] = useState(existing?.oncePerJob ?? true);
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [smsConfigured, setSmsConfigured] = useState<boolean | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [previewJobId, setPreviewJobId] = useState("");

  useEffect(() => {
    void fetch("/api/messages/send")
      .then((response) => response.json())
      .then((payload) => setSmsConfigured(Boolean(payload?.configured)))
      .catch(() => setSmsConfigured(false));
  }, []);

  const newestJob = mostRecentJob(crm.jobs);
  useEffect(() => {
    if (!previewJobId && newestJob) setPreviewJobId(newestJob.id);
  }, [newestJob, previewJobId]);

  const previewJob = crm.getJob(previewJobId) ?? newestJob;
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
  const merge = useMemo(
    () =>
      buildAutomationMerge({
        company: crm.company,
        staff: previewOwner,
        job: previewJob,
        contact: previewContact,
        reviewUrl:
          crm.googleLocations.find((location) => location.isDefault)?.reviewUrl ||
          crm.googleLocations[0]?.reviewUrl ||
          "",
      }),
    [crm.company, previewContact, previewJob, previewOwner],
  );

  const draft = useMemo(
    () => ({
      name,
      triggerKind,
      triggerConfig: {
        ...(needsStage(triggerKind) ? { stage } : {}),
        ...(needsDays(triggerKind) ? { days: Number(days) || 0 } : {}),
      },
      conditions,
      actions,
    }),
    [actions, conditions, days, name, stage, triggerKind],
  );
  const validation = validateAutomationDraft(draft, { smsConfigured });

  async function save() {
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
      actions,
      requiresConfirmation,
      oncePerJob,
      enabled,
    });
    setSaving(false);
    if (!saved) return;
    toast.success("Automation saved.");
    if (!existing) router.push(`/settings/automations/${saved.id}`);
  }

  async function test() {
    const job = previewJob ?? newestJob;
    if (!existing || !job) {
      toast.error(existing ? "Add a job first so we can dry-run against it." : "Save the automation first, then test it.");
      return;
    }
    const result = await crm.testAutomation(existing.id, job.id);
    if (result) toast.message(result);
  }

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        eyebrow="Settings"
        title={existing ? existing.name || "Edit automation" : "New automation"}
        description="When something happens, if these are true, then do this. Customer texts ask before sending unless you turn that off."
        actions={
          <div className="flex gap-2">
            <Button render={<Link href="/settings/automations" />} variant="outline" nativeButton={false}>
              Back
            </Button>
            {existing ? (
              <Button variant="outline" onClick={() => void test()}>
                Test this automation
              </Button>
            ) : null}
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      />

      {validation.errors.length > 0 ? (
        <p className="text-sm text-destructive">{validation.errors[0]}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Automation</CardTitle>
          <CardDescription>Name it so the team recognizes it on a job.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Name" error={validation.fieldErrors.name}>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Review request on close" />
          </Field>
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
              onCheckedChange={(value) => setRequiresConfirmation(value === true)}
            />
            Ask before sending
          </label>
          <p className="text-xs text-muted-foreground">
            {defaultRequiresConfirmation(actions)
              ? "On by default for customer texts and emails. The job owner confirms on Home or the job."
              : "Internal actions can send without asking. Turn this on if you still want a yes first."}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={oncePerJob} onCheckedChange={(value) => setOncePerJob(value === true)} />
            Only send once per job
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>When</CardTitle>
          <CardDescription>{summarizeTrigger(triggerKind, draft.triggerConfig)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>If</CardTitle>
          <CardDescription>Optional. All of these are true.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Then</CardTitle>
          <CardDescription>One or more actions. Messages support merge fields.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {actions.map((action, index) => (
            <ActionCard
              key={action.id}
              action={action}
              error={validation.fieldErrors[`action.${index}`] || validation.fieldErrors[`action.${index}.merge`]}
              staff={crm.book.staff}
              merge={merge}
              previewJobName={previewJob ? `${previewJob.code} · ${previewJob.name}` : ""}
              jobs={crm.jobs.map((job) => ({ id: job.id, label: `${job.code} · ${job.name}` }))}
              previewJobId={previewJob?.id ?? ""}
              onPreviewJob={setPreviewJobId}
              onChange={(patch) =>
                setActions(actions.map((item) => (item.id === action.id ? { ...item, ...patch } : item)))
              }
              onRemove={() => setActions(actions.filter((item) => item.id !== action.id))}
            />
          ))}
          {validation.fieldErrors.actions ? (
            <p className="text-sm text-destructive">{validation.fieldErrors.actions}</p>
          ) : null}
          {validation.fieldErrors.sms ? (
            <p className="text-sm text-destructive">{validation.fieldErrors.sms}</p>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              setActions([
                ...actions,
                { id: crypto.randomUUID(), kind: "send_sms", to: "customer", body: "" },
              ])
            }
          >
            Add action
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function needsStage(kind: AutomationTriggerKind) {
  return kind === "job_stage_changed" || kind === "job_stage_after_days";
}

function needsDays(kind: AutomationTriggerKind) {
  return kind === "job_stage_after_days" || kind === "estimate_sent_after_days" || kind === "event_in_days";
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
  previewJobName,
  jobs,
  previewJobId,
  onPreviewJob,
  onChange,
  onRemove,
}: {
  action: AutomationAction;
  error?: string;
  staff: { id: string; name: string }[];
  merge: ReturnType<typeof buildAutomationMerge>;
  previewJobName: string;
  jobs: { id: string; label: string }[];
  previewJobId: string;
  onPreviewJob: (id: string) => void;
  onChange: (patch: Partial<AutomationAction>) => void;
  onRemove: () => void;
}) {
  const preview = applyAutomationMerge(action.body ?? action.title ?? "", merge);
  const sms = action.kind === "send_sms" || action.kind === "notify_staff" ? smsSegmentCount(preview) : null;

  function insertMerge(field: string) {
    const target = action.kind === "create_task" ? "title" : "body";
    const current = (target === "title" ? action.title : action.body) ?? "";
    onChange({ [target]: `${current}{{${field}}}` });
  }

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          value={action.kind}
          onValueChange={(value) => onChange({ kind: String(value) as AutomationAction["kind"] })}
          items={AUTOMATION_ACTIONS.map((kind) => ({ value: kind, label: AUTOMATION_ACTION_LABELS[kind] }))}
        >
          <SelectTrigger className="w-56">
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
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>
      {action.kind === "send_sms" || action.kind === "send_email" || action.kind === "notify_staff" ? (
        <Select
          value={action.to ?? (action.kind === "notify_staff" ? "rep" : "customer")}
          onValueChange={(value) => onChange({ to: String(value) as AutomationAction["to"] })}
          items={[
            ...(action.kind === "notify_staff"
              ? [
                  { value: "rep", label: "Job owner" },
                  { value: "staff", label: "A specific teammate" },
                ]
              : [
                  { value: "customer", label: "Customer" },
                  { value: "rep", label: "Job owner" },
                ]),
          ]}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {action.kind === "notify_staff" ? (
              <>
                <SelectItem value="rep">Job owner</SelectItem>
                <SelectItem value="staff">A specific teammate</SelectItem>
              </>
            ) : (
              <>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="rep">Job owner</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      ) : null}
      {action.to === "staff" ? (
        <Select
          value={action.staffId ?? ""}
          onValueChange={(value) => onChange({ staffId: String(value) })}
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
      ) : null}
      {action.kind === "send_email" ? (
        <Input
          value={action.subject ?? ""}
          onChange={(event) => onChange({ subject: event.target.value })}
          placeholder="Subject"
        />
      ) : null}
      {action.kind === "create_task" ? (
        <Input
          value={action.title ?? ""}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Task title"
        />
      ) : null}
      {action.kind === "webhook" ? (
        <Input
          value={action.url ?? ""}
          onChange={(event) => onChange({ url: event.target.value })}
          placeholder="https://example.com/hooks/truss"
        />
      ) : null}
      {action.kind !== "webhook" && action.kind !== "create_task" ? (
        <Textarea
          value={action.body ?? ""}
          onChange={(event) => onChange({ body: event.target.value })}
          placeholder="Write the message. Use merge fields for names and the job."
          rows={4}
        />
      ) : null}
      {action.kind === "create_task" ? null : action.kind === "webhook" ? null : (
        <div className="flex flex-wrap gap-1">
          {AUTOMATION_MERGE_FIELDS.map((field) => (
            <Button
              key={field}
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => insertMerge(field)}
            >
              {`{{${field}}}`} {AUTOMATION_MERGE_FIELD_LABELS[field]}
            </Button>
          ))}
        </div>
      )}
      {action.kind !== "webhook" ? (
        <div className="rounded-md bg-muted/60 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Live preview</p>
            {jobs.length > 0 ? (
              <Select
                value={previewJobId}
                onValueChange={(value) => onPreviewJob(String(value))}
                items={jobs.map((job) => ({ value: job.id, label: job.label }))}
              >
                <SelectTrigger size="sm" className="w-56">
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
            {sms ? `${sms.chars} characters · ${sms.segments} SMS segment${sms.segments === 1 ? "" : "s"}` : null}
          </p>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
