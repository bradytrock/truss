"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProposalDocument } from "@/components/proposal-document";
import { CollectSignatureDialog } from "@/components/signature-pad";
import { ShareFrame, ShareLoading, ShareMissing, SharePdfButton } from "@/components/share-frame";
import { downloadEstimatePdf } from "@/lib/document-pdf";
import { useCrm } from "@/lib/crm-store";
import { documentProjectManager, letterheadCompanyForRecord } from "@/lib/document-owner";
import { hasEstimateSignature } from "@/lib/estimate-signature";
import { fillEstimate, linesForEstimate } from "@/lib/estimate-totals";
import { billingEstimate, workMarket } from "@/lib/market";
import { parseSharedEstimate, type SharedEstimatePayload } from "@/lib/share";

export default function SharedEstimatePage() {
  const { token } = useParams<{ token: string }>();
  const crm = useCrm();
  const [remote, setRemote] = useState<SharedEstimatePayload | null>(null);
  const [remoteState, setRemoteState] = useState<"idle" | "loading" | "missing">("idle");
  const [signing, setSigning] = useState(false);
  const [signOpen, setSignOpen] = useState(false);

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

  async function signFromStore(input: { name: string; image: string }) {
    if (!fromStore) return;
    setSigning(true);
    try {
      await crm.acceptEstimate(fromStore.id, input);
      setSignOpen(false);
      toast.success("Thank you. This proposal is signed.");
    } finally {
      setSigning(false);
    }
  }

  async function signRemote(input: { name: string; image: string }) {
    setSigning(true);
    try {
      const response = await fetch(`/api/share/estimate/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: input.name, signature: input.image }),
      });
      const data: unknown = response.ok ? await response.json() : await response.json().catch(() => null);
      const parsed = parseSharedEstimate(data);
      if (!parsed) {
        const message =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Could not sign this proposal. Ask the contractor to collect a signature in Truss.";
        toast.error(message);
        return;
      }
      setRemote(parsed);
      setSignOpen(false);
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
    const job = fromStore.jobId ? crm.jobs.find((item) => item.id === fromStore.jobId) : undefined;
    const opportunity = fromStore.opportunityId
      ? crm.opportunities.find((item) => item.id === fromStore.opportunityId)
      : undefined;
    const letterhead = letterheadCompanyForRecord({
      company: crm.company,
      job,
      opportunity,
      staff: crm.staff,
      fallbackStaffId: crm.user.staffId,
      inBook: true,
    });
    const projectManager = documentProjectManager({
      job,
      opportunity,
      staff: crm.staff,
      fallbackStaffId: crm.user.staffId,
      companyPhone: letterhead.phone,
    });
    const optionalOpen =
      fromStore.status === "draft" || fromStore.status === "sent" || fromStore.status === "viewed";
    const canSign =
      fromStore.status === "draft" ||
      fromStore.status === "sent" ||
      fromStore.status === "viewed" ||
      (fromStore.status === "accepted" && !hasEstimateSignature(fromStore));
    return (
      <ShareFrame
        actions={
          <>
            <SharePdfButton
              disabled={lines.length === 0}
              onClick={() =>
                void downloadEstimatePdf({
                  estimate: billingEstimate(fromStore, workMarket(job, opportunity)),
                  lines,
                  company: letterhead,
                  customer,
                  projectManager,
                }).catch(() => toast.error("Could not build the PDF."))
              }
            />
            {canSign ? (
              <Button disabled={signing} onClick={() => setSignOpen(true)}>
                Sign and approve
              </Button>
            ) : null}
          </>
        }
      >
        {fromStore.status === "accepted" ? (
          <p className="rounded-md border bg-card px-4 py-3 text-sm">
            {hasEstimateSignature(fromStore)
              ? `This proposal is signed. ${fromStore.signatureName || customer} accepted ${fromStore.number}.`
              : `This proposal is accepted. Collect a signature so it prints on the PDF.`}
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
        <CollectSignatureDialog
          open={signOpen}
          onOpenChange={setSignOpen}
          defaultName={fromStore.signatureName || (customer === "—" ? "" : customer)}
          estimateNumber={fromStore.number}
          pending={signing}
          onSubmit={signFromStore}
        />
      </ShareFrame>
    );
  }

  if (!remote || remoteState === "missing") {
    return <ShareMissing kind="estimate" />;
  }

  const estimate = fillEstimate(remote.estimate);
  const canSignRemote =
    estimate.status === "draft" ||
    estimate.status === "sent" ||
    estimate.status === "viewed" ||
    (estimate.status === "accepted" && !hasEstimateSignature(estimate));

  return (
    <ShareFrame
      actions={
        <>
          <SharePdfButton
            disabled={remote.lines.length === 0}
            onClick={() =>
              void downloadEstimatePdf({
                estimate: billingEstimate(estimate, remote.market),
                lines: remote.lines,
                company: remote.company,
                customer: remote.customer,
                projectManager: remote.projectManager,
              }).catch(() => toast.error("Could not build the PDF."))
            }
          />
          {canSignRemote ? (
            <Button disabled={signing} onClick={() => setSignOpen(true)}>
              Sign and approve
            </Button>
          ) : null}
        </>
      }
    >
      {estimate.status === "accepted" ? (
        <p className="rounded-md border bg-card px-4 py-3 text-sm">
          {hasEstimateSignature(estimate)
            ? "This proposal is signed. Thank you."
            : "This proposal is accepted. Sign below so your signature prints on the PDF."}
        </p>
      ) : null}
      <ProposalDocument
        company={remote.company}
        estimate={estimate}
        lines={remote.lines}
        customer={remote.customer}
        market={remote.market}
        showStatus={false}
        projectManager={remote.projectManager}
      />
      <CollectSignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        defaultName={remote.estimate.signatureName || remote.customer}
        estimateNumber={remote.estimate.number}
        pending={signing}
        onSubmit={signRemote}
      />
    </ShareFrame>
  );
}
