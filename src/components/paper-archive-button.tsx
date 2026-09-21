"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { archiveStamp, isArchivedPaper } from "@/lib/paper-archive";

export function PaperArchiveButton({
  archivedAt,
  label,
  pending,
  compact,
  onChange,
}: {
  archivedAt?: string | null;
  label: string;
  pending?: boolean;
  compact?: boolean;
  onChange: (archivedAt: string | null) => void | Promise<unknown>;
}) {
  const archived = isArchivedPaper({ archivedAt });

  async function toggle() {
    if (archived) {
      await onChange(null);
      toast.success(`${label} is back on the job.`);
      return;
    }
    if (
      !window.confirm(
        `Archive ${label}? It leaves this job’s Paper list. You can restore it later.`,
      )
    ) {
      return;
    }
    await onChange(archiveStamp());
    toast.success(`${label} is archived.`);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "sm" : "default"}
      disabled={pending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggle();
      }}
    >
      {archived ? <ArchiveRestore data-icon="inline-start" /> : <Archive data-icon="inline-start" />}
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}

export function PaperArchivedBanner({ label }: { label: string }) {
  return (
    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
      {label} is archived and hidden from the job’s Paper list.
    </p>
  );
}
