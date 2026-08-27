"use client";

import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { formatRelative } from "@/lib/format";
import {
  activeMentionQuery,
  commentMentionedStaff,
  commentsForRecord,
  insertMention,
  mentionCandidates,
} from "@/lib/qb-review";
import type { QbReviewComment, QbReviewIntent, QbReviewKind, StaffMember } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ReviewCommentThread({
  kind,
  recordId,
  empty,
}: {
  kind: QbReviewKind;
  recordId: string;
  empty?: string;
}) {
  const crm = useCrm();
  const comments = commentsForRecord(crm.qbReviewComments ?? [], kind, recordId);
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Comments</p>
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {empty ?? "No notes yet. Tag someone with @ to send them a notification."}
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <ReviewCommentCard key={comment.id} comment={comment} staff={crm.staff} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReviewCommentCard({
  comment,
  staff,
}: {
  comment: QbReviewComment;
  staff: StaffMember[];
}) {
  const tagged = commentMentionedStaff(comment, staff);
  return (
    <li className="rounded-md border px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{comment.authorName}</p>
        <p className="text-[11px] text-muted-foreground">{formatRelative(comment.createdAt)}</p>
      </div>
      <p className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">
        {intentLabel(comment.intent)}
      </p>
      <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{comment.body}</p>
      {tagged.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Tagged {tagged.map((member) => member.name).join(", ")}
        </p>
      ) : null}
    </li>
  );
}

export function MentionComposer({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const crm = useCrm();
  const query = useMemo(() => (disabled ? null : activeMentionQuery(value)), [disabled, value]);
  const options = useMemo(
    () => (query == null ? [] : mentionCandidates(crm.staff, query)),
    [crm.staff, query],
  );
  const [highlight, setHighlight] = useState(0);

  function pick(member: StaffMember) {
    onChange(insertMention(value, member.name));
    setHighlight(0);
  }

  return (
    <div className="relative">
      <Textarea
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        rows={rows}
        placeholder={placeholder ?? "Leave a comment. Type @ to tag someone."}
        onChange={(event) => {
          onChange(event.target.value);
          setHighlight(0);
        }}
        onKeyDown={(event) => {
          if (query == null || options.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((current) => (current + 1) % options.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((current) => (current - 1 + options.length) % options.length);
          } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            const member = options[highlight] ?? options[0];
            if (member) pick(member);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onChange(value.replace(/(?:^|\s)@([^\n@]*)$/, (chunk) => (/^\s/.test(chunk) ? chunk[0] : "")));
          }
        }}
      />
      {query != null && options.length > 0 ? (
        <ul className="absolute inset-x-0 bottom-full z-20 mb-1 max-h-48 overflow-auto rounded-md border bg-popover py-1 shadow-md">
          {options.map((member, index) => (
            <li key={member.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col items-start px-3 py-1.5 text-left text-sm",
                  index === highlight ? "bg-muted" : "hover:bg-muted/70",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(member);
                }}
              >
                <span className="font-medium">{member.name}</span>
                <span className="text-[11px] text-muted-foreground">{member.title || member.role}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function intentLabel(intent: QbReviewIntent) {
  if (intent === "return") return "Returned";
  if (intent === "approve") return "Approved";
  if (intent === "resubmit") return "Sent back to accounting";
  return "Comment";
}
