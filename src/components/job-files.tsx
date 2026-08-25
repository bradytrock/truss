"use client";

import { useRef, useState } from "react";
import {
  FileArchive,
  FileSpreadsheet,
  FileText,
  Film,
  ImageIcon,
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

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Uploaded files</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {files.length === 0
              ? "No files on this job."
              : `${files.length} file${files.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
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
          Attach PDFs, insurance docs, contracts, or photos from the field. On a phone, Attach
          opens the camera, the photo library, or Browse.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((file) => (
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
                disabled={disabled}
                onClick={() => void remove(file)}
                aria-label={`Remove ${file.name}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
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
