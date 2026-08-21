"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { formatRelative } from "@/lib/format";
import { ACTIVITY_LABELS, type Activity, type ActivityType } from "@/lib/types";
import { cn } from "@/lib/utils";

const types = ["note", "call", "email", "meeting", "site_walk"] as const;

export function ActivityComposer({
  entityType,
  entityId,
}: {
  entityType: "opportunity" | "job" | "client";
  entityId: string;
}) {
  const { addActivity } = useCrm();
  const [body, setBody] = useState("");
  const [type, setType] = useState<Exclude<ActivityType, "stage_change" | "audit">>("note");

  function submit() {
    if (!body.trim()) {
      toast.error("Write a note, call recap, or meeting summary first.");
      return;
    }
    addActivity({ entityType, entityId, type, body: body.trim() });
    setBody("");
    toast.success("Logged to the record.");
  }

  return (
    <div className="border bg-card p-3">
      <div className="mb-2 flex flex-wrap gap-1">
        {types.map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={type === item ? "secondary" : "ghost"}
            onClick={() => setType(item)}
          >
            {ACTIVITY_LABELS[item]}
          </Button>
        ))}
      </div>
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="What happened? Bid recap, owner call, site walk notes..."
        rows={3}
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={submit}>
          Log activity
        </Button>
      </div>
    </div>
  );
}

export function ActivityList({
  items,
  empty,
}: {
  items: Activity[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ol className="space-y-0">
      {items.map((activity, index) => (
        <li key={activity.id} className="relative flex gap-3 pb-5 last:pb-0">
          {index !== items.length - 1 ? (
            <span className="absolute top-6 bottom-0 left-[7px] w-px bg-border" />
          ) : null}
          <span
            className={cn(
              "relative z-10 mt-1.5 size-1.5 shrink-0 rounded-full",
              activity.type === "audit"
                ? "bg-destructive/70"
                : activity.type === "stage_change"
                  ? "bg-primary"
                  : "bg-foreground/35"
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm font-medium">{activity.author}</span>
              <span className="text-xs text-muted-foreground">
                {ACTIVITY_LABELS[activity.type]} · {formatRelative(activity.createdAt)}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-foreground/90">{activity.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
