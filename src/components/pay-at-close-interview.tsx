"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { QuestionField } from "@/components/pay-at-close-question";
import { cn } from "@/lib/utils";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull } from "@/lib/format";
import {
  REP_INTERVIEW_STEPS,
  RECOMMENDATION_LABELS,
  buildPayAtCloseReport,
  interviewAnswered,
  interviewProgress,
  interviewQuestionVisible,
  interviewValue,
  newPayAtCloseRequest,
  setInterviewValue,
  type InterviewQuestion,
  type InterviewValue,
  type JobPayAtClose,
} from "@/lib/pay-at-close";
import { jobHasReviewableAddress, requestPayAtCloseReview, reviewRanToast } from "@/lib/pay-at-close-review-client";
import type { Job } from "@/lib/types";

const REVIEW_STEP = REP_INTERVIEW_STEPS.length;

/**
 * Qualification interview for a Pay at Close request. One step per topic, saved after every
 * step so a rep can start in the driveway and finish at the desk. The last step runs the
 * property review and submits the request to a company admin.
 */
export function PayAtCloseInterviewDialog({
  job,
  open,
  onOpenChange,
  onSubmitted,
}: {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the request is submitted, so the caller can show the Pay at close tab. */
  onSubmitted?: () => void;
}) {
  const crm = useCrm();
  const saved = (crm.jobPayAtClose ?? []).find((item) => item.jobId === job.id);
  if (!open) return null;
  return (
    <InterviewBody
      key={saved?.id ?? "new"}
      job={job}
      saved={saved}
      onOpenChange={onOpenChange}
      onSubmitted={onSubmitted}
    />
  );
}

