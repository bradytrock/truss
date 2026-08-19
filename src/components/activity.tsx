"use client";

import { useState } from "react";
import { Phone, Mail, StickyNote, Users, Footprints } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { formatRelative } from "@/lib/format";
import { ACTIVITY_LABELS, type Activity, type ActivityType } from "@/lib/types";
import { cn } from "@/lib/utils";

const typeIcons: Record<Exclude<ActivityType, "stage_change">, typeof StickyNote> = {
  note: StickyNote,
  call: Phone,
  email: Mail,
  meeting: Users,
  site_walk: Footprints,
};

export function ActivityComposer({
  entityType,
  entityId,
}: {
  entityType: "opportunity" | "job" | "client";
  entityId: string;
}) {
  const { addActivity } = useCrm();
  const [body, setBody] = useState("");
  const [type, setType] = useState<Exclude<ActivityType, "stage_change">>("note");

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
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex flex-wrap gap-1">
        {(Object.keys(typeIcons) as Array<Exclude<ActivityType, "stage_change">>).map((item) => {
          const Icon = typeIcons[item];
          return (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={type === item ? "secondary" : "ghost"}
              onClick={() => setType(item)}
            >
              <Icon data-icon="inline-start" />
              {ACTIVITY_LABELS[item]}
            </Button>
          );
        })}
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
    return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ol className="space-y-0">
      {items.map((activity, index) => (
        <li key={activity.id} className="relative flex gap-3 pb-5 last:pb-0">
          {index !== items.length - 1 ? (
            <span className="absolute top-7 bottom-0 left-[11px] w-px bg-border" />
          ) : null}
          <span
            className={cn(
              "relative z-10 mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border bg-background text-[10px] font-medium",
              activity.type === "stage_change"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "text-muted-foreground"
            )}
          >
            {ACTIVITY_LABELS[activity.type].slice(0, 1)}
          </span>
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
