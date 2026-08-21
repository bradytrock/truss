"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import type { Job } from "@/lib/types";

export function DeleteJobDialog({
  job,
  open,
  onOpenChange,
}: {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crm = useCrm();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!job) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Write why this job is being deleted.");
      return;
    }
    setSaving(true);
    try {
      const ok = await crm.deleteJob(job.id, trimmed);
      if (!ok) return;
      setReason("");
      onOpenChange(false);
      toast.success(`${job.code || job.name} moved to Deleted. Restore it from that column if this was a mistake.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {job?.code || "this job"}?</DialogTitle>
          <DialogDescription>
            It leaves the live board and sits in Deleted so a company admin can restore it. The reason stays on the job
            record and in the activity history.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="delete-job-reason">Reason</Label>
          <Textarea
            id="delete-job-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Duplicate card, opened by mistake, wrong homeowner…"
            rows={3}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" onClick={() => void confirm()} disabled={saving}>
            {saving ? "Deleting…" : "Delete job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