function InterviewBody({
  job,
  saved,
  onOpenChange,
  onSubmitted,
}: {
  job: Job;
  saved: JobPayAtClose | undefined;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}) {
  const crm = useCrm();
  const actor = crm.effectiveStaff ? { id: crm.effectiveStaff.id, name: crm.effectiveStaff.name } : null;
  const homeowner = crm.getContact(job.primaryContactId)?.name ?? crm.customerName(job);
  const [draft, setDraft] = useState<JobPayAtClose>(
    () =>
      saved ??
      newPayAtCloseRequest({
        jobId: job.id,
        id: crypto.randomUUID(),
        state: job.state,
        contractValue: job.contractValue || 0,
        requester: actor,
      }),
  );
  const [stepIndex, setStepIndex] = useState(() => {
    const progress = interviewProgress(draft);
    return progress.submitted ? 0 : Math.min(progress.nextStepIndex, REVIEW_STEP);
  });
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const step = stepIndex < REVIEW_STEP ? REP_INTERVIEW_STEPS[stepIndex] : null;
  const progress = interviewProgress(draft);
  const visibleQuestions = step ? step.questions.filter((question) => interviewQuestionVisible(draft, question)) : [];
  const stepMissing = visibleQuestions.filter((question) => question.required && !interviewAnswered(draft, question));

  async function persist(next: JobPayAtClose): Promise<JobPayAtClose | null> {
    setSaving(true);
    try {
      const result = await crm.saveJobPayAtClose(next);
      if (result) setDraft(result);
      return result;
    } finally {
      setSaving(false);
    }
  }

  function answer(question: InterviewQuestion, value: InterviewValue) {
    setDraft((current) => setInterviewValue(current, question, value));
  }

  async function next() {
    if (stepMissing.length) {
      setTouched(true);
      toast.message(`Answer ${stepMissing.length === 1 ? "the required question" : `${stepMissing.length} required questions`} to continue, or skip for now.`);
      return;
    }
    const result = await persist(draft);
    if (!result) return;
    setTouched(false);
    setStepIndex((index) => Math.min(index + 1, REVIEW_STEP));
  }

  async function skip() {
    const result = await persist(draft);
    if (!result) return;
    setTouched(false);
    setStepIndex((index) => Math.min(index + 1, REVIEW_STEP));
  }

  async function saveAndClose() {
    const result = await persist(draft);
    if (result) onOpenChange(false);
  }

  async function runReview() {
    if (!jobHasReviewableAddress(job)) {
      toast.error("Add a street address with city and state or ZIP to the job before running the property review.");
      return;
    }
    setReviewing(true);
    try {
      const result = await requestPayAtCloseReview({ job, record: draft, homeowner, reuseProperty: Boolean(draft.property) });
      if (result.lookupError) toast.message(result.lookupError);
      const persisted = await persist(result.record);
      if (persisted) toast.success(reviewRanToast(result));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The property review did not run.");
    } finally {
      setReviewing(false);
    }
  }

  async function submit() {
    const now = new Date().toISOString();
    // Rebuild the deterministic report so the saved recommendation reflects every answer.
    const report = draft.property || draft.report
      ? buildPayAtCloseReport({ record: draft, property: draft.property, state: job.state, narrative: draft.report?.narrative ?? "" })
      : draft.report;
    const trimmed = note.trim();
    const next: JobPayAtClose = {
      ...draft,
      report,
      requestedAt: draft.requestedAt ?? now,
      requestedBy: draft.requestedBy || actor?.id || "",
      requestedByName: draft.requestedByName || actor?.name || "",
      interview: { ...draft.interview, completedAt: now },
      notes: trimmed ? [draft.notes.trim(), `Interview note: ${trimmed}`].filter(Boolean).join("\n") : draft.notes,
    };
    const result = await persist(next);
    if (!result) return;
    toast.success("Pay at close request submitted. A company admin will review it.");
    onOpenChange(false);
    onSubmitted?.();
  }

  const report = draft.report;
  const coverage = report?.waterfall.coverageRatio;

  return (
    <Dialog unsavedGuard={false} open onOpenChange={(value) => (value ? null : void saveAndClose())}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>Pay at Close qualification</DialogTitle>
          <DialogDescription>
            {job.name}
            {homeowner ? ` · ${homeowner}` : ""} · {progress.answered} of {progress.total} answered
          </DialogDescription>
          <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Interview steps">
            {[...REP_INTERVIEW_STEPS.map((item) => item.title), "Review"].map((title, index) => {
              const done =
                index < REVIEW_STEP
                  ? REP_INTERVIEW_STEPS[index].questions
                      .filter((question) => interviewQuestionVisible(draft, question) && question.required)
                      .every((question) => interviewAnswered(draft, question))
                  : progress.submitted;
              return (
                <li key={title}>
                  <button
                    type="button"
                    onClick={() => setStepIndex(index)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                      index === stepIndex ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {done && index !== stepIndex ? <Check className="size-3" /> : <span className="tabular-nums">{index + 1}</span>}
                    {title}
                  </button>
                </li>
              );
            })}
          </ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-medium">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">“{step.intro}”</p>
              </div>
              {visibleQuestions.map((question) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  value={interviewValue(draft, question)}
                  missing={touched && question.required === true && !interviewAnswered(draft, question)}
                  onChange={(value) => answer(question, value)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-medium">Review and submit</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {progress.complete
                    ? "Every required question is answered. Run the property review, then submit for a company admin's decision."
                    : `${progress.requiredMissing.length} required ${progress.requiredMissing.length === 1 ? "question is" : "questions are"} still open: ${progress.requiredMissing
                        .map((question) => question.label.toLowerCase())
                        .join(", ")}. You can submit anyway; the file will show it as incomplete.`}
                </p>
              </div>

              <div className="rounded-[12px] border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Property review</p>
                    <p className="text-sm">
                      {report
                        ? `${RECOMMENDATION_LABELS[report.recommendation]} · score ${report.score} · ${coverage != null ? `${coverage.toFixed(2)}× coverage` : "coverage unknown"}`
                        : "Not run yet. Pulls the public record and estimates seller net after loans and liens."}
                    </p>
                  </div>
                  <Button type="button" variant={report ? "outline" : "default"} className={report ? "bg-card" : undefined} disabled={reviewing || saving} onClick={() => void runReview()}>
                    <RefreshCw data-icon="inline-start" className={reviewing ? "animate-spin" : undefined} />
                    {reviewing ? "Reviewing…" : report ? "Run again" : "Run property review"}
                  </Button>
                </div>
                {report ? (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    <li className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Estimated seller net</span>
                      <span className="tabular-nums">{formatCurrencyFull(report.waterfall.netProceeds)}</span>
                    </li>
                    <li className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Due to us at closing</span>
                      <span className="tabular-nums">{formatCurrencyFull(report.waterfall.payAtCloseAmount)}</span>
                    </li>
                    {report.flags
                      .filter((flag) => flag.severity !== "info")
                      .slice(0, 4)
                      .map((flag) => (
                        <li key={flag.code} className="flex gap-2">
                          <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", flag.severity === "high" ? "bg-rose-500" : "bg-amber-500")} />
                          <span>{flag.title}</span>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs text-muted-foreground">Note for the approver (optional)</span>
                <Textarea value={note} rows={3} placeholder="Anything the homeowner said that the numbers do not show." onChange={(event) => setNote(event.target.value)} />
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-4">
          <Button type="button" variant="ghost" disabled={saving || stepIndex === 0} onClick={() => setStepIndex((index) => Math.max(0, index - 1))}>
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="bg-card" disabled={saving} onClick={() => void saveAndClose()}>
              {saving ? "Saving…" : "Save and finish later"}
            </Button>
            {step ? (
              <>
                {stepMissing.length ? (
                  <Button type="button" variant="ghost" disabled={saving} onClick={() => void skip()}>
                    Skip for now
                  </Button>
                ) : null}
                <Button type="button" disabled={saving} onClick={() => void next()}>
                  {stepIndex === REVIEW_STEP - 1 ? "Review" : "Next"}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </>
            ) : (
              <Button type="button" disabled={saving || reviewing} onClick={() => void submit()}>
                <Check data-icon="inline-start" />
                {progress.submitted ? "Update request" : "Submit for approval"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
