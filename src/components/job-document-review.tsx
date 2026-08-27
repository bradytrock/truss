"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QbStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/page-chrome";
import { MentionComposer, ReviewCommentThread } from "@/components/qb-review-comments";
import { DocumentPreview, ReviewRecordFields } from "@/components/qb-review-fields";
import { useCrm } from "@/lib/crm-store";
import {
  findReviewItem,
  isWaitingOnPm,
  itemKindLabel,
  itemTitle,
  jobFilesHref,
  parseJobDocParam,
  parseMentionedStaff,
  reviewItemJobId,
  reviewItemStatus,
  type QbReviewItem,
} from "@/lib/qb-review";
import type { Job } from "@/lib/types";

export function JobDocumentReview({ job }: { job: Job }) {
  const crm = useCrm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = parseJobDocParam(searchParams.get("doc"));
  const item = useMemo(
    () => (parsed ? findReviewItem(crm, parsed.kind, parsed.id) : null),
    [crm, parsed],
  );
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"comment" | "resubmit" | null>(null);

  function backToJob() {
    router.replace(jobFilesHref(job.id), { scroll: false });
  }

  if (!parsed || !item || reviewItemJobId(item) !== job.id) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center p-6">
        <EmptyState
          title="File not on this job"
          description="Open an invoice, receipt, or payment from Files on the job."
          action={
            <Button type="button" variant="outline" onClick={backToJob}>
              Back to job files
            </Button>
          }
        />
      </div>
    );
  }

  const current = item;
  const status = reviewItemStatus(current);
  const locked = status === "entered" || status === "queued";
  const waiting = isWaitingOnPm(status);

  async function leaveNote(intent: "comment" | "resubmit", body: string) {
    const mentioned = parseMentionedStaff(body, crm.staff);
    return crm.addQbReviewComment({
      kind: current.kind,
      recordId: current.id,
      body,
      intent,
      mentionedStaffIds: mentioned.map((member) => member.id),
    });
  }

  async function postComment() {
    if (!note.trim()) return;
    setPending("comment");
    try {
      const saved = await leaveNote("comment", note);
      if (saved) setNote("");
    } finally {
      setPending(null);
    }
  }

  async function sendToAccounting() {
    setPending("resubmit");
    try {
      const ok = await crm.setQbStatus(current.kind, current.id, "not_in_qb");
      if (!ok) return;
      const tagged = parseMentionedStaff(note, crm.staff);
      const body = note.trim() || "Updated. Ready for accounting again.";
      await crm.addQbReviewComment({
        kind: current.kind,
        recordId: current.id,
        body,
        intent: "resubmit",
        mentionedStaffIds: tagged.map((member) => member.id),
      });
      await crm.addActivity({
        entityType: "job",
        entityId: job.id,
        type: "note",
        body: `${itemTitle(current)} sent back to accounting.`,
      });
      toast.success("Accounting will see this in Approve again.");
      setNote("");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={backToJob}>
          <ChevronLeft data-icon="inline-start" />
          Job files
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{itemTitle(item)}</p>
          <p className="text-[11px] text-muted-foreground">
            {itemKindLabel(item.kind)} · {job.code || job.name}
          </p>
        </div>
        <QbStatusBadge status={status} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-h-0 overflow-y-auto bg-muted/40 p-3 sm:p-5">
          <div className="lg:hidden">
            <Tabs defaultValue="document">
              <TabsList className="mb-3 w-full">
                <TabsTrigger value="document">File</TabsTrigger>
                <TabsTrigger value="data">Details</TabsTrigger>
              </TabsList>
              <TabsContent value="document">
                <DocumentPreview item={item} />
              </TabsContent>
              <TabsContent value="data">
                <FileThread
                  item={item}
                  locked={locked}
                  waiting={waiting}
                  note={note}
                  pending={pending}
                  onNote={setNote}
                  onComment={() => void postComment()}
                  onResubmit={() => void sendToAccounting()}
                />
              </TabsContent>
            </Tabs>
          </div>
          <div className="hidden lg:block">
            <DocumentPreview item={current} />
          </div>
        </section>
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-l bg-background lg:flex">
          <FileThread
            item={current}
            locked={locked}
            waiting={waiting}
            note={note}
            pending={pending}
            onNote={setNote}
            onComment={() => void postComment()}
            onResubmit={() => void sendToAccounting()}
          />
        </aside>
      </div>
    </div>
  );
}

function FileThread({
  item,
  locked,
  waiting,
  note,
  pending,
  onNote,
  onComment,
  onResubmit,
}: {
  item: QbReviewItem;
  locked: boolean;
  waiting: boolean;
  note: string;
  pending: "comment" | "resubmit" | null;
  onNote: (value: string) => void;
  onComment: () => void;
  onResubmit: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-3">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          {itemKindLabel(item.kind)}
        </p>
        <h2 className="font-heading text-lg font-medium">{itemTitle(item)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {waiting
            ? "Accounting asked for a change. Fix the fields, leave a comment, and send it back."
            : "Comments on this file work like Dropbox — tag someone with @ and they get a notification."}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <ReviewRecordFields item={item} locked={locked} />
        <ReviewCommentThread kind={item.kind} recordId={item.id} />
        {locked ? null : (
          <MentionComposer
            value={note}
            onChange={onNote}
            placeholder={
              waiting
                ? "What did you change? Type @ to tag accounting."
                : "Leave a comment. Type @ to tag someone."
            }
          />
        )}
      </div>
      {locked ? (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">Already in QuickBooks.</p>
      ) : (
        <div className="flex flex-wrap gap-2 border-t px-4 py-3">
          {waiting ? (
            <Button type="button" disabled={pending !== null} onClick={onResubmit}>
              Send back to accounting
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null || !note.trim()}
            onClick={onComment}
          >
            Comment
          </Button>
        </div>
      )}
    </div>
  );
}
