"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyText } from "@/lib/share";

export function ShareLinkDialog({
  open,
  onOpenChange,
  title,
  description,
  url,
  onDownloadPdf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  url: string;
  onDownloadPdf?: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState(false);

  async function handleCopy() {
    const ok = await copyText(url);
    if (ok) toast.success("Link copied.");
    else toast.error("Could not copy the link. Select it and copy it yourself.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="share-link">Client link</Label>
          <div className="flex gap-2">
            <Input id="share-link" readOnly value={url} onFocus={(event) => event.target.select()} />
            <Button type="button" variant="outline" disabled={!url} onClick={() => void handleCopy()}>
              <Copy />
              Copy
            </Button>
          </div>
        </div>
        <DialogFooter>
          {onDownloadPdf ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setPending(true);
                void Promise.resolve(onDownloadPdf())
                  .catch(() => toast.error("Could not build the PDF."))
                  .finally(() => setPending(false));
              }}
            >
              <Download />
              Download PDF
            </Button>
          ) : null}
          <Button type="button" disabled={!url} onClick={() => void handleCopy()}>
            Copy link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
