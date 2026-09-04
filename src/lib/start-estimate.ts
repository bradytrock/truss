"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { siteFieldsFromRecord } from "@/lib/contacts";
import { useCrm } from "@/lib/crm-store";
import type { EagleviewOrder } from "@/lib/eagleview";
import { formatJobSite } from "@/lib/leads";
import { workMarket } from "@/lib/market";

export type StartEstimateInput = {
  jobId?: string | null;
  opportunityId?: string | null;
  contactId?: string | null;
  clientId?: string | null;
  templateId?: string | null;
};

export type StartEstimateChoices = {
  templateId: string | null;
  useMeasurements: boolean;
};

function asUuid(value: string | null | undefined) {
  const id = value?.trim() ?? "";
  return id && id !== "none" ? id : null;
}

/** Full document navigation — soft router.push often fails in Cursor's preview iframe. */
export function openEstimatePage(estimateId: string) {
  const path = `/estimates/${estimateId}`;
  if (typeof window !== "undefined") {
    window.location.assign(path);
  }
}

function readyMeasurementOrder(
  orders: EagleviewOrder[] | undefined,
  jobId: string | null,
): EagleviewOrder | null {
  if (!jobId) return null;
  return (
    [...(orders ?? [])]
      .filter(
        (order) =>
          order.jobId === jobId &&
          order.status === "ready" &&
          order.totalSquares != null &&
          Number.isFinite(order.totalSquares),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  );
}

async function applyMeasurementsToEstimate(orderId: string, estimateId: string) {
  const response = await fetch("/api/eagleview/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, estimateId, includeWaste: true }),
  });
  const data = (await response.json().catch(() => null)) as {
    error?: string;
    quantity?: number;
    updatedLineIds?: string[];
  } | null;
  if (!response.ok) {
    throw new Error(data?.error || "Could not apply EagleView measurements.");
  }
  return data;
}

export function useStartEstimate() {
  const crm = useCrm();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StartEstimateInput>({});
  const [pending, setPending] = useState(false);
  const inflight = useRef(false);

  const measurementOrder = useMemo(
    () => readyMeasurementOrder(crm.eagleviewOrders, asUuid(draft.jobId)),
    [crm.eagleviewOrders, draft.jobId],
  );

  const prompt = useCallback((input: StartEstimateInput = {}) => {
    if (inflight.current) return;
    setDraft(input);
    setOpen(true);
  }, []);

  const confirm = useCallback(
    async (choices: StartEstimateChoices) => {
      if (inflight.current) return;
      inflight.current = true;
      setPending(true);
      try {
        const job = asUuid(draft.jobId) ? crm.jobs.find((item) => item.id === draft.jobId) : undefined;
        const opportunity = asUuid(draft.opportunityId)
          ? crm.opportunities.find((item) => item.id === draft.opportunityId)
          : undefined;
        const templateId = asUuid(choices.templateId);
        const template = templateId
          ? crm.estimateTemplates.find((item) => item.id === templateId)
          : undefined;
        const site = siteFieldsFromRecord(job ?? opportunity);
        const name =
          formatJobSite(site) || job?.name || opportunity?.name || template?.name || "Untitled proposal";
        const estimate = await crm.addEstimate({
          name,
          clientId: asUuid(draft.clientId) ?? asUuid(job?.clientId) ?? asUuid(opportunity?.clientId),
          opportunityId: asUuid(draft.opportunityId) ?? asUuid(job?.opportunityId),
          jobId: asUuid(draft.jobId),
          contactId:
            asUuid(draft.contactId) ?? asUuid(job?.primaryContactId) ?? asUuid(opportunity?.primaryContactId),
          street: site.street,
          city: site.city,
          state: site.state,
          postalCode: site.postalCode,
          market: template?.market ?? workMarket(job, opportunity),
          templateId,
          notes: template?.notes ?? "",
        });

        const order = choices.useMeasurements
          ? readyMeasurementOrder(crm.eagleviewOrders, asUuid(draft.jobId) ?? estimate.jobId)
          : null;
        if (order) {
          try {
            const applied = await applyMeasurementsToEstimate(order.id, estimate.id);
            const lineCount = applied?.updatedLineIds?.length ?? 0;
            toast.success(
              lineCount > 1
                ? `Created ${estimate.number} and applied measurements to ${lineCount} lines.`
                : `Created ${estimate.number} and applied ${applied?.quantity ?? order.totalSquares} squares.`,
            );
          } catch (error) {
            toast.message(
              error instanceof Error
                ? `${estimate.number} created. ${error.message}`
                : `${estimate.number} created. Measurements were not applied.`,
            );
          }
        }

        setOpen(false);
        openEstimatePage(estimate.id);
      } catch {
        // Store already toasted.
        inflight.current = false;
        setPending(false);
      }
      // Keep pending true on success — full navigation unloads this page.
    },
    [crm, draft],
  );

  return {
    /** Opens the template / measurements dialog. */
    prompt,
    /** Alias for older call sites. */
    start: prompt,
    confirm,
    pending,
    open,
    setOpen,
    draft,
    measurementOrder,
  };
}
