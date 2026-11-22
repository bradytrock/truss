"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink, FileText, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { QuestionField } from "@/components/pay-at-close-question";
import { PayAtCloseSendDialog } from "@/components/pay-at-close-send-dialog";
import { cn } from "@/lib/utils";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate, formatTime } from "@/lib/format";
import { formatJobSite } from "@/lib/leads";
import {
  DEFAULT_THRESHOLDS,
  REP_INTERVIEW_STEPS,
  RECOMMENDATION_LABELS,
  applicationState,
  buildPayAtCloseReport,
  dollars,
  estimateMortgageBalance,
  homeownerCanAnswer,
  interviewAnswered,
  interviewProgress,
  interviewQuestionVisible,
  interviewSummary,
  interviewValue,
  isSamplePropertyRecord,
  newPayAtCloseRequest,
  setInterviewValue,
  type InterviewQuestion,
  type InterviewValue,
  type JobPayAtClose,
  type PayAtCloseReport,
  type PropertyRecord,
  type Recommendation,
} from "@/lib/pay-at-close";
import { APPLICATION_UPLOAD_BUCKET } from "@/lib/pay-at-close-application";
import { jobHasReviewableAddress, requestPayAtCloseReview, reviewRanToast } from "@/lib/pay-at-close-review-client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import type { Job } from "@/lib/types";

const REVIEW_STEP = REP_INTERVIEW_STEPS.length;

