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
import { fillEstimate, linesForEstimate } from "@/lib/estimate-totals";
import {
  homeownerHasSigned,
  signerRoleForToken,
  type HomeownerSigner,
} from "@/lib/estimate-signers";
import { billingEstimate, workMarket } from "@/lib/market";
import { normalizeShareToken, parseSharedEstimate } from "@/lib/share";
import { useRemoteShare } from "@/lib/use-remote-share";
import type { EstimateLine } from "@/lib/types";

function payloadError(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    return data.error;
  }
  return fallback;
}

export default function SharedEstimatePage() {
  const params = useParams<{ token: string }>();
  const token = normalizeShareToken(params.token);
  const crm = useCrm();
  const [signing, setSigning] = useState(false);
  const [signOpen, setSignOpen] = useState(false);

  const fromStore = useMemo(
    () =>
      crm.estimates.find(
        (estimate) =>
          estimate.shareToken === token ||
          (Boolean(estimate.secondShareToken) && estimate.secondShareToken === token),
      ),
    [crm.estimates, token],
  );
  const storeSigner: HomeownerSigner = fromStore
    ? signerRoleForToken(fromStore, token) ?? "primary"
    : "primary";
  const { remote, remoteState, sender, setRemote } = useRemoteShare({
    token,
    hasLocal: Boolean(fromStore),
    path: "/api/share/estimate/",
    parse: parseSharedEstimate,
  });

  useEffect(() => {
    if (fromStore?.status === "sent") void crm.markEstimateViewed(fromStore.id);
  }, [crm.markEstimateViewed, fromStore]);

  async function signFromStore(input: { name: string; image: string }) {
    if (!fromStore) return;
    setSigning(true);
    try {
      await crm.acceptEstimate(fromStore.id, input, storeSigner);
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
        toast.error(
          payloadError(
            data,
            "Could not sign this proposal. Ask the contractor to collect a signature in Truss.",
          ),
        );
        return;
      }
      setRemote(parsed);
      setSignOpen(false);
      toast.success("Thank you. This proposal is signed.");
    } finally {
      setSigning(false);
    }
  }

  async function toggleRemoteOptional(line: EstimateLine, selected: boolean) {
    const response = await fetch(`/api/share/estimate/${encodeURIComponent(token)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId: line.id, selected }),
    });
    const data: unknown = response.ok ? await response.json() : await response.json().catch(() => null);
    const parsed = parseSharedEstimate(data);
    if (!parsed) {
      toast.error(payloadError(data, "Could not update that optional item."));
      return;
    }
    setRemote(parsed);
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
    const viewerSigned = homeownerHasSigned(fromStore, storeSigner);
    const canSign = fromStore.status !== "declined" && !viewerSigned;
    const primaryName = crm.getContact(fromStore.contactId)?.name || customer;
    const secondName = fromStore.secondContactId
      ? crm.getContact(fromStore.secondContactId)?.name
      : null;
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
        {viewerSigned ? (
          <p className="rounded-md border bg-card px-4 py-3 text-sm">
            {fromStore.status === "accepted"
              ? `This proposal is signed. ${fromStore.signatureName || customer} accepted ${fromStore.number}.`
              : "Your signature is on this proposal. Waiting on the other homeowner."}
          </p>
        ) : null}
        <ProposalDocument
          company={crm.company}
          estimate={fromStore}
          lines={lines}
          customer={customer}
          selectable={optionalOpen}
          showStatus={false}
          primaryCustomer={primaryName}
          secondCustomer={secondName}
          onToggleOptional={(line, selected) => void crm.updateEstimateLine(line.id, { selected })}
        />
        <CollectSignatureDialog
          open={signOpen}
          onOpenChange={setSignOpen}
          defaultName={
            storeSigner === "second"
              ? secondName || ""
              : fromStore.signatureName || (primaryName === "—" ? "" : primaryName)
          }
          estimateNumber={fromStore.number}
          pending={signing}
          onSubmit={signFromStore}
        />
      </ShareFrame>
    );
  }

  if (remoteState !== "missing" && !remote) {
    return <ShareLoading />;
  }

  if (!remote || remoteState === "missing") {
    return <ShareMissing kind="estimate" sender={sender} />;
  }

  const estimate = fillEstimate(remote.estimate);
  const viewer = remote.viewerSigner ?? "primary";
  const viewerSigned = homeownerHasSigned(estimate, viewer);
  const optionalOpen =
    estimate.status === "draft" || estimate.status === "sent" || estimate.status === "viewed";
  const canSignRemote = estimate.status !== "declined" && !viewerSigned;
  const signerName =
    viewer === "second"
      ? remote.secondCustomer || estimate.secondSignatureName
      : remote.primaryCustomer || remote.estimate.signatureName || remote.customer;

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
      {viewerSigned ? (
        <p className="rounded-md border bg-card px-4 py-3 text-sm">
          {estimate.status === "accepted"
            ? "This proposal is signed. Thank you."
            : "Your signature is on this proposal. Waiting on the other homeowner."}
        </p>
      ) : null}
      <ProposalDocument
        company={remote.company}
        estimate={estimate}
        lines={remote.lines}
        customer={remote.customer}
        market={remote.market}
        showStatus={false}
        selectable={optionalOpen}
        projectManager={remote.projectManager}
        primaryCustomer={remote.primaryCustomer}
        secondCustomer={remote.secondCustomer}
        onToggleOptional={(line, selected) => void toggleRemoteOptional(line, selected)}
      />
      <CollectSignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        defaultName={signerName || remote.customer}
        estimateNumber={remote.estimate.number}
        pending={signing}
        onSubmit={signRemote}
      />
    </ShareFrame>
  );
}
