"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Bell, Calendar, Check, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { initials, localYmd } from "@/lib/format";
import { formatTaskAssignees, normalizeTaskAssignees, taskAssignees, taskNotes } from "@/lib/task-desk";
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
  defaultTitle,
  lockRelated,
  unsavedGuard = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  defaultRelatedType?: Task["relatedType"];
  defaultRelatedId?: string | null;
  defaultTitle?: string;
  lockRelated?: boolean;
  unsavedGuard?: boolean;
}) {
  const { jobs, opportunities, contacts, clients, teamMembers, user, addTask, updateTask, deleteTask } = useCrm();
  const people = teamMembers.length > 0 ? teamMembers : [user.name].filter(Boolean);
  const defaultAssignee = user.name || people[0] || "";
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(localYmd(new Date()));
  const [assignees, setAssignees] = useState<string[]>(defaultAssignee ? [defaultAssignee] : []);
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
      setAssignees(taskAssignees(task).length ? taskAssignees(task) : defaultAssignee ? [defaultAssignee] : []);
      setKind(relatedKind(task));
      setRelatedId(task.relatedId ?? "");
      setNotes(taskNotes(task));
      return;
    }
    const preset = relatedKind({ relatedType: defaultRelatedType ?? null });
    setTitle(defaultTitle ?? "");
    setDueAt(localYmd(new Date()));
    setAssignees(defaultAssignee ? [defaultAssignee] : []);
    setKind(preset);
    setRelatedId(defaultRelatedId ?? "");
    setNotes("");
  }, [open, task, defaultAssignee, defaultRelatedId, defaultRelatedType, defaultTitle]);

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
    const people = normalizeTaskAssignees(assignees);
    if (!people.length) {
      toast.error("Assign at least one person.");
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
          assignee: people[0] ?? "",
          assignees: people,
          relatedType,
          relatedId: nextRelatedId,
          notes: notes.trim(),
        });
        toast.success("Task updated.");
      } else {
        const created = await addTask({
          title: title.trim(),
          dueAt,
          assignee: people[0] ?? "",
          assignees: people,
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
  const selected = normalizeTaskAssignees(assignees);
  const roster = normalizeTaskAssignees([...people, ...selected]);

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
    <Dialog unsavedGuard={unsavedGuard} open={open} onOpenChange={onOpenChange}>
      <DialogContent className={quickDialogClass("lg")}>
        <QuickHeader
          tone="slate"
          icon={<CheckSquare className="size-5" />}
          title={editing ? "Edit task" : "New task"}
          description="One task on the desk, shared by everyone you assign."
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
              <div className="max-h-44 overflow-y-auto rounded-lg border bg-white p-1">
                {roster.map((name) => {
                  const on = selected.some((person) => person.toLowerCase() === name.toLowerCase());
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setAssignees((current) => {
                          const has = current.some((person) => person.toLowerCase() === name.toLowerCase());
                          if (has) {
                            const next = current.filter((person) => person.toLowerCase() !== name.toLowerCase());
                            if (!next.length) {
                              toast.message("A task needs at least one person.");
                              return current;
                            }
                            return next;
                          }
                          return normalizeTaskAssignees([...current, name]);
                        });
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                        on ? "bg-[#f4f4f5]" : "hover:bg-muted/50"
                      }`}
                    >
                      <span
                        className={`grid size-4 shrink-0 place-items-center rounded-[4px] border ${
                          on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-white"
                        }`}
                      >
                        {on ? <Check className="size-3" /> : null}
                      </span>
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-900 text-[10px] font-medium text-white">
                        {initials(name)}
                      </span>
                      <span className="min-w-0 truncate">{name === user.name ? `${name} (you)` : name}</span>
                    </button>
                  );
                })}
              </div>
              <QuickHint>
                {selected.length > 1
                  ? `${formatTaskAssignees({ assignees: selected })} share this task.`
                  : "Add anyone else who should have this same task."}
              </QuickHint>
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
                  One email to each person when it’s due or overdue
                </span>
              )
            }
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