/**
 * Qualification form for a Pay at Close request, as the office sees it. One tab per topic,
 * saved on every step. Answers the homeowner gave on their phone show up here marked as
 * theirs; what only the office can answer is marked PM only. The last tab runs the property
 * review and submits the request to a company admin.
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
  return <InterviewBody key={saved?.id ?? "new"} job={job} saved={saved} onOpenChange={onOpenChange} onSubmitted={onSubmitted} />;
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
  const [savedAt, setSavedAt] = useState<string | null>(saved?.updatedAt ?? null);
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  // The homeowner's answers arrive on the saved copy while this form is open; fold them in
  // without losing what the rep is typing.
  const liveSaved = (crm.jobPayAtClose ?? []).find((item) => item.jobId === job.id);
  const [seenUpdate, setSeenUpdate] = useState(saved?.updatedAt ?? "");
  if (liveSaved && liveSaved.updatedAt !== seenUpdate && liveSaved.updatedAt !== draft.updatedAt) {
    setSeenUpdate(liveSaved.updatedAt);
    setDraft((current) => ({
      ...liveSaved,
      interview: {
        ...liveSaved.interview,
        answers: { ...current.interview.answers, ...liveSaved.interview.answers },
        sources: { ...current.interview.sources, ...liveSaved.interview.sources },
      },
    }));
  }

  const step = stepIndex < REVIEW_STEP ? REP_INTERVIEW_STEPS[stepIndex] : null;
  const progress = interviewProgress(draft);
  const visibleQuestions = step ? step.questions.filter((question) => interviewQuestionVisible(draft, question)) : [];
  const stepMissing = visibleQuestions.filter((question) => question.required && !interviewAnswered(draft, question));
  const appState = applicationState(draft.application);
  const homeownerAnswered = interviewSummary(draft).filter((row) => row.source === "homeowner").length;
  const requiredHomeownerCan = progress.requiredMissing.filter((question) => homeownerCanAnswer(question)).length;
  const address = formatJobSite({ street: job.street, city: job.city, state: job.state, postalCode: job.postalCode });

  async function persist(next: JobPayAtClose): Promise<JobPayAtClose | null> {
    setSaving(true);
    try {
      const result = await crm.saveJobPayAtClose(next);
      if (result) {
        setDraft(result);
        setSeenUpdate(result.updatedAt);
        setSavedAt(result.updatedAt || new Date().toISOString());
      }
      return result;
    } finally {
      setSaving(false);
    }
  }

  function answer(question: InterviewQuestion, value: InterviewValue) {
    setDraft((current) => {
      const next = setInterviewValue(current, question, value);
      // The rep's edit replaces whatever the homeowner said.
      const sources = { ...next.interview.sources };
      delete sources[question.id];
      return { ...next, interview: { ...next.interview, sources } };
    });
  }

  async function goTo(index: number) {
    const result = await persist(draft);
    if (!result) return;
    setTouched(false);
    setStepIndex(Math.max(0, Math.min(index, REVIEW_STEP)));
  }

  async function next() {
    if (stepMissing.length) setTouched(true);
    await goTo(stepIndex + 1);
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
    const report =
      draft.property || draft.report
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
  const nextStep = stepIndex + 1 < REVIEW_STEP ? REP_INTERVIEW_STEPS[stepIndex + 1] : null;

  return (
    <Dialog unsavedGuard={false} open onOpenChange={(value) => (value ? null : void saveAndClose())}>
      <DialogContent className="flex max-h-[94vh] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="space-y-0 border-b px-6 pt-5 pb-0">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <DialogTitle className="font-heading text-2xl font-medium tracking-tight">Pay at Close qualification</DialogTitle>
              <DialogDescription className="mt-0.5 truncate">
                {homeowner ? `${homeowner} — ` : ""}
                {address || job.name}
                {draft.requestedByName || actor?.name ? ` · ${draft.requestedByName || actor?.name}` : ""}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {appState === "submitted" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                  <span className="size-1.5 rounded-full bg-sky-500" />
                  Homeowner answered {homeownerAnswered} · {formatDate(draft.application.submittedAt)}
                </span>
              ) : appState === "sent" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  Link sent {formatDate(draft.application.sentAt)}
                  {homeownerAnswered ? ` · ${homeownerAnswered} answered so far` : ""}
                </span>
              ) : null}
              <Button type="button" size="sm" variant="outline" className="bg-card" onClick={() => setSendOpen(true)}>
                <Send data-icon="inline-start" />
                Send to homeowner
              </Button>
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${progress.total ? Math.round((progress.answered / progress.total) * 100) : 0}%` }} />
          </div>
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {progress.answered} of {progress.total} answered · {progress.requiredMissing.length} required open
          </p>
          <nav className="-mb-px mt-1 flex gap-1 overflow-x-auto" aria-label="Sections">
            {[...REP_INTERVIEW_STEPS, null].map((item, index) => {
              const isReview = item === null;
              const visible = item ? item.questions.filter((question) => interviewQuestionVisible(draft, question)) : [];
              const done = visible.filter((question) => interviewAnswered(draft, question)).length;
              const complete = item ? visible.filter((question) => question.required).every((question) => interviewAnswered(draft, question)) : progress.submitted;
              const active = index === stepIndex;
              return (
                <button
                  key={item?.id ?? "review"}
                  type="button"
                  onClick={() => void goTo(index)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {complete && !isReview ? <Check className="size-3.5 text-emerald-600" /> : null}
                  {isReview ? "Review" : item.title}
                  {!isReview ? (
                    <span className={cn("text-xs tabular-nums", done === visible.length ? "text-emerald-700" : complete ? "text-muted-foreground" : "text-amber-700")}>
                      {done}/{visible.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            {step ? (
              <div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-lg font-medium">{step.title}</h3>
                  <p className="text-sm text-muted-foreground italic">“{step.intro}”</p>
                </div>
                <div className="mt-2">
                  {visibleQuestions.map((question) => (
                    <QuestionField
                      key={question.id}
                      question={question}
                      value={interviewValue(draft, question)}
                      missing={touched && question.required === true && !interviewAnswered(draft, question)}
                      source={draft.interview.sources[question.id]}
                      note={questionNote(question, draft)}
                      onChange={(value) => answer(question, value)}
                    />
                  ))}
                  {step.id === "debt" && draft.application.uploads.length ? <StatementRow record={draft} /> : null}
                </div>
              </div>
            ) : (
              <ReviewBody
                draft={draft}
                report={report}
                reviewing={reviewing || saving}
                note={note}
                onNote={setNote}
                onRun={() => void runReview()}
              />
            )}
          </div>
          <aside className="hidden min-h-0 overflow-y-auto border-l bg-muted/30 px-4 py-5 lg:block">
            {step ? (
              <LiveReview report={report} property={draft.property} record={draft} reviewing={reviewing} onRun={() => void runReview()} />
            ) : (
              <OpenAnswers
                draft={draft}
                onJump={(index) => void goTo(index)}
                onAskHomeowner={requiredHomeownerCan > 0 ? () => setSendOpen(true) : undefined}
                askCount={requiredHomeownerCan}
              />
            )}
          </aside>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t px-6 py-4">
          <Button type="button" variant="ghost" disabled={saving || stepIndex === 0} onClick={() => void goTo(stepIndex - 1)}>
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {saving ? "Saving…" : savedAt ? `Saved ${formatTime(savedAt)}.` : "Not saved yet."} Required questions can stay open — they’re listed on Review.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="bg-card" disabled={saving} onClick={() => void saveAndClose()}>
              Save and close
            </Button>
            {step ? (
              <Button type="button" disabled={saving} onClick={() => void next()}>
                {nextStep ? `Next: ${nextStep.title}` : "Review"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            ) : (
              <Button type="button" disabled={saving || reviewing} onClick={() => void submit()}>
                <Check data-icon="inline-start" />
                {progress.submitted ? "Update request" : progress.requiredMissing.length ? `Submit for approval (${progress.requiredMissing.length} open)` : "Submit for approval"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      <PayAtCloseSendDialog job={job} record={draft} open={sendOpen} onOpenChange={setSendOpen} onSave={persist} />
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Public record next to the answer                                     */
/* ------------------------------------------------------------------ */

