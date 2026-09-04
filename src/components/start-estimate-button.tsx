"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { StartEstimateDialog } from "@/components/start-estimate-dialog";
import { useStartEstimate, type StartEstimateInput } from "@/lib/start-estimate";

/** Renders the New estimate dialog for a `useStartEstimate()` flow. */
export function StartEstimateDialogHost({
  flow,
}: {
  flow: ReturnType<typeof useStartEstimate>;
}) {
  return (
    <StartEstimateDialog
      open={flow.open}
      onOpenChange={(next) => {
        if (flow.pending) return;
        flow.setOpen(next);
      }}
      initialTemplateId={flow.draft.templateId}
      measurementOrder={flow.measurementOrder}
      pending={flow.pending}
      onConfirm={flow.confirm}
    />
  );
}

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
  const flow = useStartEstimate();
  return (
    <>
      <Button
        {...props}
        disabled={props.disabled || flow.pending}
        onClick={() => void flow.prompt({ jobId, opportunityId, contactId, clientId, templateId })}
      >
        {flow.pending ? pendingLabel : children}
      </Button>
      <StartEstimateDialogHost flow={flow} />
    </>
  );
}
