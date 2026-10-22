"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { formatRelative } from "@/lib/format";
import { ACTIVITY_LABELS, type Activity, type ActivityType } from "@/lib/types";
import { cn } from "@/lib/utils";

const types = ["note", "call", "email", "text", "meeting", "site_walk"] as const;

function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

export function ActivityComposer({
  entityType,
  entityId,
  focusRequest = 0,
  tone = "default",
}: {
  entityType: "opportunity" | "job" | "client";
  entityId: string;
  focusRequest?: number;
  tone?: "default" | "record";
}) {
  const { addActivity } = useCrm();
  const [body, setBody] = useState("");
  const [type, setType] = useState<Exclude<ActivityType, "stage_change" | "audit">>("note");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focusRequest) return;
    const field = bodyRef.current;
    if (!field) return;
    field.focus();
    field.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusRequest]);

  function submit() {
    if (!body.trim()) {
      toast.error("Write a note, call recap, or meeting summary first.");
      return;
    }
    addActivity({ entityType, entityId, type, body: body.trim() });
    setBody("");
    toast.success("Logged to the record.");
  }

  const typeButtons = types.map((item) => (
    <Button
      key={item}
      type="button"
      size="sm"
      variant={type === item ? "secondary" : "ghost"}
      className={cn(tone === "record" && "h-7 rounded-md px-2.5 text-xs shadow-none", type === item && tone === "record" && "bg-card")}
      onClick={() => setType(item)}
    >
      {ACTIVITY_LABELS[item]}
    </Button>
  ));

  if (tone === "record") {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Activity</p>
          <div className="flex flex-wrap gap-0.5 rounded-lg bg-muted/70 p-0.5">{typeButtons}</div>
        </div>
        <div className="rounded-[12px] border bg-card p-3">
          <Textarea
            ref={bodyRef}
            id="job-activity-composer"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="What happened? Bid recap, owner call, site walk notes..."
            rows={3}
            className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={submit}>
              Log activity
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 flex flex-wrap gap-1">{typeButtons}</div>
      <Textarea
        ref={bodyRef}
        id="job-activity-composer"
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
  tone = "default",
}: {
  items: Activity[];
  empty: string;
  tone?: "default" | "record";
}) {
  if (items.length === 0) {
    if (tone === "record") return null;
    return <p className="py-8 text-sm text-muted-foreground">{empty}</p>;
  }

  if (tone === "record") {
    return (
      <ol className="mt-4 divide-y">
        {items.map((activity) => (
          <li key={activity.id} className="flex gap-3 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
              {personInitials(activity.author)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">{activity.author}</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {ACTIVITY_LABELS[activity.type]}
                </span>
                <span className="text-xs text-muted-foreground">{formatRelative(activity.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{activity.body}</p>
            </div>
          </li>
        ))}
      </ol>
    );
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
              activity.type === "text"
                ? "bg-sky-600"
                : activity.type === "audit"
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
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {activity.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
