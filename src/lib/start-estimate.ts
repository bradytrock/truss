"use client";

import { useCallback, useRef, useState } from "react";
import { siteFieldsFromRecord } from "@/lib/contacts";
import { useCrm } from "@/lib/crm-store";
import { formatJobSite } from "@/lib/leads";
import { workMarket } from "@/lib/market";

export type StartEstimateInput = {
  jobId?: string | null;
  opportunityId?: string | null;
  contactId?: string | null;
  clientId?: string | null;
  templateId?: string | null;
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
    return;
  }
}

export function useStartEstimate() {
  const crm = useCrm();
  const [pending, setPending] = useState(false);
  const inflight = useRef(false);

  const start = useCallback(
    async (input: StartEstimateInput = {}) => {
      if (inflight.current) return;
      inflight.current = true;
      setPending(true);
      try {
        const job = asUuid(input.jobId) ? crm.jobs.find((item) => item.id === input.jobId) : undefined;
        const opportunity = asUuid(input.opportunityId)
          ? crm.opportunities.find((item) => item.id === input.opportunityId)
          : undefined;
        const template = asUuid(input.templateId)
          ? crm.estimateTemplates.find((item) => item.id === input.templateId)
          : undefined;
        const site = siteFieldsFromRecord(job ?? opportunity);
        const name =
          formatJobSite(site) || job?.name || opportunity?.name || template?.name || "Untitled proposal";
        const estimate = await crm.addEstimate({
          name,
          clientId: asUuid(input.clientId) ?? asUuid(job?.clientId) ?? asUuid(opportunity?.clientId),
          opportunityId: asUuid(input.opportunityId) ?? asUuid(job?.opportunityId),
          jobId: asUuid(input.jobId),
          contactId:
            asUuid(input.contactId) ?? asUuid(job?.primaryContactId) ?? asUuid(opportunity?.primaryContactId),
          street: site.street,
          city: site.city,
          state: site.state,
          postalCode: site.postalCode,
          market: template?.market ?? workMarket(job, opportunity),
          templateId: asUuid(input.templateId),
          notes: template?.notes ?? "",
        });
        openEstimatePage(estimate.id);
      } catch {
        // Store already toasted.
        inflight.current = false;
        setPending(false);
      }
      // Keep pending true on success — full navigation unloads this page.
    },
    [crm],
  );

  return { start, pending };
}
