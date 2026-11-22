"use client";

import { useState } from "react";
import { Copy, ExternalLink, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { useCrm } from "@/lib/crm-store";
import { cardHeaderLogo } from "@/lib/card";
import { shareEmailOwnerFromBook } from "@/lib/document-owner";
import { formatDate } from "@/lib/format";
import { formatJobSite } from "@/lib/leads";
import { resolveShareContacts } from "@/lib/parties";
import {
  APPLICATION_AUTHORIZATIONS,
  applicationProgress,
  applicationState,
  sendPayAtCloseApplication,
  type ApplicationUpload,
  type JobPayAtClose,
} from "@/lib/pay-at-close";
import { APPLICATION_UPLOAD_BUCKET } from "@/lib/pay-at-close-application";
import { copyText, newShareToken, shareUrl } from "@/lib/share";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import type { Job } from "@/lib/types";

/**
 * Office side of the homeowner application: send the link, watch for the signature,
 * and read what came back. Lives on the job's Pay at close tab.
 */
export function HomeownerApplicationSection({
  job,
  record,
  readOnly,
  onSave,
}: {
  job: Job;
  record: JobPayAtClose;
  readOnly: boolean;
  /** Persists the record and returns the saved copy (null when the save failed). */
  onSave: (next: JobPayAtClose) => Promise<JobPayAtClose | null>;
}) {
  const crm = useCrm();
  const [shareOpen, setShareOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const state = applicationState(record.application);
  const url = record.application.token ? shareUrl("q", record.application.token) : "";
  const progress = applicationProgress(record);
  const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
  const emailOwner = shareEmailOwnerFromBook({
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    senderStaff: crm.effectiveStaff ?? crm.viewer,
    companyPhone: crm.company.phone,
    companyEmail: crm.company.email,
    companySignature: crm.company.defaultEmailSignature,
  });
  const propertyAddress = formatJobSite({ street: job.street, city: job.city, state: job.state, postalCode: job.postalCode });

  async function openSend() {
    if (readOnly) return;
    if (record.application.token && record.application.sentAt) {
      setShareOpen(true);
      return;
    }
    setSending(true);
    try {
      const saved = await onSave(sendPayAtCloseApplication(record, newShareToken(), ""));
      if (saved) setShareOpen(true);
    } finally {
      setSending(false);
    }
  }

  async function markSent(to: string) {
    if (readOnly) return;
    const next = sendPayAtCloseApplication(record, record.application.token || newShareToken(), to);
    await onSave(next);
  }

  async function copyLink() {
    if (!url) return;
    const ok = await copyText(url);
    if (ok) toast.success("Application link copied.");
    else toast.error("Could not copy. Select the link and copy it by hand.");
  }

  return (
    <section className="space-y-3 rounded-[12px] border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Homeowner application</h3>
          <p className="text-xs text-muted-foreground">
            {state === "submitted"
              ? `Signed by ${record.application.signatureName || "the homeowner"} on ${formatDate(record.application.submittedAt)} · ${progress.answered} of ${progress.total} answered${record.application.uploads.length ? ` · ${record.application.uploads.length} file${record.application.uploads.length === 1 ? "" : "s"}` : ""}.`
              : state === "sent"
                ? `Sent ${formatDate(record.application.sentAt)}${record.application.sentTo ? ` to ${record.application.sentTo}` : ""} · waiting on the homeowner.`
                : "The homeowner answers the same questions in their own words, uploads a payoff statement, and signs the authorizations. Their answers land on this file."}
          </p>
        </div>
        {readOnly ? null : (
          <div className="flex flex-wrap gap-2">
            {url ? (
              <Button type="button" size="sm" variant="outline" className="bg-card" onClick={() => void copyLink()}>
                <Copy data-icon="inline-start" />
                Copy link
              </Button>
            ) : null}
            {state === "submitted" ? null : (
              <Button type="button" size="sm" variant={state === "sent" ? "outline" : "default"} className={state === "sent" ? "bg-card" : undefined} disabled={sending} onClick={() => void openSend()}>
                <Send data-icon="inline-start" />
                {sending ? "Preparing…" : state === "sent" ? "Send again" : "Send application"}
              </Button>
            )}
          </div>
        )}
      </div>

      {state === "submitted" ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Authorizations</p>
              <ul className="mt-1 space-y-1">
                {APPLICATION_AUTHORIZATIONS.map((authorization) => {
                  const on = record.application.authorizations.includes(authorization.id);
                  return (
                    <li key={authorization.id} className="flex items-center gap-2">
                      <span className={on ? "text-emerald-600" : "text-rose-600"}>{on ? "✓" : "✕"}</span>
                      <span>{authorization.title}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            {record.application.uploads.length ? (
              <div>
                <p className="text-xs text-muted-foreground">Files from the homeowner</p>
                <ul className="mt-1 space-y-1">
                  {record.application.uploads.map((upload) => (
                    <UploadRow key={upload.path} upload={upload} />
                  ))}
                </ul>
              </div>
            ) : null}
            {record.application.ip ? (
              <p className="text-[11px] text-muted-foreground">
                Signed from {record.application.ip}
                {record.application.userAgent ? ` · ${record.application.userAgent.slice(0, 80)}${record.application.userAgent.length > 80 ? "…" : ""}` : ""}
              </p>
            ) : null}
          </div>
          {record.application.signatureImage ? (
            <figure className="rounded-[10px] border bg-background p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={record.application.signatureImage} alt={`Signature of ${record.application.signatureName}`} className="h-20 w-full object-contain" />
              <figcaption className="mt-1 border-t pt-1 text-xs text-muted-foreground">
                {record.application.signatureName} · {formatDate(record.application.submittedAt)}
              </figcaption>
            </figure>
          ) : null}
        </div>
      ) : null}

      {url && state !== "submitted" ? (
        <p className="truncate text-xs text-muted-foreground">
          <a href={url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
            {url}
          </a>
        </p>
      ) : null}

      <ShareLinkDialog
        unsavedGuard={false}
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Send the Pay at Close application"
        description="Text or email the homeowner their link, or copy it. They answer on their phone and sign; no login. Anyone with the link can fill it out, so send it to the homeowner only."
        url={url}
        kind="page"
        documentName="the Pay at Close application"
        propertyAddress={propertyAddress}
        companyName={crm.company.name}
        companyLogoUrl={cardHeaderLogo(crm.company)}
        emailTemplates={crm.company.emailTemplates}
        sender={emailOwner}
        recipients={resolveShareContacts({ jobId: job.id, primaryContactId: job.primaryContactId }, crm)}
        onTexted={async (sent) => {
          await markSent(sent.to);
          await crm.logOutboundText({
            ...sent,
            jobId: job.id,
            opportunityId: job.opportunityId,
            contactId: sent.contactId || job.primaryContactId,
            kind: "pay_at_close_application",
          });
        }}
        onEmailed={async (sent) => {
          await markSent(sent.to);
          await crm.logOutboundEmail({
            ...sent,
            jobId: job.id,
            opportunityId: job.opportunityId,
            contactId: sent.contactId || job.primaryContactId,
          });
        }}
      />
    </section>
  );
}

function UploadRow({ upload }: { upload: ApplicationUpload }) {
  const [opening, setOpening] = useState(false);

  async function open() {
    if (!isSupabaseConfigured()) {
      toast.error("File storage is not connected.");
      return;
    }
    setOpening(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from(APPLICATION_UPLOAD_BUCKET).createSignedUrl(upload.path, 600);
      if (error || !data?.signedUrl) {
        toast.error("Could not open that file.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setOpening(false);
    }
  }

  return (
    <li className="flex items-center gap-2">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{upload.name}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{Math.max(1, Math.round(upload.size / 1024))} KB</span>
      <Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={opening} onClick={() => void open()}>
        <ExternalLink data-icon="inline-start" />
        Open
      </Button>
    </li>
  );
}
