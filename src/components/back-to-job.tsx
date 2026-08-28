"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { jobPaperHref } from "@/lib/job-record";

export function BackToJobButton({ jobId }: { jobId: string | null | undefined }) {
  if (!jobId) return null;
  return (
    <Button
      nativeButton={false}
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 w-fit text-muted-foreground hover:text-foreground"
      render={<Link href={jobPaperHref(jobId)} />}
    >
      <ArrowLeft data-icon="inline-start" />
      Back to job
    </Button>
  );
}
