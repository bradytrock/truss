"use client";

import { useRef, useState } from "react";
import {
  BadgeCheck,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Film,
  FolderOpen,
  ImageIcon,
  Link2,
  Link2Off,
  Trash2,
  Upload,
} from "lucide-react";
import { CompletionCertificateDialog } from "@/components/completion-certificate-dialog";
import { toast } from "sonner";
import { CompanyFilePickerList } from "@/components/company-files";
import { FileDropZone } from "@/components/file-drop-zone";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatFileSize } from "@/lib/format";
import type { CompanyFile, JobFile } from "@/lib/types";
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
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [attachingFromDirectory, setAttachingFromDirectory] = useState(false);
  const files = (crm.jobFiles ?? []).filter((file) => file.jobId === jobId);
  const job = crm.getJob(jobId);

  async function attach(list: FileList | File[] | null) {
    const incoming = list ? Array.from(list) : [];
    if (!incoming.length || disabled) return;
    setUploading(true);
    try {
      const saved = await crm.addJobFiles(jobId, incoming);
      if (saved.length === 1) {
        toast.success(`Attached ${saved[0].name}.`);
      } else if (saved.length > 1) {
        toast.success(`Attached ${saved.length} files.`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not attach files.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function attachFromDirectory(file: CompanyFile) {
    if (disabled) return;
    setAttachingFromDirectory(true);
    try {
      const saved = await crm.attachCompanyFileToJob(jobId, file.id);
      if (saved) {
        toast.success(`Copied “${saved.name}” onto this job.`);
        setDirectoryOpen(false);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not attach from directory.",
      );
    } finally {
      setAttachingFromDirectory(false);
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
      toast.success(
        "Share link copied. Anyone with the link can open this file.",
      );
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
    <section className="rounded-[12px] border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Uploaded files {files.length}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Private to signed-in teammates. Share a link only when someone outside needs one file.
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || !job || uploading || attachingFromDirectory}
            title="Certificate of completion"
            onClick={() => setCertificateOpen(true)}
          >
            <BadgeCheck data-icon="inline-start" />
            Certificate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || uploading || attachingFromDirectory}
            onClick={() => setDirectoryOpen(true)}
          >
            <FolderOpen data-icon="inline-start" />
            From directory
          </Button>
        </div>
      </div>
      {job ? (
        <CompletionCertificateDialog job={job} open={certificateOpen} onOpenChange={setCertificateOpen} />
      ) : null}
      <Dialog open={directoryOpen} onOpenChange={setDirectoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Company file directory</DialogTitle>
            <DialogDescription>
              Copy a warranty, product sheet, or template onto this job. The
              original stays in Settings → File directory.
            </DialogDescription>
          </DialogHeader>
          <CompanyFilePickerList
            disabled={disabled || attachingFromDirectory}
            onPick={(file) => attachFromDirectory(file)}
          />
        </DialogContent>
      </Dialog>
      <FileDropZone
        disabled={disabled || uploading || attachingFromDirectory}
        onFiles={(dropped) => void attach(dropped)}
      >
        {(dragOver) => (
          <div
            className={cn(
              "space-y-2 rounded-[12px] border border-dashed bg-muted/20 px-3 py-3 transition-colors",
              dragOver ? "border-primary bg-muted/40" : "border-border",
            )}
          >
            <button
              type="button"
              className={cn("flex w-full flex-col items-center px-1 text-center", files.length === 0 ? "py-8" : "py-3")}
              aria-label="Drop files to attach them to this job"
              disabled={disabled || uploading || attachingFromDirectory}
              onClick={() => inputRef.current?.click()}
            >
              <span className="mb-2 flex size-8 items-center justify-center rounded-full border bg-card text-muted-foreground">
                <Upload className="size-4" />
              </span>
              <p className="text-sm font-medium">
                {uploading ? "Uploading…" : dragOver ? "Drop to attach" : "Drop files here or click to attach"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDFs, photos, spreadsheets and documents
              </p>
            </button>
            {files.length > 0 ? (
              <ul className="space-y-1.5">
                {files.map((file) => {
                  const shared = Boolean(file.shareToken?.trim());
                  return (
                    <li
                      key={file.id}
                      className="flex items-center gap-2 rounded-md border px-3 py-2"
                    >
                      <FileThumb file={file} />
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          void crm.logAudit({
                            entityType: "job_file",
                            entityId: file.id,
                            action: "opened",
                            after: { name: file.name, url: file.url },
                            label: file.name,
                            relatedJobId: file.jobId,
                          });
                        }}
                      >
                        <span className="block truncate text-sm font-medium">
                          {file.name}
                        </span>
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
                        aria-label={
                          shared
                            ? `Copy share link for ${file.name}`
                            : `Share ${file.name}`
                        }
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
            ) : null}
          </div>
        )}
      </FileDropZone>
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
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-sm border bg-muted text-muted-foreground",
      )}
    >
      <FileGlyph file={file} />
    </div>
  );
}

function FileGlyph({ file }: { file: JobFile }) {
  const mime = file.mimeType.toLowerCase();
  const name = file.name.toLowerCase();
  const className = "size-4";
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/.test(name)) {
    return <Film className={className} />;
  }
  if (mime.includes("spreadsheet") || mime.includes("excel") || /\.(xlsx|xls|csv)$/.test(name)) {
    return <FileSpreadsheet className={className} />;
  }
  if (mime.includes("zip") || mime.includes("compressed") || /\.(zip|rar|7z)$/.test(name)) {
    return <FileArchive className={className} />;
  }
  if (mime.startsWith("image/")) return <ImageIcon className={className} />;
  return <FileText className={className} />;
}
