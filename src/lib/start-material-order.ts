"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCrm } from "@/lib/crm-store";

export function useStartMaterialOrder() {
  const crm = useCrm();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const inflight = useRef(false);

  const start = useCallback(
    async (jobId: string) => {
      if (inflight.current) return;
      if (!jobId) return;
      inflight.current = true;
      setPending(true);
      try {
        const order = await crm.addMaterialOrder({ jobId });
        router.push(`/material-orders/${order.id}`);
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
