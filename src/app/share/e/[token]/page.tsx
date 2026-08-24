"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProposalDocument } from "@/components/proposal-document";
import { ShareFrame, ShareLoading, ShareMissing, SharePdfButton } from "@/components/share-frame";
import { downloadEstimatePdf } from "@/lib/document-pdf";
import { useCrm } from "@/lib/crm-store";
import { estimateFullySigned, nextEstimateSignature, resolveProjectOwner, type EstimateSigner } from "@/lib/estimate-signers";
import { linesForEstimate } from "@/lib/estimate-totals";
import { parseSharedEstimate, type SharedEstimatePayload } from "@/lib/share";
import type { Estimate } from "@/lib/types";

export default function SharedEstimatePage() {
  const { token } = useParams<{ token: string }>();
  const crm = useCrm();
  const [remote, setRemote] = useState<SharedEstimatePayload | null>(null);
  const [remoteState, setRemoteState] = useState<"idle" | "loading" | "missing">("idle");
  const [signing, setSigning] = useState<EstimateSigner | null>(null);

  const fromStore = useMemo(
    () => crm.estimates.find((estimate) => estimate.shareToken === token),
    [crm.estimates, token]
  );

  useEffect(() => {
    if (!crm.hydrated) return;
    if (fromStore) {
      if (fromStore.status === "sent") void crm.markEstimateViewed(fromStore.id);
      setRemote(null);
      setRemoteState("idle");
      return;
    }
    let cancelled = false;
    setRemoteState("loading");
    void fetch(`/api/share/estimate/${encodeURIComponent(token)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        const parsed = parseSharedEstimate(data);
        if (!parsed) {
          setRemote(null);
          setRemoteState("missing");
          return;
        }
        setRemote(parsed);
        setRemoteState("idle");
      })
      .catch(() => {
        if (!cancelled) {
          setRemote(null);
          setRemoteState("missing");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [crm.hydrated, crm.markEstimateViewed, fromStore, token]);

  async function signFromStore(signer: EstimateSigner) {
    if (!fromStore) return;
    setSigning(signer);
    try {
      const next = nextEstimateSignature(fromStore, signer, new Date().toISOString());
      await crm.acceptEstimate(fromStore.id, signer);
      toast.success(
        next.status === "accepted"
          ? "Thank you. This proposal is signed."
          : "Signed. Waiting on the other homeowner.",
      );
    } finally {
      setSigning(null);
    }
  }

  async function signRemote(signer: "primary" | "second") {
    setSigning(signer);
    try {
      const response = await fetch(`/api/share/estimate/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signer }),
      });
      const data: unknown = response.ok ? await response.json() : null;
      const parsed = parseSharedEstimate(data);
      if (!parsed) {
        toast.error("Could not sign this proposal. Ask the contractor to mark it signed in TheRoofingCRM.");
        return;
      }
      setRemote(parsed);
      toast.success(
        parsed.estimate.status === "accepted"
          ? "Thank you. This proposal is signed."
          : parsed.estimate.secondContactId
            ? "Signed. Waiting on the other homeowner."
            : "Thank you. This proposal is signed.",
      );
    } finally {
      setSigning(null);
    }
  }

  if (!crm.hydrated || (remoteState === "loading" && !fromStore && !remote)) {
    return <ShareLoading />;
  }

  if (fromStore) {
    const lines = linesForEstimate(crm.estimateLines, fromStore.id);
    const customer = crm.customerName(fromStore);
    const secondName = fromStore.secondContactId
      ? crm.getContact(fromStore.secondContactId)?.name ?? "Second homeowner"
      : null;
    const primaryName = fromStore.contactId
      ? crm.getContact(fromStore.contactId)?.name ?? customer
      : customer;
    const optionalOpen =
      fromStore.status === "draft" || fromStore.status === "sent" || fromStore.status === "viewed";
    const openForSignatures =
      fromStore.status === "draft" || fromStore.status === "sent" || fromStore.status === "viewed";
    const owner = resolveProjectOwner({
      estimate: fromStore,
      jobs: crm.jobs,
      opportunities: crm.opportunities,
      staff: crm.staff,
      user: crm.user,
      companyName: crm.company.name,
    });
    return (
      <ShareFrame
        actions={
          <>
            <SharePdfButton
              disabled={lines.length === 0}
              onClick={() =>
                void downloadEstimatePdf({
                  estimate: fromStore,
                  lines,
                  company: crm.company,
                  customer,
                  secondCustomer: secondName,
                }).catch(() => toast.error("Could not build the PDF."))
              }
            />
            {openForSignatures ? (
              <ShareSignActions
                estimate={fromStore}
                primaryName={primaryName}
                secondName={secondName}
                signing={signing}
                onSign={(signer) => void signFromStore(signer)}
              />
            ) : null}
          </>
        }
      >
        <SignatureBanner
          estimate={fromStore}
          customer={customer}
          primaryName={primaryName}
          secondName={secondName}
          companyName={crm.company.name}
        />
        <ProposalDocument
          company={crm.company}
          estimate={fromStore}
          lines={lines}
          customer={customer}
          secondCustomer={secondName}
          contractorName={owner.name}
          selectable={optionalOpen}
          showStatus={false}
          onToggleOptional={(line, selected) => void crm.updateEstimateLine(line.id, { selected })}
        />
      </ShareFrame>
    );
  }

  if (!remote || remoteState === "missing") {
    return <ShareMissing kind="estimate" />;
  }

  const canSignRemote =
    remote.estimate.status === "draft" ||
    remote.estimate.status === "sent" ||
    remote.estimate.status === "viewed";
  const remotePrimary = remote.primaryCustomer || remote.customer;
  const remoteSecond = remote.secondCustomer ?? null;

  return (
    <ShareFrame
      actions={
        <>
          <SharePdfButton
            disabled={remote.lines.length === 0}
            onClick={() =>
              void downloadEstimatePdf({
                estimate: remote.estimate as Estimate,
                lines: remote.lines,
                company: remote.company,
                customer: remote.customer,
                secondCustomer: remoteSecond,
              }).catch(() => toast.error("Could not build the PDF."))
            }
          />
          {canSignRemote ? (
            <ShareSignActions
              estimate={remote.estimate}
              primaryName={remotePrimary}
              secondName={remoteSecond}
              signing={signing}
              onSign={(signer) => void signRemote(signer === "second" ? "second" : "primary")}
            />
          ) : null}
        </>
      }
    >
      <SignatureBanner
        estimate={remote.estimate}
        customer={remote.customer}
        primaryName={remotePrimary}
        secondName={remoteSecond}
        companyName={remote.company.name}
      />
      <ProposalDocument
        company={remote.company}
        estimate={remote.estimate as Estimate}
        lines={remote.lines}
        customer={remote.customer}
        secondCustomer={remoteSecond}
        contractorName={remote.estimate.ownerSignedName || remote.company.name}
        showStatus={false}
      />
    </ShareFrame>
  );
}

