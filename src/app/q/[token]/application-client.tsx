"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/currency-input";
import { PhoneInput } from "@/components/phone-input";
import { firstName } from "@/lib/phone";
import {
  APPLICATION_AUTHORIZATIONS,
  HOMEOWNER_LISTING_CHOICES,
  OTHER_OWED_KINDS,
  OWNERSHIP_KINDS,
  applicationMinutes,
  applicationProgress,
  applicationSectionsToShow,
  authorizationText,
  homeownerPromptVisible,
  type ApplicationUpload,
  type HomeownerSection,
  type JobPayAtClose,
} from "@/lib/pay-at-close";
import {
  APPLICATION_UPLOAD_MAX_BYTES,
  parseSharedApplication,
  recordFromSharedApplication,
  type SharedApplicationPayload,
} from "@/lib/pay-at-close-application";
import {
  emptyHomeownerAnswers,
  homeownerAnswersFromRecord,
  homeownerSubmission,
  normalizeZip,
  recordWithHomeownerAnswers,
  toggleOtherOwed,
  type HomeownerAnswers,
} from "@/lib/pay-at-close-homeowner";
import { cn } from "@/lib/utils";

type Page = { kind: "intro" } | { kind: "step"; index: number } | { kind: "review" } | { kind: "done" };

type LoadState =
  | { kind: "loading" }
  | { kind: "missing"; message: string }
  | { kind: "ready"; payload: SharedApplicationPayload };

type SaveState = "idle" | "saving" | "saved" | "failed";

export function PayAtCloseApplicationClient({ token, preview = false }: { token: string; preview?: boolean }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await fetchApplication(token, "");
        if (cancelled) return;
        if (!payload.ok) {
          setState({ kind: "missing", message: payload.error });
          return;
        }
        setState({ kind: "ready", payload: payload.payload });
      } catch {
        if (!cancelled) setState({ kind: "missing", message: "We could not load this page. Check your connection and try again." });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === "loading") {
    return (
      <Frame company="" right={null} progress={null}>
        <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
      </Frame>
    );
  }
  if (state.kind === "missing") {
    return (
      <Frame company="" right={null} progress={null}>
        <div className="space-y-3 py-10">
          <h1 className="font-heading text-3xl font-medium tracking-tight">This link isn’t available</h1>
          <p className="text-base leading-relaxed text-muted-foreground">{state.message}</p>
        </div>
      </Frame>
    );
  }
  return <Application key={state.payload.token} token={token} initial={state.payload} preview={preview} />;
}

