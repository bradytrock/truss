"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { JobDocumentReview } from "@/components/job-document-review";
import { JobRecord } from "@/components/job-record";
import { RecordErrorBoundary } from "@/components/record-error-boundary";
import { escapeDismissesOverlay } from "@/lib/draft-escape";
import { parseJobDocParam } from "@/lib/qb-review";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

export function JobRecordWindow({ job, onClose }: { job: Job; onClose: () => void }) {
  const searchParams = useSearchParams();
  const fileOpen = Boolean(parseJobDocParam(searchParams.get("doc")));
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (escapeDismissesOverlay(event)) onClose();
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
        className="absolute inset-0 bg-[#2a2724]/25"
        aria-label="Close job"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-window-title"
        className={cn(
          "absolute flex flex-col overflow-hidden rounded-[22px] border border-[#e4e1dc] bg-[#f6f5f2] shadow-[0_24px_70px_rgba(40,32,24,0.18)] dark:border-border dark:bg-background",
          expanded
            ? "inset-2"
            : "inset-x-3 top-3 bottom-3 mx-auto w-full max-w-[76rem] sm:inset-x-5 sm:inset-y-4",
        )}
      >
        <RecordErrorBoundary
          fallbackTitle="This job would not open"
          fallbackDescription="The record hit a bad field. Close this window — the board stays up."
          onReset={onClose}
        >
          {fileOpen ? (
            <JobDocumentReview job={job} />
          ) : (
            <JobRecord
              key={job.id}
              job={job}
              onClose={onClose}
              expanded={expanded}
              onToggleExpand={() => setExpanded((value) => !value)}
              className="min-h-0 flex-1"
            />
          )}
        </RecordErrorBoundary>
      </div>
    </div>
  );
}
