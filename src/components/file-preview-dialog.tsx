"use client";

import { Download, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatFileSize } from "@/lib/format";

export type PreviewableFile = {
  name: string;
  url: string;
  mimeType: string;
  sizeBytes?: number;
  createdBy?: string;
  createdAt?: string;
};

type PreviewKind = "image" | "pdf" | "video" | "audio" | "text" | "none";

function previewKind(file: PreviewableFile): PreviewKind {
  const mime = (file.mimeType || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(name)) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/.test(name)) return "video";
  if (mime.startsWith("audio/") || /\.(mp3|m4a|wav|ogg)$/.test(name)) return "audio";
  if (mime.startsWith("text/") || /\.(txt|csv|md|log)$/.test(name)) return "text";
  return "none";
}

/**
 * In-app viewer for an uploaded file. Images, PDFs, video, audio and plain text
 * render inline; everything else (Word, Excel, zip) offers download / open.
 */
export function FilePreviewDialog({
  file,
  onOpenChange,
}: {
  file: PreviewableFile | null;
  onOpenChange: (open: boolean) => void;
}) {
  const kind = file ? previewKind(file) : "none";
  const meta = file
    ? [
        file.sizeBytes != null ? formatFileSize(file.sizeBytes) : null,
        file.createdBy?.trim() || null,
        file.createdAt ? formatDate(file.createdAt) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <Dialog open={Boolean(file)} onOpenChange={onOpenChange} unsavedGuard={false}>
      <DialogContent className="flex max-h-[min(94dvh,60rem)] flex-col gap-3 overflow-hidden sm:max-w-4xl">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="truncate" title={file?.name}>
            {file?.name ?? "File"}
          </DialogTitle>
          <DialogDescription>{meta || "Preview"}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30">
          {file ? <PreviewBody file={file} kind={kind} /> : null}
        </div>
        {file ? (
          <DialogFooter className="shrink-0 sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {kind === "none"
                ? "This file type does not preview in the browser."
                : "Shown in the app. Open in a new tab for the full viewer."}
            </p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button
                nativeButton={false}
                size="sm"
                variant="outline"
                render={<a href={file.url} download={file.name} />}
              >
                <Download data-icon="inline-start" />
                Download
              </Button>
              <Button
                nativeButton={false}
                size="sm"
                variant="outline"
                render={<a href={file.url} target="_blank" rel="noreferrer" />}
              >
                <ExternalLink data-icon="inline-start" />
                Open in new tab
              </Button>
            </div>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({ file, kind }: { file: PreviewableFile; kind: PreviewKind }) {
  if (kind === "image") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.url}
          alt={file.name}
          className="max-h-[70dvh] max-w-full rounded-sm object-contain"
        />
      </div>
    );
  }
  if (kind === "pdf" || kind === "text") {
    return (
      <iframe
        title={file.name}
        src={kind === "pdf" ? `${file.url}#toolbar=1&view=FitH` : file.url}
        className="block h-[72dvh] w-full bg-background"
      />
    );
  }
  if (kind === "video") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-black p-2">
        <video src={file.url} controls className="max-h-[70dvh] max-w-full" />
      </div>
    );
  }
  if (kind === "audio") {
    return (
      <div className="flex min-h-40 items-center justify-center p-6">
        <audio src={file.url} controls className="w-full max-w-md" />
      </div>
    );
  }
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border bg-card text-muted-foreground">
        <FileText className="size-5" />
      </span>
      <div>
        <p className="text-sm font-medium">No in-app preview for this file</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Download it or open it in a new tab to view it with the right app.
        </p>
      </div>
    </div>
  );
}
