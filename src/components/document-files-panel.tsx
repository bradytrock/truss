"use client";

import { useRef, useState } from "react";
import {
  FileArchive,
  FileSpreadsheet,
  FileText,
  Film,
  FolderOpen,
  ImageIcon,
  Paperclip,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { CompanyFilePickerList } from "@/components/company-files";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatFileSize } from "@/lib/format";
import type { CompanyFile } from "@/lib/types";
import { cn } from "@/lib/utils";

export type DocumentAttachFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdBy: string;
  createdAt: string;
};

export function DocumentFilesPanel({
  files,
  disabled,
  emptyHint,
  directoryTitle,
  directoryDescription,
  onUpload,
  onPickDirectory,
  onRemove,
  onOpened,
}: {
  files: DocumentAttachFile[];
  disabled?: boolean;
  emptyHint: string;
  directoryTitle: string;
  directoryDescription: string;
  onUpload: (files: File[]) => Promise<DocumentAttachFile[]>;
  onPickDirectory: (file: CompanyFile) => Promise<DocumentAttachFile | null>;
  onRemove: (file: DocumentAttachFile) => Promise<boolean>;
  onOpened?: (file: DocumentAttachFile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [attachingFromDirectory, setAttachingFromDirectory] = useState(false);

  async function attach(list: FileList | null) {
    if (!list?.length || disabled) return;
    setUploading(true);
    try {
      const saved = await onUpload(Array.from(list));
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

  async function attachFromDirectory(file: CompanyFile) {
    if (disabled) return;
    setAttachingFromDirectory(true);
    try {
      const saved = await onPickDirectory(file);
      if (saved) {
        toast.success(`Copied “${saved.name}” from the file directory.`);
        setDirectoryOpen(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach from directory.");
    } finally {
      setAttachingFromDirectory(false);
    }
  }

  async function remove(file: DocumentAttachFile) {
    if (disabled) return;
    if (!window.confirm(`Remove ${file.name} from this document?`)) return;
    const ok = await onRemove(file);
    if (ok) toast.success(`${file.name} removed.`);
  }

  const busy = uploading || attachingFromDirectory;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {files.length === 0
              ? "No attachments yet."
              : `${files.length} file${files.length === 1 ? "" : "s"} · private to signed-in teammates`}
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || busy}
            onClick={() => setDirectoryOpen(true)}
          >
            <FolderOpen data-icon="inline-start" />
            From directory
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip data-icon="inline-start" />
            {uploading ? "Uploading…" : "Attach"}
          </Button>
        </div>
      </div>
      <Dialog open={directoryOpen} onOpenChange={setDirectoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{directoryTitle}</DialogTitle>
            <DialogDescription>{directoryDescription}</DialogDescription>
          </DialogHeader>
          <CompanyFilePickerList
            disabled={disabled || attachingFromDirectory}
            onPick={(file) => attachFromDirectory(file)}
          />
        </DialogContent>
      </Dialog>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
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
                onClick={() => onOpened?.(file)}
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

function FileThumb({ file }: { file: DocumentAttachFile }) {
  if (file.mimeType.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={file.url} alt="" className="size-10 shrink-0 rounded-sm object-cover" />
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

function iconForFile(file: DocumentAttachFile) {
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
  if (mime.includes("zip") || mime.includes("compressed") || /\.(zip|rar|7z)$/.test(name)) {
    return FileArchive;
  }
  if (mime.startsWith("image/")) return ImageIcon;
  return FileText;
}
