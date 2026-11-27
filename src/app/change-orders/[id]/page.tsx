"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChangeOrderWriter } from "@/components/change-order-writer";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";

export default function ChangeOrderPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const order = crm.getChangeOrder(id);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!order) {
    return (
      <EmptyState
        title="Change order not found"
        description="It may belong to a job that is not in this seat’s book."
        action={
          <Button nativeButton={false} render={<Link href="/jobs" />}>
            Back to jobs
          </Button>
        }
      />
    );
  }

  return <ChangeOrderWriter order={order} />;
}
