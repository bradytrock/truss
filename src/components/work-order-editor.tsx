"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  addWorkOrderField,
  addWorkOrderItem,
  canRemoveWorkOrderField,
  canRemoveWorkOrderItem,
  isJobBoundWorkOrderField,
  patchWorkOrderField,
  patchWorkOrderItem,
  removeWorkOrderField,
  removeWorkOrderItem,
  workOrderFieldValue,
} from "@/lib/work-order";
import type { Job, Opportunity, PhotoReportWorkOrderPage } from "@/lib/types";

export function WorkOrderEditor({
  page,
  job,
  opportunity,
  title,
  onTitleChange,
  onChange,
}: {
  page: PhotoReportWorkOrderPage;
  job: Job;
  opportunity?: Opportunity | null;
  title: string;
  onTitleChange: (title: string) => void;
  onChange: (page: PhotoReportWorkOrderPage) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[28rem] flex-col gap-3">
      <section className="rounded-xl border bg-background px-3 py-3 shadow-sm">
        <p className="text-[11px] text-muted-foreground">Document title</p>
        <Input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          className="mt-1 h-8 border-0 bg-transparent px-0 text-base font-medium shadow-none"
          aria-label="Work order title"
        />
      </section>

      <section className="rounded-xl border bg-background px-3 py-3 shadow-sm">
        <p className="text-[11px] text-muted-foreground">Heading</p>
        <Input
          value={page.heading}
          onChange={(event) => onChange({ ...page, heading: event.target.value })}
          className="mt-1 h-8 border-0 bg-transparent px-0 text-base font-medium shadow-none"
          aria-label="Work order heading"
        />
      </section>

      <section className="rounded-xl border bg-background px-3 py-2 shadow-sm">
        <p className="px-0.5 pt-1 text-[11px] text-muted-foreground">Detail fields</p>
        <ul className="mt-1 divide-y">
          {page.fields.map((field) => (
            <li key={field.id} className="flex items-center gap-3 py-2">
              <Input
                value={field.label}
                onChange={(event) =>
                  onChange(patchWorkOrderField(page, field.id, { label: event.target.value }))
                }
                className="h-8 w-[7.5rem] shrink-0 border-0 bg-transparent px-0.5 text-sm shadow-none"
                aria-label={`${field.label || "Field"} label`}
              />
              <Input
                value={workOrderFieldValue(field, job, opportunity)}
                onChange={(event) =>
                  onChange(patchWorkOrderField(page, field.id, { value: event.target.value }))
                }
                readOnly={isJobBoundWorkOrderField(field)}
                placeholder={isJobBoundWorkOrderField(field) ? "Job site" : "Value"}
                className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0.5 text-sm shadow-none"
                aria-label={
                  isJobBoundWorkOrderField(field)
                    ? "Property from this job"
                    : field.label || "Field value"
                }
              />
              {canRemoveWorkOrderField(field) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={`Remove ${field.label || "field"}`}
                  onClick={() => onChange(removeWorkOrderField(page, field.id))}
                >
                  −
                </Button>
              ) : (
                <span className="w-6 shrink-0" aria-hidden />
              )}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 text-primary"
          onClick={() => onChange(addWorkOrderField(page))}
        >
          <Plus data-icon="inline-start" />
          Add field
        </Button>
      </section>

      <section className="rounded-xl border bg-background px-3 py-3 shadow-sm">
        <p className="text-[11px] text-muted-foreground">Heading</p>
        <Input
          value={page.tasksHeading}
          onChange={(event) => onChange({ ...page, tasksHeading: event.target.value })}
          className="mt-1 h-8 border-0 bg-transparent px-0 text-base font-medium shadow-none"
          aria-label="Tasks heading"
        />
      </section>

      <section className="rounded-xl border bg-background px-3 py-2 shadow-sm">
        <p className="px-0.5 pt-1 text-[11px] text-muted-foreground">Checklist</p>
        <ul className="mt-1 divide-y">
          {page.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 py-2">
              <Checkbox
                checked={item.done}
                onCheckedChange={(value) =>
                  onChange(patchWorkOrderItem(page, item.id, { done: Boolean(value) }))
                }
                aria-label={`Mark ${item.text || "task"} complete`}
              />
              <Input
                value={item.text}
                onChange={(event) =>
                  onChange(patchWorkOrderItem(page, item.id, { text: event.target.value }))
                }
                placeholder="Checklist item"
                className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0.5 text-sm shadow-none"
                aria-label={item.text || "Checklist item"}
              />
              {canRemoveWorkOrderItem(item) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={`Remove ${item.text || "item"}`}
                  onClick={() => onChange(removeWorkOrderItem(page, item.id))}
                >
                  −
                </Button>
              ) : (
                <span className="w-6 shrink-0" aria-hidden />
              )}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 text-primary"
          onClick={() => onChange(addWorkOrderItem(page))}
        >
          <Plus data-icon="inline-start" />
          Add item
        </Button>
      </section>
    </div>
  );
}