async function fetchApplication(token: string, zip: string): Promise<{ ok: true; payload: SharedApplicationPayload } | { ok: false; error: string }> {
  const query = zip ? `?zip=${encodeURIComponent(zip)}` : "";
  const response = await fetch(`/api/share/pay-at-close/${encodeURIComponent(token)}${query}`, { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : "";
    return { ok: false, error: message || "This link isn’t available. Ask your contractor for a fresh one." };
  }
  const payload = parseSharedApplication(body);
  if (!payload) return { ok: false, error: "This link isn’t available. Ask your contractor for a fresh one." };
  return { ok: true, payload };
}

function Application({ token, initial, preview }: { token: string; initial: SharedApplicationPayload; preview: boolean }) {
  const [payload, setPayload] = useState(initial);
  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState("");
  const [opening, setOpening] = useState(false);
  const [answers, setAnswers] = useState<HomeownerAnswers>(() => (initial.unlocked ? homeownerAnswersFromRecord(recordFromSharedApplication(initial)) : emptyHomeownerAnswers()));
  const [uploads, setUploads] = useState<ApplicationUpload[]>(initial.uploads);
  const [page, setPage] = useState<Page>(() => (initial.unlocked && initial.submittedAt ? { kind: "done" } : { kind: "intro" }));
  const [save, setSave] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submittedAt, setSubmittedAt] = useState<string | null>(initial.submittedAt);
  const topRef = useRef<HTMLDivElement>(null);
  const lastSaved = useRef("");
  const timer = useRef<number | null>(null);

  const company = payload.company;
  const repFirst = payload.rep ? firstName(payload.rep.name) : "";
  const repSms = payload.rep?.phone ? `sms:${payload.rep.phone.replace(/[^\d+]/g, "")}` : "";
  const base = useMemo(() => {
    const record = recordFromSharedApplication(payload);
    record.application.uploads = uploads;
    return record;
  }, [payload, uploads]);
  const working = useMemo(() => recordWithHomeownerAnswers(base, answers), [base, answers]);
  const sections = useMemo(() => applicationSectionsToShow(base), [base]);
  const progress = useMemo(() => applicationProgress(working), [working]);
  const openOnShown = progress.sections.filter((item) => sections.includes(item.section)).reduce((sum, item) => sum + item.open, 0);
  const minutes = applicationMinutes(Math.max(openOnShown, sections.length));
  const readOnly = Boolean(submittedAt) || preview;

  const persist = useCallback(
    async (next: HomeownerAnswers) => {
      if (preview || submittedAt || !payload.unlocked) return;
      const submission = homeownerSubmission(next, payload.answers);
      const body = JSON.stringify({ zip, ...submission });
      if (body === lastSaved.current) return;
      setSave("saving");
      try {
        const response = await fetch(`/api/share/pay-at-close/${encodeURIComponent(token)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body,
        });
        if (!response.ok) {
          setSave("failed");
          return;
        }
        lastSaved.current = body;
        setSave("saved");
      } catch {
        setSave("failed");
      }
    },
    [payload.answers, payload.unlocked, preview, submittedAt, token, zip],
  );

  // Save as they go: a short pause after the last change, and again when they turn the page.
  useEffect(() => {
    if (page.kind !== "step" || readOnly) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(answers), 900);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [answers, page.kind, persist, readOnly]);

  function go(next: Page) {
    setError("");
    if (page.kind === "step" && !readOnly) void persist(answers);
    setPage(next);
    window.requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start" }));
  }

  async function start() {
    if (payload.unlocked) {
      setAnswers(homeownerAnswersFromRecord(recordFromSharedApplication(payload)));
      go(submittedAt ? { kind: "done" } : { kind: "step", index: 0 });
      return;
    }
    const typed = normalizeZip(zip);
    if (!typed) {
      setZipError("Enter the 5-digit ZIP code of the property.");
      return;
    }
    setOpening(true);
    setZipError("");
    try {
      const result = await fetchApplication(token, typed);
      if (!result.ok) {
        setZipError(result.error);
        return;
      }
      if (!result.payload.unlocked) {
        setZipError(result.payload.expired ? "This link has expired. Ask your contractor for a new one." : "That ZIP doesn’t match the property on file. Check it and try again.");
        return;
      }
      setZip(typed);
      setPayload(result.payload);
      setUploads(result.payload.uploads);
      setSubmittedAt(result.payload.submittedAt);
      setAnswers(homeownerAnswersFromRecord(recordFromSharedApplication(result.payload)));
      go(result.payload.submittedAt ? { kind: "done" } : { kind: "step", index: 0 });
    } catch {
      setZipError("We could not open the page. Check your connection and try again.");
    } finally {
      setOpening(false);
    }
  }

  async function submit() {
    if (preview) {
      setError("This is a preview. Nothing is sent from here.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const submission = homeownerSubmission(answers, payload.answers);
      const response = await fetch(`/api/share/pay-at-close/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zip,
          ...submission,
          authorizations: answers.contactConsent ? APPLICATION_AUTHORIZATIONS.map((item) => item.id) : [],
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; submitted?: boolean; submittedAt?: string };
      if (!response.ok || !body.ok) {
        if (body.submitted) {
          setSubmittedAt(new Date().toISOString());
          go({ kind: "done" });
          return;
        }
        setError(body.error || "Could not send your answers. Try again in a moment.");
        return;
      }
      setSubmittedAt(body.submittedAt ?? new Date().toISOString());
      go({ kind: "done" });
    } catch {
      setError("Could not send your answers. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const stepIndex = page.kind === "step" ? page.index : -1;
  const section = stepIndex >= 0 ? sections[stepIndex] : null;
  const headerRight =
    page.kind === "intro" ? (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Lock className="size-3.5" />
        Secure link
      </span>
    ) : page.kind === "step" ? (
      <span className="text-sm text-muted-foreground">
        Step {stepIndex + 1} of {sections.length} · <SaveWord state={save} readOnly={readOnly} />
      </span>
    ) : page.kind === "review" ? (
      <span className="text-sm text-muted-foreground">{submittedAt ? "Sent" : preview ? "Preview" : "All saved"}</span>
    ) : null;
  const progressValue = page.kind === "step" ? (stepIndex + 1) / (sections.length + 1) : page.kind === "review" ? 1 : null;

  return (
    <Frame company={company.name} right={headerRight} progress={progressValue} topRef={topRef}>
      {preview ? (
        <p className="mb-4 rounded-[10px] border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Preview as the homeowner. Nothing you type here is saved.
        </p>
      ) : null}

      {page.kind === "intro" ? (
        <Intro
          payload={payload}
          sections={sections}
          minutes={minutes}
          zip={zip}
          zipError={zipError}
          opening={opening}
          submitted={Boolean(submittedAt)}
          repFirst={repFirst}
          repSms={repSms}
          onZip={(value) => {
            setZip(value);
            setZipError("");
          }}
          onStart={() => void start()}
        />
      ) : null}

      {section ? (
        <section className="flex min-h-[60dvh] flex-col">
          <Heading title={section.title} intro={section.intro} />
          <div className="mt-6 space-y-6">
            {section.id === "sale" ? <SaleStep answers={answers} onChange={setAnswers} /> : null}
            {section.id === "title" ? <TitleStep answers={answers} onChange={setAnswers} state={payload.job.state} /> : null}
            {section.id === "owed" ? (
              <OwedStep answers={answers} onChange={setAnswers} token={token} zip={zip} uploads={uploads} onUploads={setUploads} readOnly={readOnly} />
            ) : null}
            {section.id === "contacts" ? <ContactsStep answers={answers} onChange={setAnswers} company={company.name} /> : null}
          </div>
          {error ? <p className="mt-4 text-sm text-primary">{error}</p> : null}
          <Footer>
            <Button type="button" variant="outline" size="lg" className="h-14 rounded-[14px] bg-card px-6 text-base" onClick={() => go(stepIndex === 0 ? { kind: "intro" } : { kind: "step", index: stepIndex - 1 })}>
              Back
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-14 flex-1 rounded-[14px] text-base font-semibold"
              onClick={() => go(stepIndex + 1 < sections.length ? { kind: "step", index: stepIndex + 1 } : { kind: "review" })}
            >
              {stepIndex + 1 < sections.length ? "Continue" : "Review answers"}
            </Button>
          </Footer>
        </section>
      ) : null}

      {page.kind === "review" ? (
        <section className="flex min-h-[60dvh] flex-col">
          <Heading title="Look everything over" intro={readOnly ? "What you sent." : "Tap Edit to change an answer."} />
          <div className="mt-5 space-y-3">
            {sections.map((item, index) => (
              <ReviewCard key={item.id} section={item} record={working} onEdit={readOnly ? undefined : () => go({ kind: "step", index })} />
            ))}
          </div>
          {error ? <p className="mt-4 text-sm text-primary">{error}</p> : null}
          <Footer
            note={
              submittedAt
                ? null
                : `Blank answers are OK — ${repFirst || company.name} will follow up if needed.`
            }
          >
            {submittedAt ? (
              <Button type="button" variant="outline" size="lg" className="h-14 flex-1 rounded-[14px] bg-card text-base" onClick={() => go({ kind: "done" })}>
                Back
              </Button>
            ) : (
              <Button type="button" size="lg" className="h-14 flex-1 rounded-[14px] text-base font-semibold" disabled={submitting} onClick={() => void submit()}>
                {submitting ? "Sending…" : `Send to ${company.name}`}
              </Button>
            )}
          </Footer>
        </section>
      ) : null}

      {page.kind === "done" ? (
        <Done
          company={company.name}
          repFirst={repFirst}
          repSms={repSms}
          amount={payload.contractValue}
          onView={() => go({ kind: "review" })}
        />
      ) : null}
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome                                                               */
/* ------------------------------------------------------------------ */

function Frame({
  company,
  right,
  progress,
  topRef,
  children,
}: {
  company: string;
  right: React.ReactNode;
  progress: number | null;
  topRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <span className="text-sm font-bold tracking-[0.04em] uppercase">{company || "\u00a0"}</span>
          {right}
        </div>
        <div className="h-1 bg-border">
          {progress !== null ? <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} /> : null}
        </div>
      </header>
      <div ref={topRef} className="scroll-mt-16" />
      <div className="flex flex-1 flex-col px-5 pt-6 pb-8">{children}</div>
    </main>
  );
}

function Heading({ title, intro }: { title: string; intro: string }) {
  return (
    <div>
      <h1 className="font-heading text-[2rem] leading-tight font-medium tracking-tight">{title}</h1>
      <p className="mt-2 text-base leading-relaxed text-muted-foreground">{intro}</p>
    </div>
  );
}

function Footer({ children, note }: { children: React.ReactNode; note?: string | null }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-auto border-t bg-background/95 px-5 pt-3 pb-5 backdrop-blur">
      {note ? <p className="mb-3 text-center text-sm text-muted-foreground">{note}</p> : null}
      <div className="flex gap-3">{children}</div>
    </div>
  );
}

function SaveWord({ state, readOnly }: { state: SaveState; readOnly: boolean }) {
  if (readOnly) return <>Saved</>;
  if (state === "saving") return <>Saving…</>;
  if (state === "failed") return <span className="text-primary">Not saved</span>;
  return <>Saved</>;
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2">
      <p className="text-base font-semibold">{children}</p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const CHOICE =
  "min-h-14 rounded-[14px] border bg-card px-4 text-left text-base transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";
const CHOICE_ON = "border-primary ring-1 ring-primary bg-primary/5";

function Choice({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn(CHOICE, on ? CHOICE_ON : "hover:bg-muted/40", className)}>
      {children}
    </button>
  );
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (next: boolean | null) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "Yes", choice: true },
        { label: "No", choice: false },
      ].map((option) => (
        <Choice key={option.label} on={value === option.choice} onClick={() => onChange(value === option.choice ? null : option.choice)} className="text-center">
          {option.label}
        </Choice>
      ))}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border bg-card px-4 py-2.5 text-base transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
        on ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:bg-muted/40",
      )}
    >
      {children}
    </button>
  );
}

