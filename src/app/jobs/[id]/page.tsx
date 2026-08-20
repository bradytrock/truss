"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { JobRecord } from "@/components/job-record";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const job = crm.getJob(id);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!job) {
    return (
      <EmptyState
        title="Job not in this book"
        description="This job belongs to another seat. Team leads can Login As the project manager; company admin sees every job."
        action={
          <Button nativeButton={false} render={<Link href="/jobs" />}>
            Back to jobs
          </Button>
        }
      />
    );
  }

  return <JobRecord job={job} />;
}
