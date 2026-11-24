"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseEstimateSignature } from "@/lib/estimate-signature";
import { ESIGN_CONSENT_DETAIL, ESIGN_CONSENT_HEADING } from "@/lib/estimate-signature-audit";
import { renderTypedSignaturePng } from "@/lib/typed-signature";
import { cn } from "@/lib/utils";

function realPersonName(value: string | null | undefined) {
  const name = value?.trim() ?? "";
  if (!name || name === "—" || /^homeowner$/i.test(name)) return "";
  return name;
}

/** Stored PNGs stay opaque so the proposal PDF does not stamp a transparent box. */
function exportSignaturePng(canvas: HTMLCanvasElement, flatten: boolean) {
  if (!flatten) return canvas.toDataURL("image/png");
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, copy.width, copy.height);
  ctx.drawImage(canvas, 0, 0);
  return copy.toDataURL("image/png");
}

function pointFromEvent(canvas: HTMLCanvasElement, event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function SignaturePad({
  className,
  disabled,
  emptyHint = "Draw the homeowner’s signature in the box.",
  hideFooter = false,
  sheetHint,
  transparent = false,
  onInkedChange,
  onChange,
}: {
  className?: string;
  disabled?: boolean;
  emptyHint?: string;
  /** The send sheet draws its own date line and Clear control. */
  hideFooter?: boolean;
  /** Centered hint drawn over an empty sheet pad. Hidden once ink is down. */
  sheetHint?: string;
  /** Leave the canvas clear so a signature line can show through. Export still flattens onto white. */
  transparent?: boolean;
  onInkedChange?: (inked: boolean) => void;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef(0);
  const inkedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onInkedChangeRef = useRef(onInkedChange);
  const [inked, setInked] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onInkedChangeRef.current = onInkedChange;
  }, [onInkedChange]);

  function setInk(next: boolean) {
    if (inkedRef.current === next) return;
    inkedRef.current = next;
    setInked(next);
    onInkedChangeRef.current?.(next);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function fit() {
      const node = canvasRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      if (strokes.current > 0) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      node.width = Math.max(1, Math.round(rect.width * dpr));
      node.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = node.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1c1c1c";
      ctx.lineWidth = 2.25;
      if (transparent) {
        ctx.clearRect(0, 0, rect.width, rect.height);
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, rect.width, rect.height);
      }
      onChangeRef.current(null);
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [transparent]);

  function context() {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  function emit() {
    const canvas = canvasRef.current;
    if (!canvas || strokes.current < 1) {
      onChangeRef.current(null);
      return;
    }
    onChangeRef.current(exportSignaturePng(canvas, transparent));
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = pointFromEvent(canvas, event.nativeEvent);
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = context();
    const from = last.current;
    if (!canvas || !ctx || !from) return;
    const to = pointFromEvent(canvas, event.nativeEvent);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    last.current = to;
    strokes.current += 1;
    if (!inkedRef.current) setInk(true);
  }

  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    canvasRef.current?.releasePointerCapture(event.pointerId);
    emit();
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (transparent) {
      ctx.clearRect(0, 0, rect.width, rect.height);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }
    strokes.current = 0;
    setInk(false);
    onChangeRef.current(null);
  }

  return (
    <div className={cn(!hideFooter && "space-y-2", transparent && "h-full", className)}>
      <div className={cn("relative", transparent && "h-full")}>
        <canvas
          ref={canvasRef}
          aria-label={sheetHint || "Signature"}
          className={cn(
            "w-full touch-none",
            transparent
              ? "absolute inset-0 h-auto bg-transparent"
              : hideFooter
                ? "h-32 rounded-[12px] border bg-white"
                : "h-36 rounded-md border bg-white",
          )}
          style={{ touchAction: "none" }}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
        />
        {hideFooter && sheetHint && !inked ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {sheetHint}
          </p>
        ) : null}
      </div>
      {hideFooter ? null : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {inked ? "Sign in the box the way you would on paper." : emptyHint}
          </p>
          <Button type="button" size="sm" variant="ghost" disabled={disabled || !inked} onClick={clear}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}

function StepMark({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[#d5d3ce] text-[13px] font-medium text-[#5f5f5f] dark:border-border dark:text-muted-foreground"
    >
      {n}
    </span>
  );
}

function CollectSignatureForm({
  open,
  defaultName,
  estimateNumber,
  homeownerName,
  propertyAddress,
  totalLabel,
  pending,
  onOpenChange,
  onReview,
  onSubmit,
}: {
  open: boolean;
  defaultName: string;
  estimateNumber: string;
  homeownerName: string;
  propertyAddress: string;
  totalLabel: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onReview?: () => void;
  onSubmit: (input: { name: string; image: string; consented: true }) => Promise<void> | void;
}) {
  const [name, setName] = useState(() => realPersonName(defaultName));
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [image, setImage] = useState<string | null>(null);
  const [inked, setInked] = useState(false);
  const [typed, setTyped] = useState("");
  const [padKey, setPadKey] = useState(0);
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState("");
  const summaryName = realPersonName(homeownerName) || realPersonName(defaultName);
  const address = propertyAddress.trim();
  const total = totalLabel.trim();
  const nameReady = name.trim().length >= 2;
  const signatureReady = mode === "draw" ? Boolean(image) : typed.trim().length >= 2;
  const stepsLeft = [nameReady, signatureReady, consented].filter((ready) => !ready).length;
  const ready = stepsLeft === 0;
  const markStarted = mode === "draw" ? inked || Boolean(image) : typed.trim().length > 0;

  function clearMark() {
    setImage(null);
    setTyped("");
    setInked(false);
    setPadKey((value) => value + 1);
    setError("");
  }

  async function handleSubmit() {
    if (!nameReady) {
      setError("Enter the homeowner’s full name.");
      return;
    }
    if (!signatureReady) {
      setError(mode === "type" ? "Type your name to sign." : "Draw your signature in the box.");
      return;
    }
    if (!consented) {
      setError("Check the box to agree to sign electronically.");
      return;
    }
    const png = mode === "type" ? await renderTypedSignaturePng(typed) : image;
    const parsed = parseEstimateSignature({ name, image: png ?? "" });
    if (!parsed.ok) {
      setError(mode === "type" ? "Type your name to sign." : parsed.error);
      return;
    }
    setError("");
    await onSubmit({ ...parsed.signature, consented: true });
  }

  const actionLabel = pending
    ? "Saving…"
    : ready
      ? "Approve & sign"
      : `${stepsLeft} step${stepsLeft === 1 ? "" : "s"} left`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={false}
        data-testid="approve-sign-dialog"
        className="max-h-[min(94dvh,900px)] gap-0 rounded-[22px] bg-[#f7f6f4] p-0 text-foreground shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)] ring-0 sm:max-w-[480px] dark:bg-popover"
      >
        <div className="px-5 pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium tracking-[0.16em] text-[#8a8a8a] uppercase">
              Estimate {estimateNumber}
            </p>
            <DialogClose className="rounded-md p-1 text-[#1c1c1c] outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring/40 dark:text-foreground">
              <X className="size-4" strokeWidth={1.75} />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
          <DialogTitle className="mt-1.5 font-sans text-[26px] leading-none font-semibold tracking-tight">
            Approve & sign
          </DialogTitle>
        </div>

        <div className="px-5 pt-4">
          <div className="rounded-xl bg-[#efece8] px-4 py-3.5 dark:bg-muted">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {summaryName ? (
                  <p className="text-[15px] leading-snug font-semibold">{summaryName}</p>
                ) : null}
                {address ? (
                  <p className={cn("text-[13px] leading-snug text-[#8a8a8a]", summaryName && "mt-0.5")}>{address}</p>
                ) : null}
              </div>
              {total ? (
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-[#8a8a8a]">Total</p>
                  <p className="mt-0.5 text-[22px] leading-none font-semibold tracking-tight tabular-nums">{total}</p>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
              onClick={() => {
                onReview?.();
                onOpenChange(false);
              }}
            >
              Review full proposal
              <ArrowUpRight className="size-3.5" />
            </button>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2.5">
              <StepMark n={1} />
              <label htmlFor="signer-name" className="text-[15px] font-semibold">
                Homeowner&rsquo;s full name
              </label>
            </div>
            <Input
              id="signer-name"
              value={name}
              disabled={pending}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
              placeholder="e.g. Jane Smith"
              autoComplete="name"
              className="mt-2.5 h-11 rounded-[10px] border-[#e3e1dc] bg-white px-3.5 text-[15px] shadow-none placeholder:text-[#b5b5b5] dark:bg-card"
            />
            <p className="mt-2 text-[13px] leading-snug text-[#8a8a8a]">
              The person approving the work — not the sales rep.
            </p>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <StepMark n={2} />
                <h2 className="text-[15px] font-semibold">Signature</h2>
              </div>
              <div className="flex rounded-[10px] bg-[#eceae6] p-0.5 dark:bg-muted" role="tablist" aria-label="Signature method">
                {(
                  [
                    ["draw", "Draw"],
                    ["type", "Type"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={mode === key}
                    className={cn(
                      "rounded-[8px] px-3 py-1 text-[13px] font-medium",
                      mode === key
                        ? "bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)] dark:bg-card"
                        : "text-[#8a8a8a]",
                    )}
                    onClick={() => {
                      setMode(key);
                      setError("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mt-2.5 h-44 overflow-hidden rounded-xl border border-dashed border-[#d0ccc6] bg-[#f4f2ef] dark:border-border dark:bg-muted/40">
              <SignaturePad
                key={padKey}
                transparent
                hideFooter
                disabled={pending || mode !== "draw"}
                className={cn("absolute inset-0", mode === "type" && "pointer-events-none invisible")}
                onChange={setImage}
                onInkedChange={setInked}
              />
              {mode === "type" ? (
                <input
                  aria-label="Typed signature"
                  value={typed}
                  disabled={pending}
                  placeholder="Type your name"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-script absolute inset-x-0 top-0 bottom-12 z-[1] bg-transparent px-6 text-center text-[2.75rem] text-[#1c1c1c] outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-[#9a9a9a]"
                  onChange={(event) => {
                    setTyped(event.target.value);
                    setError("");
                  }}
                />
              ) : null}
              {mode === "draw" && !markStarted ? (
                <p className="pointer-events-none absolute inset-x-6 top-0 bottom-12 z-[1] flex items-center justify-center text-center text-[15px] text-[#9a9a9a]">
                  Sign here with a finger or mouse
                </p>
              ) : null}
              {markStarted ? (
                <button
                  type="button"
                  className="absolute top-2 right-3 z-10 text-[13px] font-medium text-[#8a8a8a] hover:text-foreground"
                  disabled={pending}
                  onClick={clearMark}
                >
                  Clear
                </button>
              ) : null}
              <div className="pointer-events-none absolute inset-x-4 bottom-3 z-[1]">
                <div className="flex items-end gap-2 text-[#b0ada8]">
                  <span className="mb-px text-[15px] leading-none">×</span>
                  <span className="mb-1 h-px flex-1 bg-[#c8c4be]" />
                </div>
                <p className="mt-1.5 text-[12px] text-[#9a9a9a]">Homeowner signature</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2.5">
            <StepMark n={3} />
            <label className="flex min-w-0 flex-1 items-start gap-3 rounded-xl border border-[#e4e2de] bg-white px-3.5 py-3 dark:border-border dark:bg-card">
              <Checkbox
                className="mt-0.5 size-[18px] rounded-[4px]"
                checked={consented}
                disabled={pending}
                onCheckedChange={(value) => {
                  setConsented(Boolean(value));
                  setError("");
                }}
              />
              <span>
                <span className="block text-[15px] leading-snug font-semibold">{ESIGN_CONSENT_HEADING}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[#6f6f6f] dark:text-muted-foreground">
                  {ESIGN_CONSENT_DETAIL}
                </span>
              </span>
            </label>
          </div>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="mt-5 border-t border-[#e7e5e1] px-5 pt-4 pb-4 dark:border-border">
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              className="h-11 rounded-[10px] bg-white px-4 dark:bg-card"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <button
              type="button"
              disabled={pending || !ready}
              onClick={() => void handleSubmit()}
              className={cn(
                "h-11 flex-1 rounded-[10px] text-sm font-medium",
                ready
                  ? "bg-[#1c1c1c] text-white hover:bg-black disabled:opacity-80"
                  : "cursor-default bg-[#ebe8e4] text-[#9a9a9a] dark:bg-muted dark:text-muted-foreground",
              )}
            >
              {actionLabel}
            </button>
          </div>
          <DialogDescription className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-[#8a8a8a]">
            <Shield className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              For your records, the signed PDF includes the name, signature, time, IP address and a tamper-proof
              fingerprint of this proposal.
            </span>
          </DialogDescription>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssigneeSignatureDialog({
  open,
  onOpenChange,
  estimateNumber,
  signer,
  assignees,
  pending,
  consentText,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateNumber: string;
  /** The person using Truss, when they are assigned to the job. */
  signer: { name: string; title: string } | null;
  assignees: string[];
  pending?: boolean;
  consentText: string;
  onSubmit: (input: { image: string }) => Promise<void> | void;
}) {
  const [session, setSession] = useState(0);
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) setSession((value) => value + 1);
  }
  return (
    <AssigneeSignatureForm
      key={`${session}:${signer?.name ?? "blocked"}`}
      open={open}
      estimateNumber={estimateNumber}
      signer={signer}
      assignees={assignees}
      pending={pending}
      consentText={consentText}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />
  );
}

function AssigneeSignatureForm({
  open,
  estimateNumber,
  signer,
  assignees,
  pending,
  consentText,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  estimateNumber: string;
  signer: { name: string; title: string } | null;
  assignees: string[];
  pending?: boolean;
  consentText: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { image: string }) => Promise<void> | void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState("");
  const who = assignees.length ? assignees.join(", ") : "";

  async function handleSubmit() {
    if (!signer) return;
    if (!consented) {
      setError("Check the box to sign this estimate.");
      return;
    }
    const parsed = parseEstimateSignature({ name: signer.name, image: image ?? "" });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError("");
    await onSubmit({ image: parsed.signature.image });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{signer ? "Sign this estimate" : "Sign before sending"}</DialogTitle>
          <DialogDescription>
            {signer
              ? `${estimateNumber} stays a draft until you sign. Your signature is yours. This is not a contract.`
              : who
                ? `Someone assigned to this job has to sign ${estimateNumber} before it can be sent.`
                : `Assign someone to this job before sending ${estimateNumber}.`}
          </DialogDescription>
        </DialogHeader>
        {signer ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="assignee-signer-name">Printed name</Label>
              <Input id="assignee-signer-name" value={signer.name} disabled />
              {signer.title ? <p className="text-xs text-muted-foreground">{signer.title}</p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label>Signature</Label>
              <SignaturePad disabled={pending} emptyHint="Draw your signature in the box." onChange={setImage} />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={consented}
                disabled={pending}
                onCheckedChange={(value) => setConsented(Boolean(value))}
              />
              <span>{consentText}</span>
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        ) : who ? (
          <p className="text-sm text-muted-foreground">Assigned: {who}</p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {signer ? "Cancel" : "Close"}
          </Button>
          {signer ? (
            <Button type="button" disabled={pending} onClick={() => void handleSubmit()}>
              {pending ? "Saving…" : "Sign and send"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CollectSignatureDialog({
  open,
  onOpenChange,
  defaultName,
  estimateNumber,
  homeownerName,
  propertyAddress = "",
  totalLabel = "",
  pending,
  onReview,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  estimateNumber: string;
  /** Name printed on the proposal summary. The signature field stays editable. */
  homeownerName?: string;
  propertyAddress?: string;
  /** Already formatted, matching the total on the proposal. */
  totalLabel?: string;
  pending?: boolean;
  onReview?: () => void;
  onSubmit: (input: { name: string; image: string; consented: true }) => Promise<void> | void;
}) {
  const [session, setSession] = useState(0);
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) setSession((value) => value + 1);
  }

  return (
    <CollectSignatureForm
      key={`${session}:${defaultName}`}
      open={open}
      defaultName={defaultName}
      estimateNumber={estimateNumber}
      homeownerName={homeownerName ?? defaultName}
      propertyAddress={propertyAddress}
      totalLabel={totalLabel}
      pending={pending}
      onOpenChange={onOpenChange}
      onReview={onReview}
      onSubmit={onSubmit}
    />
  );
}