function recordedFirstMortgage(property: PropertyRecord | null) {
  if (!property) return null;
  const firsts = property.mortgages.filter((mortgage) => !mortgage.isHeloc);
  if (!firsts.length) return null;
  return firsts.reduce((sum, mortgage) => sum + estimateMortgageBalance(mortgage).balance, 0);
}

function recordedHeloc(property: PropertyRecord | null) {
  if (!property) return null;
  const helocs = property.mortgages.filter((mortgage) => mortgage.isHeloc);
  if (!helocs.length) return 0;
  return helocs.reduce((sum, mortgage) => sum + mortgage.originalAmount, 0);
}

function questionNote(question: InterviewQuestion, record: JobPayAtClose): React.ReactNode {
  const property = record.property;
  if (question.id === "mortgage_balance") {
    const estimate = recordedFirstMortgage(property);
    const said = typeof record.interview.answers.mortgage_balance === "number" ? record.interview.answers.mortgage_balance : 0;
    if (!property) return question.help;
    if (estimate === null) return "No deed of trust in the public record. The homeowner's figure is the only source until a payoff letter arrives.";
    const diff = said > 0 ? Math.abs(said - estimate) / estimate : null;
    return (
      <>
        Public record estimate <span className="font-medium text-foreground">{dollars(estimate)}</span>
        {diff !== null ? ` · ${diff <= 0.15 ? `within ${Math.max(1, Math.round(diff * 100))}%` : `${Math.round(diff * 100)}% apart`}` : ""}. Only a payoff letter replaces the estimate.
      </>
    );
  }
  if (question.id === "heloc_balance") {
    const recorded = recordedHeloc(property);
    if (!property) return question.help;
    if (recorded === 0) return "Nothing recorded in public records — the homeowner's answer is the only source. Counted fully drawn until verified.";
    if (recorded !== null) return `Public record shows a line of ${dollars(recorded)}. Counted fully drawn until a payoff letter says otherwise.`;
  }
  if (question.id === "signerNames" && property?.ownerNames.length) {
    return (
      <>
        Owner of record: <span className="font-medium text-foreground">{property.ownerNames.join(", ")}</span>
        {property.vesting ? ` (${property.vesting})` : ""}. {question.help}
      </>
    );
  }
  return question.help;
}