const FIELD = "h-14 rounded-[14px] px-4 text-base md:text-base";

/* ------------------------------------------------------------------ */
/* Intro                                                                */
/* ------------------------------------------------------------------ */

function Intro({
  payload,
  sections,
  minutes,
  zip,
  zipError,
  opening,
  submitted,
  repFirst,
  repSms,
  onZip,
  onStart,
}: {
  payload: SharedApplicationPayload;
  sections: HomeownerSection[];
  minutes: number;
  zip: string;
  zipError: string;
  opening: boolean;
  submitted: boolean;
  repFirst: string;
  repSms: string;
  onZip: (value: string) => void;
  onStart: () => void;
}) {
  const address = [payload.job.street, [payload.job.city, payload.job.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const needsZip = payload.zipRequired && !payload.unlocked;
  if (payload.expired) {
    return (
      <section className="flex min-h-[60dvh] flex-col">
        <Heading title="This link has expired" intro={`Links stay open for seven days. ${repFirst ? `Text ${repFirst}` : `Ask ${payload.company.name}`} for a new one and your saved answers will still be there.`} />
        {repSms ? (
          <a href={repSms} className="mt-6 inline-flex h-14 items-center justify-center rounded-[14px] bg-primary px-6 text-base font-semibold text-primary-foreground">
            Text {repFirst}
          </a>
        ) : null}
      </section>
    );
  }
  return (
    <section className="flex min-h-[60dvh] flex-col">
      <h1 className="font-heading text-[2.1rem] leading-[1.15] font-medium tracking-tight">Pay for your roof when your home sells</h1>
      <div className="mt-5 rounded-[14px] bg-muted/50 p-4">
        {address ? <p className="text-base text-muted-foreground">{address}</p> : null}
        {payload.contractValue > 0 ? <p className="mt-1 font-heading text-[2rem] leading-tight font-medium">{money(payload.contractValue)}</p> : null}
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">Paid from your sale proceeds at closing. Nothing is due today.</p>
      </div>
      {submitted ? (
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">You already sent your answers. Confirm the ZIP to look them over.</p>
      ) : (
        <>
          <p className="mt-6 text-base font-semibold">
            A few questions so we can line up with your closing · about {minutes} minute{minutes === 1 ? "" : "s"}
          </p>
          <ol className="mt-2 space-y-1 pl-6 text-base" style={{ listStyle: "decimal" }}>
            {sections.map((section) => (
              <li key={section.id} className="pl-1">
                {section.title}
              </li>
            ))}
          </ol>
          {sections.some((section) => section.id === "owed") ? <p className="mt-3 text-sm text-muted-foreground">Helpful but optional: your latest mortgage statement.</p> : null}
        </>
      )}
      {needsZip ? (
        <div className="mt-6">
          <Label>To start, confirm the property ZIP code</Label>
          <Input
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={10}
            value={zip}
            placeholder="ZIP code"
            aria-invalid={zipError ? true : undefined}
            className={FIELD}
            onChange={(event) => onZip(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onStart();
            }}
          />
          {zipError ? <p className="mt-2 text-sm text-primary">{zipError}</p> : null}
        </div>
      ) : null}
      <div className="mt-auto pt-8">
        <Button type="button" size="lg" className="h-14 w-full rounded-[14px] text-lg font-semibold" disabled={opening} onClick={onStart}>
          {opening ? "Opening…" : submitted ? "View my answers" : "Get started"}
        </Button>
        <p className="mt-3 text-center text-sm leading-relaxed text-muted-foreground">
          Your answers go only to {payload.company.name} and save as you go.
          {payload.rep ? (
            <>
              {" "}
              Questions?{" "}
              {repSms ? (
                <a href={repSms} className="text-primary underline underline-offset-2">
                  Text {repFirst}, your {payload.rep.title?.trim() ? payload.rep.title.trim().toLowerCase() : "project manager"}
                </a>
              ) : (
                <>
                  Ask {repFirst}, your {payload.rep.title?.trim() ? payload.rep.title.trim().toLowerCase() : "project manager"}
                </>
              )}
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Steps                                                                */
/* ------------------------------------------------------------------ */

type StepProps = { answers: HomeownerAnswers; onChange: React.Dispatch<React.SetStateAction<HomeownerAnswers>> };

function SaleStep({ answers, onChange }: StepProps) {
  return (
    <>
      <div>
        <Label>Where is the home in the sale?</Label>
        <div role="radiogroup" className="space-y-3">
          {HOMEOWNER_LISTING_CHOICES.map((choice) => {
            const on = answers.listingStatus === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange((current) => ({ ...current, listingStatus: on ? "" : choice.value }))}
                className={cn(CHOICE, "flex w-full items-center gap-3", on ? CHOICE_ON : "hover:bg-muted/40")}
              >
                <span className={cn("grid size-5 shrink-0 place-content-center rounded-full border", on ? "border-primary bg-primary" : "border-muted-foreground/40 bg-card")}>
                  {on ? <span className="size-2 rounded-full bg-primary-foreground" /> : null}
                </span>
                {choice.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <Label>When do you expect to close?</Label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <Input
            type="month"
            aria-label="Month and year"
            value={answers.closeMonth}
            placeholder="Month and year"
            className={FIELD}
            onChange={(event) => onChange((current) => ({ ...current, closeMonth: event.target.value, closeUnknown: event.target.value ? false : current.closeUnknown }))}
          />
          <Choice on={answers.closeUnknown} onClick={() => onChange((current) => ({ ...current, closeUnknown: !current.closeUnknown, closeMonth: current.closeUnknown ? current.closeMonth : "" }))} className="px-4 text-center leading-tight">
            Not sure
            <br />
            yet
          </Choice>
        </div>
      </div>
      <div>
        <Label hint={answers.listingStatus === "under_contract" || answers.listingStatus === "pending" ? "Or the agreed sale price" : "Or what you expect to list at"}>Asking price</Label>
        <CurrencyInput
          aria-label="Asking price"
          value={answers.askingPrice ?? ""}
          className={FIELD}
          onValueChange={(text) => {
            const amount = Number(text);
            onChange((current) => ({ ...current, askingPrice: text === "" || !Number.isFinite(amount) || amount <= 0 ? null : amount }));
          }}
        />
      </div>
    </>
  );
}

function TitleStep({ answers, onChange, state }: StepProps & { state: string }) {
  const trust = answers.ownership === "trust";
  const texas = state.trim().toUpperCase() === "TX";
  const showSpouseNote = answers.ownership === "" || answers.ownership === "just_me" || answers.ownership === "spouse" || answers.ownership === "others";
  return (
    <>
      <div>
        <Label>How is the home owned?</Label>
        <div className="grid grid-cols-2 gap-3">
          {OWNERSHIP_KINDS.map((kind) => (
            <Choice key={kind.value} on={answers.ownership === kind.value} onClick={() => onChange((current) => ({ ...current, ownership: current.ownership === kind.value ? "" : kind.value }))}>
              {kind.label}
            </Choice>
          ))}
        </div>
      </div>
      {trust ? (
        <div>
          <Label>Who is the trustee?</Label>
          <Input value={answers.trustee} placeholder="Full name" autoComplete="off" className={FIELD} onChange={(event) => onChange((current) => ({ ...current, trustee: event.target.value }))} />
        </div>
      ) : null}
      <div>
        <Label>Names exactly as they appear on the deed</Label>
        <Input
          value={answers.deedNames}
          placeholder={trust ? "e.g. Jones Family Trust" : answers.ownership === "llc" ? "e.g. Arrowwood Holdings LLC" : answers.ownership === "estate" ? "e.g. Estate of Mary Jones" : "e.g. John and Mary Jones"}
          autoComplete="off"
          className={FIELD}
          onChange={(event) => onChange((current) => ({ ...current, deedNames: event.target.value }))}
        />
        <p className="mt-2 text-sm text-muted-foreground">Not sure? Leave it blank — we’ll check public records.</p>
      </div>
      {showSpouseNote ? (
        <p className="rounded-[12px] bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          {texas
            ? "If this is your homestead and you’re married, Texas requires both spouses to sign."
            : "If you’re married, your spouse may need to sign too, even when they’re not on the deed."}
        </p>
      ) : null}
    </>
  );
}

function OwedStep({
  answers,
  onChange,
  token,
  zip,
  uploads,
  onUploads,
  readOnly,
}: StepProps & { token: string; zip: string; uploads: ApplicationUpload[]; onUploads: (next: ApplicationUpload[]) => void; readOnly: boolean }) {
  return (
    <>
      <div>
        <Label>About how much is left on your mortgage?</Label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <CurrencyInput
            aria-label="Mortgage balance"
            value={answers.noMortgage ? "" : (answers.mortgageBalance ?? "")}
            disabled={answers.noMortgage}
            className={FIELD}
            onValueChange={(text) => {
              const amount = Number(text);
              onChange((current) => ({ ...current, mortgageBalance: text === "" || !Number.isFinite(amount) || amount <= 0 ? null : amount }));
            }}
          />
          <Choice
            on={answers.noMortgage}
            onClick={() =>
              onChange((current) => ({
                ...current,
                noMortgage: !current.noMortgage,
                mortgageBalance: current.noMortgage ? current.mortgageBalance : null,
                mortgageCurrent: current.noMortgage ? current.mortgageCurrent : null,
                hasSecondLoan: current.noMortgage ? current.hasSecondLoan : null,
                secondLoanBalance: current.noMortgage ? current.secondLoanBalance : null,
              }))
            }
            className="px-4 text-center leading-tight"
          >
            No
            <br />
            mortgage
          </Choice>
        </div>
      </div>
      {!answers.noMortgage ? (
        <>
          <div>
            <Label>Are your payments up to date?</Label>
            <YesNo value={answers.mortgageCurrent} onChange={(next) => onChange((current) => ({ ...current, mortgageCurrent: next }))} />
          </div>
          <div>
            <Label>Any home equity line or second loan?</Label>
            <YesNo value={answers.hasSecondLoan} onChange={(next) => onChange((current) => ({ ...current, hasSecondLoan: next, secondLoanBalance: next ? current.secondLoanBalance : null }))} />
            {answers.hasSecondLoan ? (
              <CurrencyInput
                aria-label="Second loan balance"
                value={answers.secondLoanBalance ?? ""}
                className={cn(FIELD, "mt-3")}
                onValueChange={(text) => {
                  const amount = Number(text);
                  onChange((current) => ({ ...current, secondLoanBalance: text === "" || !Number.isFinite(amount) || amount <= 0 ? null : amount }));
                }}
              />
            ) : null}
          </div>
        </>
      ) : null}
      <div>
        <Label>Anything else owed against the home?</Label>
        <div className="flex flex-wrap gap-2.5">
          {OTHER_OWED_KINDS.map((kind) => (
            <Chip key={kind.value} on={answers.otherOwed.includes(kind.value)} onClick={() => onChange((current) => ({ ...current, otherOwed: toggleOtherOwed(current.otherOwed, kind.value) }))}>
              {kind.label}
            </Chip>
          ))}
        </div>
      </div>
      {!answers.noMortgage ? <UploadBox token={token} zip={zip} uploads={uploads} onUploads={onUploads} readOnly={readOnly} /> : null}
    </>
  );
}

function ContactsStep({ answers, onChange, company }: StepProps & { company: string }) {
  const consent = APPLICATION_AUTHORIZATIONS[0];
  return (
    <>
      <div className="space-y-3">
        <Label>Your real estate agent</Label>
        <Input value={answers.agentName} placeholder="Name and brokerage" autoComplete="off" className={FIELD} onChange={(event) => onChange((current) => ({ ...current, agentName: event.target.value }))} />
        <PhoneInput value={answers.agentPhone} placeholder="Agent phone" autoComplete="off" className={FIELD} onValueChange={(next) => onChange((current) => ({ ...current, agentPhone: next }))} />
      </div>
      <div className="space-y-3">
        <Label>Title or escrow company</Label>
        <Input
          value={answers.titleCompany}
          placeholder="Company name"
          autoComplete="organization"
          className={FIELD}
          onChange={(event) => onChange((current) => ({ ...current, titleCompany: event.target.value, titleCompanyPending: event.target.value ? false : current.titleCompanyPending }))}
        />
        <div>
          <Chip on={answers.titleCompanyPending} onClick={() => onChange((current) => ({ ...current, titleCompanyPending: !current.titleCompanyPending, titleCompany: current.titleCompanyPending ? current.titleCompany : "" }))}>
            Not chosen yet
          </Chip>
        </div>
      </div>
      <label className="flex cursor-pointer gap-3 rounded-[14px] bg-muted/50 p-4">
        <Checkbox checked={answers.contactConsent} onCheckedChange={(value) => onChange((current) => ({ ...current, contactConsent: Boolean(value) }))} className="mt-1 size-5" />
        <span className="text-base leading-relaxed">{authorizationText(consent, company)}</span>
      </label>
    </>
  );
}

function UploadBox({ token, zip, uploads, onUploads, readOnly }: { token: string; zip: string; uploads: ApplicationUpload[]; onUploads: (next: ApplicationUpload[]) => void; readOnly: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    if (readOnly) {
      setMessage("Files are not saved from a preview.");
      return;
    }
    if (file.size > APPLICATION_UPLOAD_MAX_BYTES) {
      setMessage("Files are limited to 15 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("zip", zip);
      const response = await fetch(`/api/share/pay-at-close/${encodeURIComponent(token)}/upload`, { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; uploads?: unknown };
      if (!response.ok || !body.ok) {
        setMessage(body.error || "Could not add that photo.");
        return;
      }
      if (Array.isArray(body.uploads)) onUploads(body.uploads as ApplicationUpload[]);
    } catch {
      setMessage("Could not add that photo. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-start gap-3 rounded-[14px] border border-dashed bg-muted/40 p-4 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
      >
        <Camera className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <span>
          <span className="block text-base font-semibold">{busy ? "Adding…" : uploads.length ? "Add another photo or page" : "Add a photo of your mortgage statement"}</span>
          <span className="block text-sm text-muted-foreground">Optional, but it can speed up approval.</span>
        </span>
      </button>
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
      {uploads.length ? (
        <ul className="mt-3 space-y-1.5">
          {uploads.map((upload) => (
            <li key={upload.path} className="flex items-center gap-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{upload.name}</span>
              <Check className="ml-auto size-4 shrink-0 text-emerald-600" />
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p className="mt-2 text-sm text-primary">{message}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Review and done                                                      */
/* ------------------------------------------------------------------ */

function ReviewCard({ section, record, onEdit }: { section: HomeownerSection; record: JobPayAtClose; onEdit?: () => void }) {
  const prompts = section.prompts.filter((prompt) => homeownerPromptVisible(record, prompt));
  return (
    <section className="rounded-[14px] border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{section.title.replace(" on the home", "")}</h2>
        {onEdit ? (
          <button type="button" onClick={onEdit} className="text-base font-semibold text-primary underline underline-offset-4">
            Edit
          </button>
        ) : null}
      </div>
      <dl className="mt-3 space-y-2">
        {prompts.map((prompt) => {
          const value = prompt.value(record);
          const blank = value === null;
          return (
            <div key={prompt.id} className="flex items-baseline justify-between gap-4 text-base">
              <dt className="text-muted-foreground">{prompt.label}</dt>
              <dd className={cn("text-right", blank ? "text-amber-700 dark:text-amber-400" : "font-medium")}>{blank ? (prompt.id === "statement" ? "Not added" : "Left blank") : value}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function Done({ company, repFirst, repSms, amount, onView }: { company: string; repFirst: string; repSms: string; amount: number; onView: () => void }) {
  const steps = [
    { title: "We review", detail: "We confirm the details with public records." },
    { title: "You sign the agreement", detail: "Everyone on title signs online." },
    { title: "Paid at closing", detail: amount > 0 ? `${money(amount)} comes out of your sale proceeds. Nothing out of pocket.` : "The cost comes out of your sale proceeds. Nothing out of pocket." },
  ];
  return (
    <section className="flex min-h-[70dvh] flex-col">
      <span className="grid size-16 place-content-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <Check className="size-7" strokeWidth={2.5} />
      </span>
      <h1 className="mt-6 font-heading text-[2.1rem] leading-[1.15] font-medium tracking-tight">Thanks — we have your answers</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        {repFirst || company} will review them and reach out, usually within one business day.
      </p>
      <h2 className="mt-7 text-base font-semibold">What happens next</h2>
      <ol className="mt-3">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-4 pb-5 last:pb-0">
            {index < steps.length - 1 ? <span className="absolute top-8 bottom-0 left-[15px] w-px bg-border" aria-hidden /> : null}
            <span
              className={cn(
                "grid size-8 shrink-0 place-content-center rounded-full border text-sm font-semibold",
                index === 0 ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <span>
              <span className="block text-base font-semibold">{step.title}</span>
              <span className="block text-base leading-relaxed text-muted-foreground">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-auto space-y-3 pt-10">
        <Button type="button" variant="outline" size="lg" className="h-14 w-full rounded-[14px] bg-card text-base" onClick={onView}>
          View my answers
        </Button>
        {repSms ? (
          <a href={repSms} className="block py-2 text-center text-base font-semibold text-primary">
            Text {repFirst}
          </a>
        ) : null}
      </div>
    </section>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
