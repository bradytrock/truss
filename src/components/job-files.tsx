"use client";

import { useRef, useState } from "react";
import {
  FileArchive,
  FileSpreadsheet,
  FileText,
  Film,
  ImageIcon,
  Link2,
  Link2Off,
  Paperclip,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatFileSize } from "@/lib/format";
import type { JobFile } from "@/lib/types";
import { cn } from "@/lib/utils";

export function JobFilesPanel({
  jobId,
  disabled,
}: {
  jobId: string;
  disabled?: boolean;
}) {
  const crm = useCrm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const files = (crm.jobFiles ?? []).filter((file) => file.jobId === jobId);

  async function attach(list: FileList | null) {
    if (!list?.length || disabled) return;
    setUploading(true);
    try {
      const saved = await crm.addJobFiles(jobId, Array.from(list));
      if (saved.length === 1) {
        toast.success(`Attached ${saved[0].name}.`);
      } else if (saved.length > 1) {
        toast.success(`Attached ${saved.length} files.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach files.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(file: JobFile) {
    if (disabled) return;
    if (!window.confirm(`Remove ${file.name} from this job?`)) return;
    const ok = await crm.deleteJobFile(file.id);
    if (ok) toast.success(`${file.name} removed.`);
  }

  async function copyShareLink(file: JobFile) {
    if (disabled) return;
    setSharingId(file.id);
    try {
      const url = await crm.shareJobFile(file.id);
      if (!url) return;
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied. Anyone with the link can open this file.");
    } catch {
      toast.error("Could not copy that share link.");
    } finally {
      setSharingId(null);
    }
  }

  async function revokeShare(file: JobFile) {
    if (disabled) return;
    if (!window.confirm(`Revoke the public link for ${file.name}?`)) return;
    setSharingId(file.id);
    try {
      const ok = await crm.revokeJobFileShare(file.id);
      if (ok) toast.success("Share link revoked.");
    } finally {
      setSharingId(null);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Uploaded files</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {files.length === 0
              ? "No files on this job."
              : `${files.length} file${files.length === 1 ? "" : "s"} · private unless you share a link`}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => void attach(event.target.files)}
        />
        <Button
          type="button"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip data-icon="inline-start" />
          {uploading ? "Uploading…" : "Attach"}
        </Button>
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Attach PDFs, insurance docs, contracts, or photos from the field. Files stay private to
          signed-in teammates; create a share link only when someone outside needs that one file.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((file) => {
            const shared = Boolean(file.shareToken?.trim());
            return (
              <li key={file.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <FileThumb file={file} />
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium">{file.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {[
                      formatFileSize(file.sizeBytes),
                      file.createdBy.trim() || null,
                      formatDate(file.createdAt),
                      shared ? "shared" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </a>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0"
                  disabled={disabled || sharingId === file.id}
                  onClick={() => void copyShareLink(file)}
                  aria-label={shared ? `Copy share link for ${file.name}` : `Share ${file.name}`}
                  title={shared ? "Copy share link" : "Create share link"}
                >
                  <Link2 className="size-3.5" />
                </Button>
                {shared ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0"
                    disabled={disabled || sharingId === file.id}
                    onClick={() => void revokeShare(file)}
                    aria-label={`Revoke share link for ${file.name}`}
                    title="Revoke share link"
                  >
                    <Link2Off className="size-3.5" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0"
                  disabled={disabled}
                  onClick={() => void remove(file)}
                  aria-label={`Remove ${file.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FileThumb({ file }: { file: JobFile }) {
  if (file.mimeType.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={file.url}
        alt=""
        className="size-10 shrink-0 rounded-sm object-cover"
      />
    );
  }
  const Icon = iconForFile(file);
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-sm border bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-4" />
    </div>
  );
}

function iconForFile(file: JobFile) {
  const mime = file.mimeType.toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/.test(name)) return Film;
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    /\.(xlsx|xls|csv)$/.test(name)
  ) {
    return FileSpreadsheet;
  }
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    /\.(zip|rar|7z)$/.test(name)
  ) {
    return FileArchive;
  }
  if (mime.startsWith("image/")) return ImageIcon;
  return FileText;
}