function SignatureBanner({
  estimate,
  customer,
  primaryName,
  secondName,
  companyName,
}: {
  estimate: Pick<
    Estimate,
    "status" | "number" | "secondContactId" | "acceptedAt" | "secondAcceptedAt" | "ownerSignedAt" | "sentAt"
  >;
  customer: string;
  primaryName: string;
  secondName: string | null;
  companyName: string;
}) {
  if (estimate.status === "accepted" || estimateFullySigned(estimate)) {
    return (
      <p className="rounded-md border bg-card px-4 py-3 text-sm">
        This proposal is signed. {customer} accepted {estimate.number}.
      </p>
    );
  }
  if (estimate.secondContactId) {
    const waiting: string[] = [];
    if (!estimate.acceptedAt) waiting.push(primaryName);
    if (!estimate.secondAcceptedAt) waiting.push(secondName || "the other homeowner");
    if (waiting.length === 1) {
      return (
        <p className="rounded-md border bg-card px-4 py-3 text-sm">
          Waiting on {waiting[0]} to sign {estimate.number}.
        </p>
      );
    }
  }
  if (estimate.ownerSignedAt || estimate.sentAt) {
    return (
      <p className="rounded-md border bg-card px-4 py-3 text-sm">
        {companyName} signed this proposal when it was sent. Your signature accepts it and makes it
        binding.
      </p>
    );
  }
  return null;
}

function ShareSignActions({
  estimate,
  primaryName,
  secondName,
  signing,
  onSign,
}: {
  estimate: Pick<Estimate, "secondContactId" | "acceptedAt" | "secondAcceptedAt">;
  primaryName: string;
  secondName: string | null;
  signing: EstimateSigner | null;
  onSign: (signer: EstimateSigner) => void;
}) {
  if (!estimate.secondContactId) {
    return (
      <Button disabled={Boolean(signing) || Boolean(estimate.acceptedAt)} onClick={() => onSign("primary")}>
        {signing ? "Signing…" : "Accept proposal"}
      </Button>
    );
  }
  return (
    <>
      <Button
        disabled={Boolean(signing) || Boolean(estimate.acceptedAt)}
        onClick={() => onSign("primary")}
      >
        {estimate.acceptedAt ? `Signed by ${primaryName}` : signing === "primary" ? "Signing…" : `Sign as ${primaryName}`}
      </Button>
      <Button
        variant={estimate.acceptedAt ? "default" : "outline"}
        disabled={Boolean(signing) || Boolean(estimate.secondAcceptedAt)}
        onClick={() => onSign("second")}
      >
        {estimate.secondAcceptedAt
          ? `Signed by ${secondName}`
          : signing === "second"
            ? "Signing…"
            : `Sign as ${secondName}`}
      </Button>
    </>
  );
}
