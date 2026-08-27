"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QbStatusBadge } from "@/components/status-badge";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { MentionComposer, ReviewCommentThread } from "@/components/qb-review-comments";
import { blockReason, DocumentPreview, ReviewRecordFields } from "@/components/qb-review-fields";
import { useCrm } from "@/lib/crm-store";
import { documentOwnerStaff } from "@/lib/document-owner";
import { formatDate, formatIsoWeekParam, formatMoney, resolveIsoWeekRange, shiftIsoWeek } from "@/lib/format";
import { invoiceTotal } from "@/lib/money";
import {
  approveHref,
  findReviewItem,
  isWaitingOnPm,
  itemKindLabel,
  itemTitle,
  jobDocumentHref,
  nextApproveItem,
  parseMentionedStaff,
  qbApproveInbox,
  reviewHref,
  reviewItemJobId,
  reviewItemStatus,
  type QbReviewItem,
} from "@/lib/qb-review";
import type { QbReviewKind } from "@/lib/types";
import { canViewAccounting } from "@/lib/visibility";
import { cn } from "@/lib/utils";

export function QbApproveDesk({
  kind,
  id,
}: {
  kind?: string;
  id?: string;
}) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <QbApproveDeskInner kind={kind} id={id} />
    </Suspense>
  );
}

