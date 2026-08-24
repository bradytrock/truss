"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProposalDocument } from "@/components/proposal-document";
import { ShareFrame, ShareLoading, ShareMissing, SharePdfButton } from "@/components/share-frame";
import { downloadEstimatePdf } from "@/lib/document-pdf";
import { useCrm } from "@/lib/crm-store";
import { linesForEstimate } from "@/lib/estimate-totals";
import { parseSharedEstimate, type SharedEstimatePayload } from "@/lib/share";

export default function SharedEstimatePage() {
  const { token } = useParams<{ token: string }>();
  const crm = useCrm();
  const [remote, setRemote] = useState<SharedEstimatePayload | null>(null);
  const [remoteState, setRemoteState] = useState<"idle" | "loading" | "missing">("idle");
  const [signing, setSigning] = useState(false);

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

  async function signFromStore() {
    if (!fromStore) return;
    setSigning(true);
    try {
      await crm.acceptEstimate(fromStore.id);
      toast.success("Thank you. This proposal is signed.");
    } finally {
      setSigning(false);
    }
  }

  async function signRemote() {
    setSigning(true);
    try {
      const response = await fetch(`/api/share/estimate/${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const data: unknown = response.ok ? await response.json() : null;
      const parsed = parseSharedEstimate(data);
      if (!parsed) {
        toast.error("Could not sign this proposal. Ask the contractor to mark it signed in TheRoofingCRM.");
        return;
      }
      setRemote(parsed);
      toast.success("Thank you. This proposal is signed.");
    } finally {
      setSigning(false);
    }
  }

  if (!crm.hydrated || (remoteState === "loading" && !fromStore && !remote)) {
    return <ShareLoading />;
  }

  if (fromStore) {
    const lines = linesForEstimate(crm.estimateLines, fromStore.id);
    const customer = crm.customerName(fromStore);
    const optionalOpen =
      fromStore.status === "draft" || fromStore.status === "sent" || fromStore.status === "viewed";
    const canSign =
      fromStore.status === "draft" || fromStore.status === "sent" || fromStore.status === "viewed";
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
                }).catch(() => toast.error("Could not build the PDF."))
              }
            />
            {canSign ? (
              <Button disabled={signing} onClick={() => void signFromStore()}>
                {signing ? "Signing…" : "Accept proposal"}
              </Button>
            ) : null}
          </>
        }
      >
        {fromStore.status === "accepted" ? (
          <p className="rounded-md border bg-card px-4 py-3 text-sm">
            This proposal is signed. {customer} accepted {fromStore.number}.
          </p>
        ) : null}
        <ProposalDocument
          company={crm.company}
          estimate={fromStore}
          lines={lines}
          customer={customer}
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

  return (
    <ShareFrame
      actions={
        <>
          <SharePdfButton
            disabled={remote.lines.length === 0}
            onClick={() =>
              void downloadEstimatePdf({
                estimate: remote.estimate,
                lines: remote.lines,
                company: remote.company,
                customer: remote.customer,
              }).catch(() => toast.error("Could not build the PDF."))
            }
          />
          {canSignRemote ? (
            <Button disabled={signing} onClick={() => void signRemote()}>
              {signing ? "Signing…" : "Accept proposal"}
            </Button>
          ) : null}
        </>
      }
    >
      {remote.estimate.status === "accepted" ? (
        <p className="rounded-md border bg-card px-4 py-3 text-sm">
          This proposal is signed. Thank you.
        </p>
      ) : null}
      <ProposalDocument
        company={remote.company}
        estimate={remote.estimate}
        lines={remote.lines}
        customer={remote.customer}
        showStatus={false}
      />
    </ShareFrame>
  );
}
