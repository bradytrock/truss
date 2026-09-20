"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useCrm } from "@/lib/crm-store";
import { localYmd } from "@/lib/format";
import { taskNotes } from "@/lib/task-desk";
import type { Task } from "@/lib/types";

type RelatedKind = "none" | "job" | "opportunity";

function relatedKind(task: Pick<Task, "relatedType"> | null | undefined): RelatedKind {
  if (task?.relatedType === "job") return "job";
  if (task?.relatedType === "opportunity") return "opportunity";
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
  const { jobs, opportunities, teamMembers, user, addTask, updateTask, deleteTask } = useCrm();
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
        : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            Assign a person, set a deadline, and it lands on the Tasks desk. Due and overdue work
            emails the assignee once.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Title" htmlFor="task-title">
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Call Dana back"
              autoFocus
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Deadline" htmlFor="task-due">
              <Input
                id="task-due"
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </Field>
            <Field label="Assign to">
              <Select
                value={assignee || defaultAssignee}
                onValueChange={(value) => setAssignee(String(value ?? defaultAssignee))}
                items={people.map((name) => ({ value: name, label: name }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {people.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {lockRelated ? (
            lockedLabel ? (
              <p className="text-sm text-muted-foreground">Tied to {lockedLabel}.</p>
            ) : null
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tied to">
                <Select
                  value={kind}
                  onValueChange={(value) => {
                    const next = (value as RelatedKind) || "none";
                    setKind(next);
                    if (next === "none") setRelatedId("");
                  }}
                  items={[
                    { value: "none", label: "Nothing" },
                    { value: "job", label: "Job" },
                    { value: "opportunity", label: "Lead" },
                  ]}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nothing</SelectItem>
                    <SelectItem value="job">Job</SelectItem>
                    <SelectItem value="opportunity">Lead</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {kind === "job" ? (
                <Field label="Job">
                  <Select
                    value={relatedId || "none"}
                    onValueChange={(value) => setRelatedId(value === "none" ? "" : String(value ?? ""))}
                    items={[
                      { value: "none", label: "Pick a job" },
                      ...jobs.map((job) => ({
                        value: job.id,
                        label: [job.code, job.name].filter(Boolean).join(" · "),
                      })),
                    ]}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Pick a job</SelectItem>
                      {jobs.map((job) => (
                        <SelectItem key={job.id} value={job.id}>
                          {[job.code, job.name].filter(Boolean).join(" · ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              {kind === "opportunity" ? (
                <Field label="Lead">
                  <Select
                    value={relatedId || "none"}
                    onValueChange={(value) => setRelatedId(value === "none" ? "" : String(value ?? ""))}
                    items={[
                      { value: "none", label: "Pick a lead" },
                      ...opportunities.map((opportunity) => ({
                        value: opportunity.id,
                        label: [opportunity.code, opportunity.name].filter(Boolean).join(" · "),
                      })),
                    ]}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Pick a lead</SelectItem>
                      {opportunities.map((opportunity) => (
                        <SelectItem key={opportunity.id} value={opportunity.id}>
                          {[opportunity.code, opportunity.name].filter(Boolean).join(" · ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
            </div>
          )}
          <Field label="Notes" htmlFor="task-notes">
            <Textarea
              id="task-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What done looks like"
              rows={3}
            />
          </Field>
          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button type="button" variant="ghost" onClick={() => void handleDelete()} disabled={pending}>
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : editing ? "Save task" : "Add task"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
