"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

export function useStartEstimate() {
  const crm = useCrm();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const inflight = useRef(false);

  const start = useCallback(
    async (input: StartEstimateInput = {}) => {
      if (inflight.current) return;
      inflight.current = true;
      setPending(true);
      try {
        const job = input.jobId ? crm.jobs.find((item) => item.id === input.jobId) : undefined;
        const opportunity = input.opportunityId
          ? crm.opportunities.find((item) => item.id === input.opportunityId)
          : undefined;
        const template = input.templateId
          ? crm.estimateTemplates.find((item) => item.id === input.templateId)
          : undefined;
        const site = siteFieldsFromRecord(job ?? opportunity);
        const name =
          formatJobSite(site) || job?.name || opportunity?.name || template?.name || "Untitled proposal";
        const estimate = await crm.addEstimate({
          name,
          clientId: input.clientId ?? job?.clientId ?? opportunity?.clientId ?? null,
          opportunityId: input.opportunityId ?? job?.opportunityId ?? null,
          jobId: input.jobId ?? null,
          contactId: input.contactId ?? job?.primaryContactId ?? opportunity?.primaryContactId ?? null,
          street: site.street,
          city: site.city,
          state: site.state,
          postalCode: site.postalCode,
          market: template?.market ?? workMarket(job, opportunity),
          templateId: input.templateId ?? null,
          notes: template?.notes ?? "",
        });
        router.push(`/estimates/${estimate.id}`);
      } catch {
        // Store already toasted.
      } finally {
        inflight.current = false;
        setPending(false);
      }
    },
    [crm, router],
  );

  return { start, pending };
}
