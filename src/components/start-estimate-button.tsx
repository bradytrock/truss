"use client";

import { Button } from "@/components/ui/button";
import { useStartEstimate, type StartEstimateInput } from "@/lib/start-estimate";
import type { ComponentProps } from "react";

export function StartEstimateButton({
  jobId,
  opportunityId,
  contactId,
  clientId,
  templateId,
  children = "New estimate",
  pendingLabel = "Opening…",
  ...props
}: StartEstimateInput &
  Omit<ComponentProps<typeof Button>, "onClick"> & {
    pendingLabel?: string;
  }) {
  const { start, pending } = useStartEstimate();
  return (
    <Button
      {...props}
      disabled={props.disabled || pending}
      onClick={() => void start({ jobId, opportunityId, contactId, clientId, templateId })}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
