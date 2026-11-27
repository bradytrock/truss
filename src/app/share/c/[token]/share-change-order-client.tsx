"use client";

import { useState } from "react";
import { CollectSignatureDialog } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import type { SharedChangeOrderPayload } from "@/lib/change-order-share";
import { formatCurrencyFull } from "@/lib/format";

function money(value: number) {
  const sign = value < 0 ? "−" : "+";
  return `${sign}${formatCurrencyFull(Math.abs(value))}`;
}

export function ShareChangeOrderClient({
  token,
  initial,
}: {
  token: string;
  initial: SharedChangeOrderPayload | null;
}) {
  const [payload, setPayload] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (!payload) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-heading text-3xl font-medium">This change order isn’t available</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The link may have expired. Ask the contractor who sent it for a new one.
        </p>
      </main>
    );
  }

  const signed = payload.alreadySigned || payload.status === "accepted";
  const declined = payload.status === "declined";

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{payload.companyName || "Change order"}</p>
      <h1 className="mt-1 font-heading text-4xl font-medium">{payload.number}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {payload.jobName}
        {payload.jobLocation ? ` · ${payload.jobLocation}` : ""}
      </p>
      {payload.estimateNumber ? (
        <p className="mt-1 text-sm text-muted-foreground">Amends {payload.estimateNumber}</p>
      ) : null}
      {payload.reason ? <p className="mt-4 text-sm">{payload.reason}</p> : null}

      <ul className="mt-6 divide-y rounded-xl border">
        {payload.lines.map((line, index) => (
          <li key={`${line.title}-${index}`} className="flex items-start justify-between gap-3 px-3 py-3 text-sm">
            <span>
              <span className="block font-medium">{line.title || "Change"}</span>
              <span className="text-muted-foreground">
                {line.quantity} {line.unit}
                {line.description ? ` · ${line.description}` : ""}
              </span>
            </span>
            <span className="tabular-nums">{formatCurrencyFull(line.quantity * line.unitCost)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-2 rounded-xl border px-4 py-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Contract before</dt>
          <dd className="tabular-nums">{formatCurrencyFull(payload.before)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">This change</dt>
          <dd className="tabular-nums">{money(payload.delta)}</dd>
        </div>
        <div className="flex justify-between gap-3 font-medium">
          <dt>Contract after</dt>
          <dd className="tabular-nums">{formatCurrencyFull(payload.after)}</dd>
        </div>
      </dl>

      {signed ? (
        <p className="mt-6 text-sm">Signed by {payload.signatureName || "the homeowner"}.</p>
      ) : declined ? (
        <p className="mt-6 text-sm">You declined this change. The contract stays where it was.</p>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => setOpen(true)}>
            Sign this change
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setPending(true);
              setError("");
              void fetch(`/api/share/change-order/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "decline" }),
              })
                .then(async (response) => {
                  const data = (await response.json()) as SharedChangeOrderPayload & { error?: string };
                  if (!response.ok) {
                    setError(data.error || "Could not decline the change order.");
                    return;
                  }
                  setPayload(data);
                })
                .catch(() => setError("Could not decline the change order."))
                .finally(() => setPending(false));
            }}
          >
            Decline
          </Button>
        </div>
      )}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <CollectSignatureDialog
        open={open}
        onOpenChange={setOpen}
        defaultName=""
        estimateNumber={payload.number}
        propertyAddress={payload.jobLocation}
        totalLabel={money(payload.delta)}
        pending={pending}
        onSubmit={async ({ name, image }) => {
          setPending(true);
          setError("");
          try {
            const response = await fetch(`/api/share/change-order/${token}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, image }),
            });
            const data = (await response.json()) as SharedChangeOrderPayload & { error?: string };
            if (!response.ok) {
              setError(data.error || "Could not save the signature.");
              return;
            }
            setPayload(data);
            setOpen(false);
          } catch {
            setError("Could not save the signature.");
          } finally {
            setPending(false);
          }
        }}
      />
    </main>
  );
}
