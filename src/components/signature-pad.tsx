"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import { ESIGN_CONSENT_TEXT } from "@/lib/estimate-signature-audit";
import {
  DESKTOP_TYPE_SIGNATURE_QUERY,
  TYPED_SIGNATURE_MAX_CHARS,
  normalizeTypedSignature,
  renderTypedSignaturePng,
} from "@/lib/typed-signature";
import { cn } from "@/lib/utils";

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
  onChange,
}: {
  className?: string;
  disabled?: boolean;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef(0);
  const onChangeRef = useRef(onChange);
  const [inked, setInked] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      onChangeRef.current(null);
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  function context() {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  function emit() {
    const canvas = canvasRef.current;
    if (!canvas || strokes.current < 1) {
      onChangeRef.current(null);
      return;
    }
    onChangeRef.current(canvas.toDataURL("image/png"));
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
    if (!inked) setInked(true);
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    strokes.current = 0;
    setInked(false);
    onChangeRef.current(null);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <canvas
        ref={canvasRef}
        className="h-36 w-full touch-none rounded-md border bg-white"
        style={{ touchAction: "none" }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {inked ? "Sign in the box the way you would on paper." : "Draw the homeowner’s signature in the box."}
        </p>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || !inked} onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

function useDesktopCanTypeSignature() {
  const [canType, setCanType] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_TYPE_SIGNATURE_QUERY);
    const apply = () => setCanType(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return canType;
}

function useTypedSignatureImage(text: string, enabled: boolean) {
  const [shot, setShot] = useState<{ text: string; image: string | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void renderTypedSignaturePng(text).then((url) => {
        if (!cancelled) setShot({ text, image: url });
      });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [enabled, text]);
  if (!enabled || shot?.text !== text) return null;
  return shot.image;
}

function SignatureMethodSwitch({
  mode,
  disabled,
  onChange,
}: {
  mode: "draw" | "type";
  disabled?: boolean;
  onChange: (mode: "draw" | "type") => void;
}) {
  return (
    <div role="tablist" aria-label="How to sign" className="grid w-40 grid-cols-2 rounded-md bg-muted p-[3px]">
      {(["draw", "type"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          disabled={disabled}
          className={cn(
            "rounded-md px-2 py-1 text-sm font-medium capitalize",
            mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(value)}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function TypedSignatureField({
  value,
  image,
  disabled,
  onChange,
}: {
  value: string;
  image: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const preview = normalizeTypedSignature(value);
  return (
    <div className="space-y-2">
      <div className="flex h-36 w-full items-center overflow-hidden rounded-md border bg-white px-4">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-contain object-left" />
        ) : (
          <span
            className={cn(
              "truncate font-script text-5xl leading-none",
              preview ? "text-[#1c1c1c]" : "text-[#1c1c1c]/35",
            )}
          >
            {preview || "Your signature"}
          </span>
        )}
      </div>
      <Input
        value={value}
        disabled={disabled}
        maxLength={TYPED_SIGNATURE_MAX_CHARS}
        autoComplete="off"
        autoFocus
        aria-label="Typed signature"
        placeholder="Type your signature"
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Type the signature the way it should appear. It is saved on the proposal the same as a drawing.
        </p>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || !preview} onClick={() => onChange("")}>
          Clear
        </Button>
      </div>
    </div>
  );
}

function CollectSignatureForm({
  open,
  defaultName,
  estimateNumber,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  defaultName: string;
  estimateNumber: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { name: string; image: string; consented: true }) => Promise<void> | void;
}) {
  const [name, setName] = useState(defaultName);
  const [image, setImage] = useState<string | null>(null);
  const [requestedMode, setRequestedMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState(defaultName);
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState("");
  const typedTouched = useRef(false);
  const canType = useDesktopCanTypeSignature();
  const typing = canType && requestedMode === "type";
  const typedImage = useTypedSignatureImage(typed, typing);

  async function handleSubmit() {
    if (!consented) {
      setError("Check the box to agree to sign electronically.");
      return;
    }
    const signatureImage = typing ? typedImage : image;
    if (typing && normalizeTypedSignature(typed).length < 2) {
      setError("Type at least two characters for the signature.");
      return;
    }
    if (typing && !signatureImage) {
      setError("The typed signature is not ready yet. Wait a moment and try again.");
      return;
    }
    const parsed = parseEstimateSignature({ name, image: signatureImage ?? "" });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError("");
    await onSubmit({ ...parsed.signature, consented: true });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collect signature</DialogTitle>
          <DialogDescription>
            Signing {estimateNumber} approves the work. Your signature, name, time, IP address, and a
            hash of this proposal are stored as the court record and print on the PDF.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="signer-name">Printed name</Label>
            <Input
              id="signer-name"
              value={name}
              disabled={pending}
              onChange={(event) => {
                const next = event.target.value;
                setName(next);
                if (!typedTouched.current) setTyped(next.slice(0, TYPED_SIGNATURE_MAX_CHARS));
              }}
              placeholder="Homeowner name"
              autoComplete="name"
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label>Signature</Label>
              {canType ? (
                <SignatureMethodSwitch
                  mode={requestedMode === "type" ? "type" : "draw"}
                  disabled={pending}
                  onChange={setRequestedMode}
                />
              ) : null}
            </div>
            {typing ? (
              <TypedSignatureField
                value={typed}
                image={typedImage}
                disabled={pending}
                onChange={(next) => {
                  typedTouched.current = true;
                  setTyped(next);
                }}
              />
            ) : (
              <SignaturePad disabled={pending} onChange={setImage} />
            )}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={consented}
              disabled={pending}
              onCheckedChange={(value) => setConsented(Boolean(value))}
            />
            <span>{ESIGN_CONSENT_TEXT}</span>
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={() => void handleSubmit()}>
            {pending ? "Saving…" : "Sign and approve"}
          </Button>
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
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  estimateNumber: string;
  pending?: boolean;
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
      pending={pending}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />
  );
}
