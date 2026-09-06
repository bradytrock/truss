"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { applyMarketingMerge, buildMarketingMerge } from "@/lib/marketing/merge";
import { useMarketing } from "@/lib/marketing/store";

export default function MarketingDripsPage() {
  const crm = useCrm();
  const marketing = useMarketing();
  const merge = buildMarketingMerge({
    company: crm.company,
    staff: crm.effectiveStaff,
    origin: typeof window !== "undefined" ? window.location.origin : "",
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-medium">Email & SMS drips</h2>
        <p className="text-sm text-muted-foreground">
          Reusable scripts for BD follow-ups, storm check-ins, reviews, and referrals.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {marketing.drips.map((drip) => {
          const body = applyMarketingMerge(drip.body, merge);
          const subject = applyMarketingMerge(drip.subject, merge);
          return (
            <div key={drip.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{drip.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {drip.channel} · {drip.audience}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const text = subject ? `${subject}\n\n${body}` : body;
                    void navigator.clipboard.writeText(text);
                    toast.success("Copied");
                  }}
                >
                  Copy
                </Button>
              </div>
              {subject ? <p className="text-sm font-medium">{subject}</p> : null}
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
