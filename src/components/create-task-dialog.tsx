"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Bell, Calendar, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { initials, localYmd } from "@/lib/format";
import { taskNotes } from "@/lib/task-desk";
import type { Task } from "@/lib/types";
import {
  QuickFooter,
  QuickHeader,
  QuickHint,
  QuickLabel,
  RecordSearch,
  type SearchOption,
  duePresetDate,
  formatWeekdayDate,
  matchingDuePreset,
  quickDialogBodyClass,
  quickDialogClass,
  quickFieldClass,
  type DuePreset,
} from "@/components/quick-action-form";

type RelatedKind = "none" | "job" | "opportunity" | "client";

function relatedKind(task: Pick<Task, "relatedType"> | null | undefined): RelatedKind {
  if (task?.relatedType === "job") return "job";
  if (task?.relatedType === "opportunity") return "opportunity";
  if (task?.relatedType === "client") return "client";
  return "none";
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  task,
  defaultRelatedType,
  defaultRelatedId,
  lockRelated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  defaultRelatedType?: Task["relatedType"];
  defaultRelatedId?: string | null;
  lockRelated?: boolean;
}) {
  const { jobs, opportunities, contacts, clients, teamMembers, user, addTask, updateTask, deleteTask } = useCrm();
  const people = teamMembers.length > 0 ? teamMembers : [user.name].filter(Boolean);
  const defaultAssignee = user.name || people[0] || "";
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(localYmd(new Date()));
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [kind, setKind] = useState<RelatedKind>("none");
  const [relatedId, setRelatedId] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const editing = Boolean(task);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setDueAt(task.dueAt);
      setAssignee(task.assignee || defaultAssignee);
      setKind(relatedKind(task));
      setRelatedId(task.relatedId ?? "");
      setNotes(taskNotes(task));
      return;
    }
    const preset = relatedKind({ relatedType: defaultRelatedType ?? null });
    setTitle("");
    setDueAt(localYmd(new Date()));
    setAssignee(defaultAssignee);
    setKind(preset);
    setRelatedId(defaultRelatedId ?? "");
    setNotes("");
  }, [open, task, defaultAssignee, defaultRelatedId, defaultRelatedType]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("Give the task a title.");
      return;
    }
    if (!dueAt) {
      toast.error("Pick a deadline.");
      return;
    }
    const relatedType = kind === "none" ? null : kind;
    const nextRelatedId = kind === "none" ? null : relatedId || null;
    setPending(true);
    try {
      if (task) {
        await updateTask(task.id, {
          title: title.trim(),
          dueAt,
          assignee: assignee || defaultAssignee,
          relatedType,
          relatedId: nextRelatedId,
          notes: notes.trim(),
        });
        toast.success("Task updated.");
      } else {
        const created = await addTask({
          title: title.trim(),
          dueAt,
          assignee: assignee || defaultAssignee,
          relatedType,
          relatedId: nextRelatedId,
          notes: notes.trim(),
        });
        if (!created) return;
        toast.success("Task added to the list.");
      }
      onOpenChange(false);
    } catch {
      // Store already toasted.
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    setPending(true);
    try {
      await deleteTask(task.id);
      toast.success("Task removed.");
      onOpenChange(false);
    } catch {
      // Store already toasted.
    } finally {
      setPending(false);
    }
  }

  const lockedLabel =
    kind === "job"
      ? jobs.find((item) => item.id === relatedId)?.name || "This job"
      : kind === "opportunity"
        ? opportunities.find((item) => item.id === relatedId)?.name || "This lead"
        : kind === "client"
          ? clients.find((item) => item.id === relatedId)?.name ||
            contacts.find((item) => item.clientId === relatedId)?.name ||
            "This contact"
          : "";

  const tieOptions: SearchOption[] = [
    ...jobs.map((job) => ({
      value: `job:${job.id}`,
      label: [job.code, job.name].filter(Boolean).join(" · ") || "Job",
      group: "Jobs",
    })),
    ...opportunities.map((opportunity) => ({
      value: `opportunity:${opportunity.id}`,
      label: [opportunity.code, opportunity.name].filter(Boolean).join(" · ") || "Lead",
      group: "Leads",
    })),
    ...contacts.map((contact) => ({
      value: `contact:${contact.id}`,
      label: contact.name,
      hint: contact.title || "Contact",
      group: "Contacts",
    })),
  ];
  if (kind === "client" && relatedId && !contacts.some((contact) => contact.clientId === relatedId)) {
    tieOptions.push({
      value: `client:${relatedId}`,
      label: clients.find((item) => item.id === relatedId)?.name || "Company",
      hint: "Company",
      group: "Contacts",
    });
  }
  const tieValue =
    kind === "client" && relatedId
      ? contacts.find((contact) => contact.clientId === relatedId)
        ? `contact:${contacts.find((contact) => contact.clientId === relatedId)?.id}`
        : `client:${relatedId}`
      : kind !== "none" && relatedId
        ? `${kind}:${relatedId}`
        : "";
  const duePreset = matchingDuePreset(dueAt);
  const assigneeName = assignee || defaultAssignee;

  function chooseTie(value: string) {
    const splitAt = value.indexOf(":");
    const type = value.slice(0, splitAt);
    const id = value.slice(splitAt + 1);
    if (type === "job" || type === "opportunity") {
      setKind(type);
      setRelatedId(id);
      return;
    }
    if (type === "client") {
      setKind("client");
      setRelatedId(id);
      return;
    }
    if (type === "contact") {
      const contact = contacts.find((item) => item.id === id);
      if (!contact?.clientId) {
        toast.message("That contact isn’t on a company. Tie the task to their lead or job.");
        return;
      }
      setKind("client");
      setRelatedId(contact.clientId);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={quickDialogClass("lg")}>
        <QuickHeader
          tone="slate"
          icon={<CheckSquare className="size-5" />}
          title={editing ? "Edit task" : "New task"}
          description="Lands on the Tasks desk for whoever you assign."
        />
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${quickDialogBodyClass} flex-1 space-y-4 px-5 py-4`}>
            <div>
              <QuickLabel htmlFor="task-title" required>What needs to happen?</QuickLabel>
              <Input
                id="task-title"
                className={quickFieldClass}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Call Dana back"
                autoFocus
              />
            </div>
            <div>
              <QuickLabel>Due</QuickLabel>
              <div className="flex flex-wrap items-center gap-2">
                {(["today", "tomorrow", "friday", "next_week"] as DuePreset[]).map((preset) => {
                  const on = duePreset === preset;
                  const labels: Record<DuePreset, string> = {
                    today: "Today",
                    tomorrow: "Tomorrow",
                    friday: "Friday",
                    next_week: "Next week",
                  };
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDueAt(duePresetDate(preset))}
                      className={`inline-flex h-9 items-center rounded-full border px-3 text-sm ${
                        on ? "border-primary text-primary" : "border-border bg-white text-foreground hover:bg-muted/40"
                      }`}
                    >
                      {labels[preset]}
                    </button>
                  );
                })}
                <div className="relative">
                  <span
                    className={`grid size-9 place-items-center rounded-full border bg-white ${
                      duePreset ? "border-border text-muted-foreground" : "border-primary text-primary"
                    }`}
                  >
                    <Calendar className="size-4" />
                  </span>
                  <input
                    type="date"
                    aria-label="Pick a due date"
                    value={dueAt}
                    onChange={(event) => setDueAt(event.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </div>
              </div>
              <QuickHint>Due {formatWeekdayDate(dueAt)}</QuickHint>
            </div>
            <div>
              <QuickLabel>Assign to</QuickLabel>
              <Select
                value={assigneeName}
                onValueChange={(value) => setAssignee(String(value ?? defaultAssignee))}
                items={people.map((name) => ({
                  value: name,
                  label: name === user.name ? `${name} (you)` : name,
                }))}
              >
                <SelectTrigger className="h-10 w-full rounded-lg bg-white data-[size=default]:h-10">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-900 text-[10px] font-medium text-white">
                      {initials(assigneeName)}
                    </span>
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {people.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name === user.name ? `${name} (you)` : name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {lockRelated ? (
              lockedLabel ? (
                <p className="text-sm text-muted-foreground">Tied to {lockedLabel}.</p>
              ) : null
            ) : (
              <div>
                <QuickLabel optional>Tied to</QuickLabel>
                <RecordSearch
                  label="Tied to"
                  placeholder="Link a job, lead or contact"
                  value={tieValue}
                  onChange={chooseTie}
                  options={tieOptions}
                  emptyText="No matching jobs, leads, or contacts."
                />
              </div>
            )}
            <div>
              <QuickLabel htmlFor="task-notes" optional>Notes</QuickLabel>
              <Textarea
                id="task-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="What does done look like?"
                rows={3}
                className="min-h-24 rounded-lg bg-white"
              />
            </div>
          </div>
          <QuickFooter
            onCancel={() => onOpenChange(false)}
            pending={pending}
            submitLabel={editing ? "Save task" : "Add task"}
            note={
              editing ? (
                <Button type="button" variant="ghost" onClick={() => void handleDelete()} disabled={pending}>
                  Delete
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Bell className="size-3.5" />
                  One email when it’s due or overdue
                </span>
              )
            }
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
