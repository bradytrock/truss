"use client";

import { useState } from "react";
import { Copy, ExternalLink, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PayAtCloseSendDialog } from "@/components/pay-at-close-send-dialog";
import { formatDate } from "@/lib/format";
import {
  APPLICATION_AUTHORIZATIONS,
  applicationLinkExpired,
  applicationProgress,
  applicationState,
  type ApplicationUpload,
  type JobPayAtClose,
} from "@/lib/pay-at-close";
import { APPLICATION_UPLOAD_BUCKET } from "@/lib/pay-at-close-application";
import { copyText, displayShareLink, shareUrl } from "@/lib/share";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import type { Job } from "@/lib/types";

/**
 * Office side of the homeowner's link: send it, watch the answers come in, and read what came
 * back. Lives on the job's Pay at close tab; the same dialog opens from the qualification form.
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
  const [sendOpen, setSendOpen] = useState(false);
  const state = applicationState(record.application);
  const url = record.application.token ? shareUrl("q", record.application.token) : "";
  const progress = applicationProgress(record);
  const expired = applicationLinkExpired(record.application);

  async function copyLink() {
    if (!url) return;
    const ok = await copyText(displayShareLink(url));
    if (ok) toast.success("Link copied.");
    else toast.error("Could not copy. Select the link and copy it by hand.");
  }

  const consent = APPLICATION_AUTHORIZATIONS[0];
  const consented = record.application.authorizations.includes(consent.id);

  return (
    <section className="space-y-3 rounded-[12px] border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Homeowner</h3>
          <p className="text-xs text-muted-foreground">
            {state === "submitted"
              ? `Answered ${progress.answered} of ${progress.total} on ${formatDate(record.application.submittedAt)}${record.application.uploads.length ? ` · ${record.application.uploads.length} file${record.application.uploads.length === 1 ? "" : "s"}` : ""}.`
              : state === "sent"
                ? expired
                  ? `Link sent ${formatDate(record.application.sentAt)} expired before they answered. Send it again; their saved answers are kept.`
                  : `Sent ${formatDate(record.application.sentAt)}${record.application.sentTo ? ` to ${record.application.sentTo}` : ""} · ${progress.answered} of ${progress.total} answered so far.`
                : "Four short pages on their phone: the sale, who is on title, what is owed, and closing contacts. Answers land on this file as they go."}
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
            <Button type="button" size="sm" variant={state === "not_sent" ? "default" : "outline"} className={state === "not_sent" ? undefined : "bg-card"} onClick={() => setSendOpen(true)}>
              <Send data-icon="inline-start" />
              {state === "not_sent" ? "Send to homeowner" : "Send again"}
            </Button>
          </div>
        )}
      </div>

      {state === "submitted" ? (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2">
            <span className={consented ? "text-emerald-600" : "text-rose-600"}>{consented ? "✓" : "✕"}</span>
            <span>{consented ? "OK to contact their agent and title company." : "Did not OK contacting their agent and title company."}</span>
          </p>
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
              Sent from {record.application.ip}
              {record.application.userAgent ? ` · ${record.application.userAgent.slice(0, 80)}${record.application.userAgent.length > 80 ? "…" : ""}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {state === "sent" && record.application.uploads.length ? (
        <div className="text-sm">
          <p className="text-xs text-muted-foreground">Files so far</p>
          <ul className="mt-1 space-y-1">
            {record.application.uploads.map((upload) => (
              <UploadRow key={upload.path} upload={upload} />
            ))}
          </ul>
        </div>
      ) : null}

      {url ? (
        <p className="truncate text-xs text-muted-foreground">
          <a href={url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
            {displayShareLink(url)}
          </a>
        </p>
      ) : null}

      <PayAtCloseSendDialog job={job} record={record} open={sendOpen} onOpenChange={setSendOpen} onSave={onSave} />
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