function StatementRow({ record }: { record: JobPayAtClose }) {
  const [opening, setOpening] = useState<string | null>(null);

  async function open(path: string) {
    if (!isSupabaseConfigured()) {
      toast.error("File storage is not connected.");
      return;
    }
    setOpening(path);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from(APPLICATION_UPLOAD_BUCKET).createSignedUrl(path, 600);
      if (error || !data?.signedUrl) {
        toast.error("Could not open that file.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="grid gap-2 py-4 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-6">
      <div>
        <p className="text-sm leading-snug font-medium">Mortgage statement or payoff letter</p>
        <p className="text-xs text-muted-foreground">Enter its figures as verified liens on the Pay at close tab to replace the estimate.</p>
      </div>
      <ul className="space-y-1.5">
        {record.application.uploads.map((upload) => (
          <li key={upload.path} className="flex items-center gap-2 rounded-[10px] border bg-card px-3 py-2 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{upload.name}</span>
              <span className="block text-xs text-muted-foreground">Uploaded by homeowner{upload.uploadedAt ? ` · ${formatDate(upload.uploadedAt)}` : ""}</span>
            </span>
            <Button type="button" size="sm" variant="outline" className="bg-card" disabled={opening === upload.path} onClick={() => void open(upload.path)}>
              <ExternalLink data-icon="inline-start" />
              Open
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Right rail                                                           */
/* ------------------------------------------------------------------ */

function RecommendationBadge({ recommendation }: { recommendation: Recommendation }) {
  const tone =
    recommendation === "approve"
      ? "bg-emerald-600 text-white"
      : recommendation === "approve_with_deposit"
        ? "bg-emerald-700/90 text-white"
        : recommendation === "decline"
          ? "bg-rose-600 text-white"
          : "bg-amber-600 text-white";
  return <span className={cn("rounded-[6px] px-2 py-0.5 text-xs font-semibold", tone)}>{RECOMMENDATION_LABELS[recommendation]}</span>;
}

function coverageLabel(coverage: number | null | undefined) {
  if (coverage == null) return "—";
  if (coverage > 10) return "Over 10×";
  return `${coverage.toFixed(coverage >= 3 ? 1 : 2)}×`;
}

function LiveReview({
  report,
  property,
  record,
  reviewing,
  onRun,
}: {
  report: PayAtCloseReport | null;
  property: PropertyRecord | null;
  record: JobPayAtClose;
  reviewing: boolean;
  onRun: () => void;
}) {
  const a = record.interview.answers;
  const estimate = recordedFirstMortgage(property);
  const said = typeof a.mortgage_balance === "number" ? a.mortgage_balance : 0;
  const heloc = recordedHeloc(property);
  const helocSaid = typeof a.heloc_balance === "number" ? a.heloc_balance : 0;
  const entity = property ? /trust|llc|estate|corp|inc\b/i.test(`${property.vesting} ${property.ownerNames.join(" ")}`) : false;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Live property review</p>
        {property && isSamplePropertyRecord(property) ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">Sample data</span> : null}
      </div>
      {report ? (
        <div className="space-y-3 rounded-[12px] border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <RecommendationBadge recommendation={report.recommendation} />
            <span className="text-xs text-muted-foreground">Score {report.score}</span>
          </div>
          <dl className="space-y-1.5 text-sm">
            <Row label="Est. seller net" value={formatCurrencyFull(report.waterfall.netProceeds)} />
            <Row label="Due at closing" value={formatCurrencyFull(report.waterfall.payAtCloseAmount)} />
            <Row label="Coverage" value={coverageLabel(report.waterfall.coverageRatio)} />
          </dl>
          <p className="text-[11px] text-muted-foreground">Updates when you run it again{report.generatedAt ? ` · last ${formatTime(report.generatedAt)}` : ""}.</p>
          <Button type="button" size="sm" variant="outline" className="w-full bg-card" disabled={reviewing} onClick={onRun}>
            <RefreshCw data-icon="inline-start" className={reviewing ? "animate-spin" : undefined} />
            {reviewing ? "Reviewing…" : "Run again"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-[12px] border bg-card p-3">
          <p className="text-sm text-muted-foreground">Pulls the public record for the job site and estimates seller net after loans and liens.</p>
          <Button type="button" size="sm" className="w-full" disabled={reviewing} onClick={onRun}>
            <RefreshCw data-icon="inline-start" className={reviewing ? "animate-spin" : undefined} />
            {reviewing ? "Reviewing…" : "Run property review"}
          </Button>
        </div>
      )}
      {property ? (
        <div className="space-y-3">
          <p className="text-xs font-medium">Public record vs. answers</p>
          <dl className="space-y-3 text-sm">
            <Compare
              label="First mortgage"
              record={estimate === null ? "None recorded" : `${dollars(estimate)} recorded est.`}
              note={
                said > 0 && estimate
                  ? Math.abs(said - estimate) / estimate <= 0.15
                    ? { text: "close to answer", tone: "ok" }
                    : { text: `homeowner says ${dollars(said)}`, tone: "warn" }
                  : said > 0
                    ? { text: `homeowner says ${dollars(said)}`, tone: "warn" }
                    : null
              }
            />
            <Compare
              label="HELOC"
              record={heloc ? `${dollars(heloc)} line recorded` : "None recorded"}
              note={helocSaid > 0 && !heloc ? { text: `homeowner says ${dollars(helocSaid)}`, tone: "warn" } : a.has_second_loan === false && heloc ? { text: "homeowner says none", tone: "warn" } : null}
            />
            <Compare
              label="Owner of record"
              record={property.ownerNames.join(", ") || "Unknown"}
              note={entity ? { text: /trust/i.test(`${property.vesting} ${property.ownerNames.join(" ")}`) ? "trustee must sign" : "authorized signer must sign", tone: "warn" } : null}
            />
            <Compare
              label="Taxes"
              record={property.taxDelinquentAmount > 0 ? `${dollars(property.taxDelinquentAmount)} delinquent` : "Current"}
              note={a.other_liens_kinds && String(a.other_liens_kinds).includes("property_tax") && property.taxDelinquentAmount === 0 ? { text: "homeowner says back taxes", tone: "warn" } : null}
            />
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Compare({ label, record, note }: { label: string; record: string; note: { text: string; tone: "ok" | "warn" } | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">
        {record}
        {note ? <span className={cn("ml-1", note.tone === "ok" ? "text-emerald-700" : "text-primary")}>· {note.text}</span> : null}
      </dd>
    </div>
  );
}

function OpenAnswers({
  draft,
  onJump,
  onAskHomeowner,
  askCount,
}: {
  draft: JobPayAtClose;
  onJump: (index: number) => void;
  onAskHomeowner?: () => void;
  askCount: number;
}) {
  const progress = interviewProgress(draft);
  const groups = REP_INTERVIEW_STEPS.map((step, index) => ({
    step,
    index,
    questions: step.questions.filter((question) => progress.requiredMissing.includes(question)),
  })).filter((group) => group.questions.length);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">
          {progress.requiredMissing.length ? `${progress.requiredMissing.length} required answer${progress.requiredMissing.length === 1 ? "" : "s"} open` : "Every required answer is in"}
        </p>
        <p className="text-xs text-muted-foreground">{progress.requiredMissing.length ? "You can submit anyway. The approver sees these as open." : "Run the property review, then submit."}</p>
      </div>
      {groups.map((group) => (
        <div key={group.step.id} className="rounded-[12px] border bg-card p-3">
          <p className="text-xs text-muted-foreground">{group.step.title}</p>
          <ul className="mt-1.5 space-y-1.5">
            {group.questions.map((question) => (
              <li key={question.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{question.prompt}</span>
                {!homeownerCanAnswer(question) ? <span className="shrink-0 text-[10px] text-muted-foreground">PM only</span> : null}
                <button type="button" onClick={() => onJump(group.index)} className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline">
                  Answer
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {onAskHomeowner ? (
        <Button type="button" variant="outline" className="w-full border-sky-300 bg-card text-sky-800 hover:bg-sky-50" onClick={onAskHomeowner}>
          Ask the homeowner the {askCount} they can answer
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Review step                                                          */
/* ------------------------------------------------------------------ */

function ReviewBody({
  draft,
  report,
  reviewing,
  note,
  onNote,
  onRun,
}: {
  draft: JobPayAtClose;
  report: PayAtCloseReport | null;
  reviewing: boolean;
  note: string;
  onNote: (value: string) => void;
  onRun: () => void;
}) {
  const flags = report?.flags.filter((flag) => flag.severity !== "info") ?? [];
  const coverage = report?.waterfall.coverageRatio ?? null;
  const plenty = coverage != null && coverage >= DEFAULT_THRESHOLDS.approveCoverage;
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-medium">Review and submit</h3>
      <div className="rounded-[12px] border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {report ? <RecommendationBadge recommendation={report.recommendation} /> : <span className="text-sm text-muted-foreground">Property review not run yet</span>}
            {report ? <span className="text-sm text-muted-foreground">Score {report.score}</span> : null}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {report?.generatedAt ? <span>Run {formatTime(report.generatedAt)}</span> : null}
            <Button type="button" size="sm" variant={report ? "outline" : "default"} className={report ? "bg-card" : undefined} disabled={reviewing} onClick={onRun}>
              <RefreshCw data-icon="inline-start" className={reviewing ? "animate-spin" : undefined} />
              {reviewing ? "Reviewing…" : report ? "Run again" : "Run property review"}
            </Button>
          </div>
        </div>
        {report ? (
          <>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <Metric label="Est. seller net" value={formatCurrencyFull(report.waterfall.netProceeds)} />
              <Metric label="Due to us at closing" value={formatCurrencyFull(report.waterfall.payAtCloseAmount)} />
              <Metric label="Coverage" value={coverageLabel(coverage)} />
            </dl>
            {flags.length ? (
              <div className="mt-4 rounded-[10px] bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                <p className="font-medium">{plenty ? "There’s plenty of equity. These are holding it back:" : "What the numbers show:"}</p>
                <ul className="mt-2 space-y-1.5">
                  {flags.map((flag) => (
                    <li key={flag.code} className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 rounded-[4px] px-1.5 py-px text-[10px] font-semibold uppercase",
                          flag.severity === "high" ? "bg-rose-600 text-white" : "bg-amber-200 text-amber-900",
                        )}
                      >
                        {flag.severity}
                      </span>
                      <span>{flag.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No watch or high flags.</p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Pulls the public record for {draft.property ? "the job site" : "the job site"} and estimates seller net after loans and liens.</p>
        )}
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Note for the approver</span>
        <span className="block text-xs text-muted-foreground">Anything the homeowner said that the numbers don’t show.</span>
        <Textarea
          value={note}
          rows={3}
          placeholder="e.g. Trust is the seller’s late mother’s; seller is the successor trustee and has the paperwork."
          onChange={(event) => onNote(event.target.value)}
        />
      </label>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-2xl font-medium tabular-nums">{value}</dd>
    </div>
  );
}
