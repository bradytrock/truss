"use client";

import { useMemo, useState } from "react";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { TaskRow } from "@/components/task-row";
import { EmptyState, ErrorBanner, LoadingScreen, Metric, MetricStrip, PageHeader } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCrm } from "@/lib/crm-store";
import {
  filterTasks,
  searchTasks,
  sortTasks,
  TASK_FILTER_LABELS,
  TASK_FILTERS,
  taskIsOverdue,
  taskRelatedHref,
  taskRelatedLabel,
  type TaskFilter,
} from "@/lib/task-desk";
import type { Task } from "@/lib/types";

export default function TasksPage() {
  const crm = useCrm();
  const viewerName = crm.effectiveStaff?.name || crm.user.name || "";
  const [filter, setFilter] = useState<TaskFilter>(viewerName ? "mine" : "open");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const counts = useMemo(() => {
    const open = crm.tasks.filter((task) => !task.completed);
    return {
      mine: filterTasks(crm.tasks, "mine", viewerName).length,
      open: open.length,
      overdue: open.filter(taskIsOverdue).length,
      done: crm.tasks.filter((task) => task.completed).length,
    };
  }, [crm.tasks, viewerName]);

  const rows = useMemo(() => {
    return sortTasks(searchTasks(filterTasks(crm.tasks, filter, viewerName), query));
  }, [crm.tasks, filter, query, viewerName]);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Work"
        title="Tasks"
        description="Create work, assign a person and a deadline, check it off, and get one email when it is due or overdue."
        actions={
          <Button onClick={() => setCreateOpen(true)}>New task</Button>
        }
      />
      <MetricStrip className="sm:grid-cols-4">
        <Metric label="Mine" value={String(counts.mine)} />
        <Metric label="Open" value={String(counts.open)} />
        <Metric label="Overdue" value={String(counts.overdue)} hint={counts.overdue ? "Needs a date or a check" : undefined} />
        <Metric label="Done" value={String(counts.done)} />
      </MetricStrip>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(value) => setFilter((value as TaskFilter) ?? "open")}>
          <TabsList>
            {TASK_FILTERS.map((item) => (
              <TabsTrigger key={item} value={item}>
                {TASK_FILTER_LABELS[item]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tasks"
          className="sm:w-56"
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title={query.trim() ? "No matching tasks" : filter === "done" ? "Nothing finished yet" : "No tasks here"}
          description={
            query.trim()
              ? "Try another name or word."
              : "Add a task, assign someone, and set a deadline. It shows on Home and emails the assignee when it is due."
          }
          action={<Button onClick={() => setCreateOpen(true)}>New task</Button>}
        />
      ) : (
        <ul className="divide-y divide-[#e5e5e5] overflow-hidden rounded-sm border border-[#c9c9c9] bg-white">
          {rows.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              relatedLabel={taskRelatedLabel(task, crm.jobs, crm.opportunities)}
              relatedHref={taskRelatedHref(task)}
              onToggle={() => void crm.toggleTask(task.id)}
              onOpen={() => setEditing(task)}
            />
          ))}
        </ul>
      )}
      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CreateTaskDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        task={editing}
      />
    </div>
  );
}
