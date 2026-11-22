"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Paperclip, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { QuestionField } from "@/components/pay-at-close-question";
import { SignaturePad } from "@/components/signature-pad";
import { formatDate } from "@/lib/format";
import {
  APPLICATION_AUTHORIZATIONS,
  APPLICATION_STEPS,
  applicationAuthorizationsComplete,
  authorizationText,
  interviewAnswered,
  interviewQuestionVisible,
  interviewValue,
  setInterviewValue,
  type ApplicationUpload,
  type InterviewQuestion,
  type InterviewValue,
  type JobPayAtClose,
} from "@/lib/pay-at-close";
import {
  APPLICATION_UPLOAD_MAX_BYTES,
  fieldValuesFromRecord,
  parseSharedApplication,
  recordFromSharedApplication,
  type SharedApplicationPayload,
} from "@/lib/pay-at-close-application";
import { cn } from "@/lib/utils";

const INTRO = -1;
const SIGN = APPLICATION_STEPS.length;
const DONE = APPLICATION_STEPS.length + 1;

type LoadState = { kind: "loading" } | { kind: "missing"; message: string } | { kind: "ready"; payload: SharedApplicationPayload };

export function PayAtCloseApplicationClient({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/share/pay-at-close/${encodeURIComponent(token)}`, { cache: "no-store" });
        const body: unknown = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          const message = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : "";
          setState({ kind: "missing", message: message || "This application link isn’t available." });
          return;
        }
        const payload = parseSharedApplication(body);
        if (!payload) {
          setState({ kind: "missing", message: "This application link isn’t available." });
          return;
        }
        setState({ kind: "ready", payload });
      } catch {
        if (!cancelled) setState({ kind: "missing", message: "We could not load the application. Check your connection and try again." });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === "loading") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center p-6 text-sm text-muted-foreground">Loading your application…</main>
    );
  }
  if (state.kind === "missing") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 p-6">
        <h1 className="font-heading text-2xl font-medium">Link not available</h1>
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </main>
    );
  }
  return <ApplicationForm key={state.payload.token} token={token} payload={state.payload} />;
}

function ApplicationForm({ token, payload }: { token: string; payload: SharedApplicationPayload }) {
  const [record, setRecord] = useState<JobPayAtClose>(() => recordFromSharedApplication(payload));
  const [page, setPage] = useState(() => (payload.submittedAt ? DONE : INTRO));
  const [touched, setTouched] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [signatureName, setSignatureName] = useState("");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submittedAt, setSubmittedAt] = useState<string | null>(payload.submittedAt);
  const [uploads, setUploads] = useState<ApplicationUpload[]>(payload.uploads);
  const topRef = useRef<HTMLDivElement>(null);

  const company = payload.company;
  const address = [payload.job.street, [payload.job.city, payload.job.state].filter(Boolean).join(", "), payload.job.postalCode]
    .filter(Boolean)
    .join(" · ");
  const step = page >= 0 && page < SIGN ? APPLICATION_STEPS[page] : null;
  const visibleQuestions = step ? step.questions.filter((question) => interviewQuestionVisible(record, question)) : [];
  const stepMissing = visibleQuestions.filter((question) => question.required && !interviewAnswered(record, question));

  function go(next: number) {
    setTouched(false);
    setError("");
    setPage(next);
    topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function answer(question: InterviewQuestion, value: InterviewValue) {
    setRecord((current) => setInterviewValue(current, question, value));
  }

  function next() {
    if (stepMissing.length) {
      setTouched(true);
      setError(stepMissing.length === 1 ? "One more answer is needed on this page." : `${stepMissing.length} answers are needed on this page.`);
      return;
    }
    go(page + 1);
  }

  async function submit() {
    if (!applicationAuthorizationsComplete(checked)) {
      setError("Check each of the four boxes to continue.");
      return;
    }
    if (!signatureName.trim()) {
      setError("Type your full name as it appears on the deed.");
      return;
    }
    if (!signatureImage) {
      setError("Draw your signature in the box.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/share/pay-at-close/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: record.interview.answers,
          fields: fieldValuesFromRecord(record),
          signatureName: signatureName.trim(),
          signatureImage,
          authorizations: checked,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; submitted?: boolean; submittedAt?: string };
      if (!response.ok || !body.ok) {
        if (body.submitted) {
          setSubmittedAt(new Date().toISOString());
          go(DONE);
          return;
        }
        setError(body.error || "Could not submit. Try again in a moment.");
        return;
      }
      setSubmittedAt(body.submittedAt ?? new Date().toISOString());
      go(DONE);
    } catch {
      setError("Could not submit. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div ref={topRef} className="scroll-mt-4">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{company.name}</p>
            <h1 className="font-heading text-2xl font-medium tracking-tight sm:text-3xl">Pay at Close application</h1>
            {address ? <p className="mt-1 text-sm text-muted-foreground">{address}</p> : null}
          </div>
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt="" className="h-10 w-auto max-w-[9rem] shrink-0 object-contain" />
          ) : null}
        </header>
        {page >= 0 && page <= SIGN ? (
          <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="Pages">
            {[...APPLICATION_STEPS.map((item) => item.title), "Sign"].map((title, index) => {
              const done =
                index < SIGN
                  ? APPLICATION_STEPS[index].questions
                      .filter((question) => interviewQuestionVisible(record, question) && question.required)
                      .every((question) => interviewAnswered(record, question)) && index < page
                  : false;
              return (
                <li key={title}>
                  <button
                    type="button"
                    onClick={() => (index <= page ? go(index) : undefined)}
                    disabled={index > page}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs disabled:opacity-50",
                      index === page ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-3" /> : <span className="tabular-nums">{index + 1}</span>}
                    {title}
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>

      {page === INTRO ? (
        <section className="space-y-5 rounded-[14px] border bg-card p-5 sm:p-6">
          <div className="space-y-2">
            <h2 className="text-lg font-medium">{payload.homeowner ? `Hi ${payload.homeowner.split(" ")[0]},` : "Hello,"}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Pay at Close lets you finish the repairs your sale needs now and pay for them from your proceeds when the home closes. There is
              no payment until closing. To set that up we need a few facts about the sale, who is on the deed, and what is owed on the home,
              plus your permission to confirm them with public records and your title company.
            </p>
          </div>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              "About 5 minutes.",
              "Round numbers are fine; we will confirm the exact figures.",
              "Nothing is final until you sign the construction agreement.",
              "Your answers are shared only with the contractor handling your repair.",
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {payload.contractValue > 0 ? (
            <p className="text-sm">
              Amount to be paid at closing: <span className="font-medium tabular-nums">{money(payload.contractValue)}</span>
            </p>
          ) : null}
          {payload.rep ? (
            <p className="text-xs text-muted-foreground">
              Questions? {payload.rep.name}
              {payload.rep.title ? `, ${payload.rep.title}` : ""}
              {payload.rep.phone ? ` · ${payload.rep.phone}` : ""}
              {payload.rep.email ? ` · ${payload.rep.email}` : ""}
            </p>
          ) : null}
          <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => go(0)}>
            Start
            <ArrowRight data-icon="inline-end" />
          </Button>
        </section>
      ) : null}

      {step ? (
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-medium">{step.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{step.intro}</p>
          </div>
          {visibleQuestions.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              value={interviewValue(record, question)}
              missing={touched && question.required === true && !interviewAnswered(record, question)}
              onChange={(value) => answer(question, value)}
            />
          ))}
          {step.id === "debt" ? <UploadBox token={token} uploads={uploads} onUploads={setUploads} /> : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <Nav
            onBack={() => go(page - 1)}
            onNext={next}
            nextLabel={page === SIGN - 1 ? "Review and sign" : "Next"}
            skippable={stepMissing.length > 0}
            onSkip={() => go(page + 1)}
          />
        </section>
      ) : null}

      {page === SIGN ? (
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-medium">Authorizations and signature</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Read each item and check the box. Then type your name and sign. This is not the construction contract; you will see and sign that
              separately with the exact scope and price.
            </p>
          </div>
          <ul className="space-y-3">
            {APPLICATION_AUTHORIZATIONS.map((authorization) => {
              const on = checked.includes(authorization.id);
              return (
                <li key={authorization.id}>
                  <label className={cn("flex cursor-pointer gap-3 rounded-[12px] border p-4", on ? "border-primary/60 bg-primary/5" : "bg-card")}>
                    <Checkbox
                      checked={on}
                      onCheckedChange={(value) =>
                        setChecked((current) => (value ? [...current.filter((id) => id !== authorization.id), authorization.id] : current.filter((id) => id !== authorization.id)))
                      }
                      className="mt-0.5"
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-medium">{authorization.title}</span>
                      <span className="block text-sm leading-relaxed text-muted-foreground">{authorizationText(authorization, company.name)}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="space-y-4 rounded-[12px] border bg-card p-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Your full name</span>
              <Input value={signatureName} autoComplete="name" placeholder="As it appears on the deed" onChange={(event) => setSignatureName(event.target.value)} />
            </label>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Signature</span>
              <SignaturePad emptyHint="Draw your signature in the box." onChange={setSignatureImage} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              By signing you agree that your electronic signature has the same effect as a handwritten one, and that the statements above are
              true. We record the date, time, and network address with your signature.
            </p>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => go(SIGN - 1)}>
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
            <Button type="button" size="lg" disabled={submitting} onClick={() => void submit()}>
              <Check data-icon="inline-start" />
              {submitting ? "Submitting…" : "Sign and submit"}
            </Button>
          </div>
        </section>
      ) : null}

      {page === DONE ? (
        <section className="space-y-4 rounded-[14px] border bg-card p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-content-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Check className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-medium">Thank you{payload.homeowner ? `, ${payload.homeowner.split(" ")[0]}` : ""}.</h2>
              <p className="text-sm text-muted-foreground">
                Your application was signed and sent{submittedAt ? ` on ${formatDate(submittedAt)}` : ""}.
              </p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {company.name} will review it, confirm the property record and the closing with your title company, and get back to you. If you
            have a mortgage statement or payoff letter you did not upload, text or email it to {payload.rep?.name || "your contractor"}
            {payload.rep?.phone ? ` at ${payload.rep.phone}` : payload.rep?.email ? ` at ${payload.rep.email}` : ""}.
          </p>
          {uploads.length ? (
            <ul className="space-y-1 text-sm">
              {uploads.map((upload) => (
                <li key={upload.path} className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="size-4" />
                  {upload.name}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <footer className="mt-auto pt-4 text-center text-xs text-muted-foreground">
        {company.name}
        {company.phone ? ` · ${company.phone}` : ""}
        {company.website ? ` · ${company.website.replace(/^https?:\/\//, "")}` : ""}
      </footer>
    </main>
  );
}

function Nav({
  onBack,
  onNext,
  nextLabel,
  skippable,
  onSkip,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  skippable: boolean;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button type="button" variant="ghost" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" />
        Back
      </Button>
      <div className="flex gap-2">
        {skippable ? (
          <Button type="button" variant="ghost" onClick={onSkip}>
            I don’t know yet
          </Button>
        ) : null}
        <Button type="button" onClick={onNext}>
          {nextLabel}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}

function UploadBox({ token, uploads, onUploads }: { token: string; uploads: ApplicationUpload[]; onUploads: (next: ApplicationUpload[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    if (file.size > APPLICATION_UPLOAD_MAX_BYTES) {
      setMessage("Files are limited to 15 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/share/pay-at-close/${encodeURIComponent(token)}/upload`, { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; uploads?: unknown };
      if (!response.ok || !body.ok) {
        setMessage(body.error || "Could not upload that file.");
        return;
      }
      if (Array.isArray(body.uploads)) {
        onUploads(body.uploads as ApplicationUpload[]);
      }
      setMessage("Uploaded.");
    } catch {
      setMessage("Could not upload that file. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3 rounded-[12px] border border-dashed bg-card p-4">
      <div className="flex items-start gap-3">
        <Paperclip className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Mortgage statement or payoff letter (optional)</p>
          <p className="text-xs text-muted-foreground">A PDF or a photo of the first page is enough. It lets us use your real balance instead of an estimate.</p>
        </div>
      </div>
      {uploads.length ? (
        <ul className="space-y-1 text-sm">
          {uploads.map((upload) => (
            <li key={upload.path} className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <span className="truncate">{upload.name}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{Math.max(1, Math.round(upload.size / 1024))} KB</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
          }}
        />
        <Button type="button" variant="outline" className="bg-card" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload data-icon="inline-start" />
          {busy ? "Uploading…" : uploads.length ? "Add another file" : "Upload a file"}
        </Button>
        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      </div>
    </div>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
