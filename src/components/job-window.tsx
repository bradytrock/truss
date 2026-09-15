"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { JobDocumentReview } from "@/components/job-document-review";
import { JobRecord } from "@/components/job-record";
import { parseJobDocParam } from "@/lib/qb-review";
import type { Job } from "@/lib/types";

export function JobRecordWindow({ job, onClose }: { job: Job; onClose: () => void }) {
  const searchParams = useSearchParams();
  const fileOpen = Boolean(parseJobDocParam(searchParams.get("doc")));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
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
        className="absolute inset-x-3 top-3 bottom-3 mx-auto flex w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-background shadow-lg sm:inset-y-5"
      >
        {fileOpen ? (
          <JobDocumentReview job={job} />
        ) : (
          <JobRecord key={job.id} job={job} onClose={onClose} className="min-h-0 flex-1" />
        )}
      </div>
    </div>
  );
}
