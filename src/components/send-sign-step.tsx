"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { parseEstimateSignature } from "@/lib/estimate-signature";
import { formatDate, initials } from "@/lib/format";
import { renderTypedSignaturePng } from "@/lib/typed-signature";
import { cn } from "@/lib/utils";

export function SendSignStep({
  signer,
  notice,
  consentText,
  pending,
  onCancel,
  onSubmit,
}: {
  signer: { name: string; title: string; company: string } | null;
  notice: string;
  consentText: string;
  pending?: boolean;
  onCancel: () => void;
  onSubmit: (image: string) => Promise<void> | void;
}) {
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [image, setImage] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [padKey, setPadKey] = useState(0);
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState("");
  const drawn = Boolean(image);
  const typedReady = typed.trim().length >= 2;
  const hasMark = mode === "draw" ? drawn : typedReady;

  function clearMark() {
    setImage(null);
    setTyped("");
    setPadKey((value) => value + 1);
    setError("");
  }

  async function handleSubmit() {
    if (!signer) return;
    if (!hasMark) {
      setError(mode === "type" ? "Type your name to sign." : "Draw your signature in the box.");
      return;
    }
    if (!consented) {
      setError("Check the box to approve sending this proposal.");
      return;
    }
    const png = mode === "type" ? await renderTypedSignaturePng(typed) : image;
    const parsed = parseEstimateSignature({ name: signer.name, image: png ?? "" });
    if (!parsed.ok) {
      setError(mode === "type" ? "Type your name to sign." : parsed.error);
      return;
    }
    setError("");
    await onSubmit(parsed.signature.image);
  }

  return (
    <div className="px-5 pt-4 pb-4">
      <div className="flex gap-2.5 rounded-[12px] bg-muted/70 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <p>{notice}</p>
      </div>

      {signer ? (
        <>
          <p className="mt-4 text-xs font-medium text-muted-foreground">Signing as</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {initials(signer.name) || "•"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{signer.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[signer.title, signer.company].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Signature</h2>
            <div className="flex items-center gap-3 text-xs font-medium" role="tablist" aria-label="Signature method">
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
                    "border-b-2 pb-0.5",
                    mode === key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground",
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

          <div className="relative mt-2">
            {mode === "draw" ? (
              <SignaturePad
                key={padKey}
                hideFooter
                sheetHint="Sign here with your mouse or finger"
                disabled={pending}
                onChange={setImage}
              />
            ) : (
              <input
                aria-label="Typed signature"
                value={typed}
                disabled={pending}
                placeholder="Type your name"
                className="font-script h-32 w-full rounded-[12px] border bg-white px-4 text-center text-4xl outline-none placeholder:font-sans placeholder:text-base placeholder:text-muted-foreground"
                onChange={(event) => setTyped(event.target.value)}
              />
            )}
          </div>

          {hasMark ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Signed {formatDate(new Date().toISOString())} · stamped on the PDF
              </p>
              <button
                type="button"
                className="text-sm font-medium text-primary"
                disabled={pending}
                onClick={clearMark}
              >
                Clear
              </button>
            </div>
          ) : null}

          <label className="mt-4 flex items-start gap-2.5 text-sm leading-snug">
            <Checkbox
              className="mt-0.5"
              checked={consented}
              disabled={pending}
              onCheckedChange={(value) => {
                setConsented(Boolean(value));
                setError("");
              }}
            />
            <span>{consentText}</span>
          </label>
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        </>
      ) : null}

      <div className="mt-5 flex items-center gap-2">
        <p className="mr-auto text-xs text-muted-foreground">{signer && !hasMark ? "Add your signature" : ""}</p>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        {signer ? (
          <Button
            type="button"
            className="bg-foreground text-background hover:bg-foreground/90"
            disabled={pending || !hasMark}
            onClick={() => void handleSubmit()}
          >
            {pending ? "Saving…" : "Sign & continue"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
