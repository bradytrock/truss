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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseEstimateSignature } from "@/lib/estimate-signature";
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
  onChangeRef.current = onChange;
  const [inked, setInked] = useState(false);

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
  onSubmit: (input: { name: string; image: string }) => Promise<void> | void;
}) {
  const [name, setName] = useState(defaultName);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [padKey, setPadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setImage(null);
    setError("");
    setPadKey((value) => value + 1);
  }, [defaultName, open]);

  async function handleSubmit() {
    const parsed = parseEstimateSignature({ name, image: image ?? "" });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError("");
    await onSubmit(parsed.signature);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collect signature</DialogTitle>
          <DialogDescription>
            Signing {estimateNumber} approves the work. The drawing is stored on the estimate and prints on the PDF.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="signer-name">Printed name</Label>
            <Input
              id="signer-name"
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              placeholder="Homeowner name"
              autoComplete="name"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Signature</Label>
            <SignaturePad key={padKey} disabled={pending} onChange={setImage} />
          </div>
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
