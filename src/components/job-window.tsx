"use client";

import { useEffect } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobRecord } from "@/components/job-record";
import type { Job } from "@/lib/types";

export function JobRecordWindow({ job, onClose }: { job: Job; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-x-0 top-12 bottom-0 z-40 md:left-52">
      <button
        type="button"
        className="absolute inset-0 bg-black/20 supports-backdrop-filter:backdrop-blur-xs"
        aria-label="Close job"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-window-title"
        className="absolute inset-x-3 top-3 bottom-3 mx-auto flex max-w-xl flex-col overflow-hidden rounded-md border bg-popover shadow-lg sm:inset-y-5"
      >
        <div className="flex shrink-0 items-center justify-end border-b px-2 py-1.5">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <XIcon />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <JobRecord key={job.id} job={job} className="max-w-none" />
        </div>
      </div>
    </div>
  );
}