function QbApproveDeskInner({
  kind,
  id,
}: {
  kind?: string;
  id?: string;
}) {
  const crm = useCrm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const weekQuery = searchParams.get("week");
  const week = useMemo(() => resolveIsoWeekRange(weekQuery), [weekQuery]);
  const accountant = Boolean(crm.effectiveStaff && canViewAccounting(crm.effectiveStaff.role));
  const inbox = useMemo(
    () =>
      qbApproveInbox({
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        expenses: crm.expenses,
        payments: crm.payments,
        week: { start: week.start, end: week.end },
      }),
    [crm.expenses, crm.invoiceLines, crm.invoices, crm.payments, week.end, week.start],
  );
  const selectedKind = kind === "expense" || kind === "payment" || kind === "invoice" ? kind : undefined;

  useEffect(() => {
    if (weekQuery) return;
    router.replace(
      selectedKind && id ? reviewHref(selectedKind, id, week.param) : approveHref(week.param),
    );
  }, [id, router, selectedKind, week.param, weekQuery]);

  const selected = useMemo(() => {
    if (selectedKind && id) {
      return (
        inbox.items.find((item) => item.kind === selectedKind && item.id === id) ??
        findReviewItem(crm, selectedKind, id)
      );
    }
    return inbox.weekItems[0] ?? inbox.ready[0] ?? inbox.returned[0] ?? inbox.queued[0] ?? null;
  }, [crm, id, inbox, selectedKind]);

  useEffect(() => {
    if (!crm.hydrated || accountant || !selected) return;
    const jobId = reviewItemJobId(selected);
    if (jobId) router.replace(jobDocumentHref(jobId, selected.kind, selected.id));
  }, [accountant, crm.hydrated, router, selected]);

  if (!crm.hydrated) return <LoadingScreen />;

  if (!accountant) {
    if (selected && reviewItemJobId(selected)) return <LoadingScreen />;
    return (
      <EmptyState
        title="Approve is for accounting"
        description="Company admin and the Accounting seat review invoices, expenses, and payments here. If accounting tagged you, open the file on the job."
        action={
          <Link href="/jobs" className="text-sm font-medium text-primary hover:underline">
            Open jobs
          </Link>
        }
      />
    );
  }

  function openItem(item: QbReviewItem) {
    router.push(reviewHref(item.kind, item.id, week.param));
  }

  function goToWeek(year: number, weekNumber: number) {
    router.push(approveHref(formatIsoWeekParam(year, weekNumber)));
  }

  return (
    <div className="-m-5 flex h-[calc(100dvh-3rem)] min-h-0 flex-col bg-muted/30 sm:-m-7">
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)_24rem]">
        <QueuePane
          inbox={inbox}
          selected={selected}
          week={week}
          onOpen={openItem}
          onWeekChange={goToWeek}
        />
        {selected ? (
          <ReviewPane
            item={selected}
            inbox={inbox}
            onMoved={(next) => {
              if (next && (next.kind !== selected.kind || next.id !== selected.id)) {
                router.push(reviewHref(next.kind, next.id, week.param));
              } else {
                router.push(approveHref(week.param));
              }
            }}
          />
        ) : (
          <div className="col-span-2 flex items-center justify-center p-8">
            <EmptyState
              title="Nothing in this week"
              description={`No invoices were issued ${week.label}. Step to another week, or pick an expense or payment still waiting on QuickBooks.`}
              action={
                <Link href="/accounting" className="text-sm font-medium text-primary hover:underline">
                  Open the books
                </Link>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function QueuePane({
  inbox,
  selected,
  week,
  onOpen,
  onWeekChange,
}: {
  inbox: ReturnType<typeof qbApproveInbox>;
  selected: QbReviewItem | null;
  week: ReturnType<typeof resolveIsoWeekRange>;
  onOpen: (item: QbReviewItem) => void;
  onWeekChange: (year: number, week: number) => void;
}) {
  const current = resolveIsoWeekRange();
  const isCurrent = week.param === current.param;
  const previous = shiftIsoWeek(week.year, week.week, -1);
  const next = shiftIsoWeek(week.year, week.week, 1);

  return (
    <aside className="flex max-h-[min(22rem,46vh)] shrink-0 flex-col border-b bg-background lg:max-h-none lg:border-r lg:border-b-0">
      <div className="border-b px-3 py-3">
        <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Approve</p>
        <p className="mt-1 font-heading text-base font-medium">{week.title}</p>
        <p className="text-xs text-muted-foreground">{week.rangeLabel}</p>
        <div className="mt-2 flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label="Previous week"
            onClick={() => onWeekChange(previous.year, previous.week)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={isCurrent}
            onClick={() => onWeekChange(current.year, current.week)}
          >
            This week
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            aria-label="Next week"
            onClick={() => onWeekChange(next.year, next.week)}
          >
            <ChevronRight />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {inbox.weekInvoiceCount
            ? `${inbox.weekInvoiceCount} invoice${inbox.weekInvoiceCount === 1 ? "" : "s"} · ${formatMoney(inbox.invoiceTotalDue)}`
            : "No invoices this week"}
          {inbox.readyCount ? ` · ${inbox.readyCount} ready` : ""}
          {inbox.returnedCount ? ` · ${inbox.returnedCount} with the PM` : ""}
          {inbox.queuedCount ? ` · ${inbox.queuedCount} in the connector` : ""}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <QueueGroup
          title={isCurrent ? "This week’s invoices" : `Week ${week.week} invoices`}
          empty="No invoices were issued this week."
          items={inbox.weekItems}
          selected={selected}
          onOpen={onOpen}
          showStatus
        />
        <QueueGroup title="Ready" items={inbox.ready} selected={selected} onOpen={onOpen} />
        <QueueGroup title="Returned to PM" items={inbox.returned} selected={selected} onOpen={onOpen} />
        <QueueGroup title="In the connector" items={inbox.queued} selected={selected} onOpen={onOpen} />
      </div>
    </aside>
  );
}

function QueueGroup({
  title,
  items,
  selected,
  onOpen,
  empty,
  showStatus,
}: {
  title: string;
  items: QbReviewItem[];
  selected: QbReviewItem | null;
  onOpen: (item: QbReviewItem) => void;
  empty?: string;
  showStatus?: boolean;
}) {
  const crm = useCrm();
  if (items.length === 0) {
    if (!empty) return null;
    return (
      <div className="border-b py-2">
        <p className="px-3 pb-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </p>
        <p className="px-3 pb-2 text-xs text-muted-foreground">{empty}</p>
      </div>
    );
  }
  return (
    <div className="border-b py-2">
      <p className="px-3 pb-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </p>
      <ul>
        {items.map((item) => {
          const active = selected?.kind === item.kind && selected.id === item.id;
          return (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm",
                  active ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate font-medium">{itemTitle(item)}</span>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {itemAmount(item, crm)}
                  </span>
                </span>
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-muted-foreground">
                    {item.kind === "invoice"
                      ? `Invoice · ${formatDate(item.invoice.issuedAt)}`
                      : item.kind === "expense"
                        ? "Expense"
                        : "Payment"}
                  </span>
                  {showStatus ? <QbStatusBadge status={reviewItemStatus(item)} /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function itemAmount(item: QbReviewItem, crm: ReturnType<typeof useCrm>) {
  if (item.kind === "invoice") return formatMoney(invoiceTotal(item.invoice.id, crm.invoiceLines));
  if (item.kind === "expense") return formatMoney(item.expense.amount);
  return formatMoney(item.payment.amount);
}

function ReviewPane({
  item,
  inbox,
  onMoved,
}: {
  item: QbReviewItem;
  inbox: ReturnType<typeof qbApproveInbox>;
  onMoved: (next: QbReviewItem | null) => void;
}) {
  const [tab, setTab] = useState("document");

  return (
    <>
      <section className="min-h-0 overflow-y-auto bg-muted/40 p-3 sm:p-5">
        <div className="lg:hidden">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-3 w-full">
              <TabsTrigger value="document">Document</TabsTrigger>
              <TabsTrigger value="data">QuickBooks</TabsTrigger>
            </TabsList>
            <TabsContent value="document">
              <DocumentPreview item={item} />
            </TabsContent>
            <TabsContent value="data">
              <DataAndThread item={item} inbox={inbox} onMoved={onMoved} />
            </TabsContent>
          </Tabs>
        </div>
        <div className="hidden lg:block">
          <DocumentPreview item={item} />
        </div>
      </section>
      <aside className="hidden min-h-0 flex-col overflow-y-auto border-l bg-background lg:flex">
        <DataAndThread item={item} inbox={inbox} onMoved={onMoved} />
      </aside>
    </>
  );
}

function DataAndThread({
  item,
  inbox,
  onMoved,
}: {
  item: QbReviewItem;
  inbox: ReturnType<typeof qbApproveInbox>;
  onMoved: (next: QbReviewItem | null) => void;
}) {
  const crm = useCrm();
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"approve" | "return" | "comment" | null>(null);
  const status = reviewItemStatus(item);
  const jobId = reviewItemJobId(item);
  const job = jobId ? crm.getJob(jobId) : undefined;
  const blocked = blockReason(item, crm);
  const locked = status === "entered";
  const owner = documentOwnerStaff({
    job,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
  });

  function mentionedIds(body: string) {
    return parseMentionedStaff(body, crm.staff).map((member) => member.id);
  }

  async function leaveNote(intent: "comment" | "return" | "approve", body: string, extraIds: string[] = []) {
    const ids = [...new Set([...mentionedIds(body), ...extraIds])];
    return crm.addQbReviewComment({
      kind: item.kind,
      recordId: item.id,
      body,
      intent,
      mentionedStaffIds: ids,
    });
  }

  async function logJob(body: string) {
    if (!jobId) return;
    await crm.addActivity({ entityType: "job", entityId: jobId, type: "note", body });
  }

  async function approve() {
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setPending("approve");
    try {
      const ok = await crm.setQbStatus(item.kind, item.id, "queued");
      if (!ok) return;
      await leaveNote("approve", note.trim() || "Approved for QuickBooks.");
      await logJob(`${itemTitle(item)} approved for QuickBooks.`);
      toast.success("In the Web Connector queue.");
      setNote("");
      onMoved(nextApproveItem(inbox, item.kind, item.id));
    } finally {
      setPending(null);
    }
  }

  function openReturn() {
    const prefix = owner?.name ? `@${owner.name} ` : "";
    setReturnNote(prefix);
    setReturnOpen(true);
  }

  async function sendBack() {
    const body = returnNote.trim();
    if (!body) {
      toast.error("Tell the project manager what to change.");
      return;
    }
    setPending("return");
    try {
      const ok = await crm.setQbStatus(item.kind, item.id, "returned");
      if (!ok) return;
      const extra = owner && !mentionedIds(body).includes(owner.id) ? [owner.id] : [];
      await leaveNote("return", body, extra);
      await logJob(`Returned ${itemTitle(item)}: ${body}`);
      toast.success(owner ? `Sent back to ${owner.name}.` : "Sent back to the project manager.");
      setReturnOpen(false);
      setReturnNote("");
      onMoved(nextApproveItem(inbox, item.kind, item.id));
    } finally {
      setPending(null);
    }
  }

  async function postComment() {
    if (!note.trim()) return;
    setPending("comment");
    try {
      const saved = await leaveNote("comment", note);
      if (saved) {
        if (jobId) await logJob(`${itemTitle(item)}: ${note.trim()}`);
        setNote("");
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {itemKindLabel(item.kind)}
            </p>
            <h2 className="font-heading text-lg font-medium">{itemTitle(item)}</h2>
          </div>
          <QbStatusBadge status={status} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Edit what QuickBooks will get. Tag the project manager with @ — they reply on the file in the
          job.
        </p>
        {job ? (
          <Link
            href={jobDocumentHref(job.id, item.kind, item.id)}
            className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
          >
            Open on the job
          </Link>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <ReviewRecordFields item={item} locked={locked} />
        <ReviewCommentThread
          kind={item.kind}
          recordId={item.id}
          empty="No notes yet. Tag the PM with @ to send a notification, or return the file with what to change."
        />
        {locked ? null : (
          <MentionComposer
            value={note}
            onChange={setNote}
            placeholder={
              owner
                ? `Leave a comment. Type @ to tag ${owner.name.split(" ")[0]}.`
                : "Leave a comment. Type @ to tag someone."
            }
          />
        )}
      </div>
      {locked ? (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">Already in QuickBooks.</p>
      ) : (
        <div className="flex flex-wrap gap-2 border-t px-4 py-3">
          <Button type="button" disabled={pending !== null} onClick={() => void approve()}>
            Approve for QuickBooks
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null || status === "queued"}
            onClick={openReturn}
          >
            Return to PM
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null || !note.trim()}
            onClick={() => void postComment()}
          >
            Comment
          </Button>
        </div>
      )}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to the project manager</DialogTitle>
            <DialogDescription>
              They get a notification if you tag them. The reply happens on this file inside the job —
              they fix it, comment, and send it back here.
            </DialogDescription>
          </DialogHeader>
          <MentionComposer
            value={returnNote}
            onChange={setReturnNote}
            placeholder="What needs to change? Type @ to tag the PM."
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReturnOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending !== null} onClick={() => void sendBack()}>
              Return to PM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function parseReviewKindParam(value: string | undefined): QbReviewKind | null {
  if (value === "invoice" || value === "expense" || value === "payment") return value;
  return null;
}
