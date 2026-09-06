"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { applyMarketingMerge, buildMarketingMerge } from "@/lib/marketing/merge";

const REVIEW_SMS =
  "Hi {{contactName}}, {{staffName}} with {{companyName}}. If we earned it, a quick Google review helps neighbors find us: {{reviewUrl}}";

export default function MarketingReviewsPage() {
  const crm = useCrm();
  const reviewUrl =
    crm.googleLocations.find((location) => location.id === crm.effectiveStaff?.googleLocationId)
      ?.reviewUrl ||
    crm.googleLocations.find((location) => location.isDefault)?.reviewUrl ||
    crm.googleLocations[0]?.reviewUrl ||
    "";

  const merge = buildMarketingMerge({
    company: crm.company,
    staff: crm.effectiveStaff,
    reviewUrl,
    origin: typeof window !== "undefined" ? window.location.origin : "",
  });
  const sms = applyMarketingMerge(REVIEW_SMS, merge);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <h2 className="font-heading text-xl font-medium">Review ask pack</h2>
          <p className="text-sm text-muted-foreground">
            QR card, SMS script, and Google review link for completed jobs.
          </p>
        </div>
        <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">{sms}</div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(sms);
              toast.success("SMS script copied");
            }}
          >
            Copy SMS
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!reviewUrl}
            onClick={() => {
              void navigator.clipboard.writeText(reviewUrl);
              toast.success("Review URL copied");
            }}
          >
            Copy review URL
          </Button>
          <Button
            nativeButton={false}
            size="sm"
            variant="outline"
            render={<Link href="/marketing/create?template=tpl-review-ask" />}
          >
            Make review card
          </Button>
        </div>
        {!reviewUrl ? (
          <p className="text-xs text-muted-foreground">
            Add a Google Business Profile review URL under Settings → Locations to unlock the link.
          </p>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h2 className="font-heading text-lg font-medium">Referral ask</h2>
        <p className="text-sm text-muted-foreground">
          Pair reviews with a referral ask through the client portal.
        </p>
        <Button
          nativeButton={false}
          size="sm"
          render={<Link href="/marketing/create?template=tpl-referral-ask" />}
        >
          Make referral graphic
        </Button>
      </div>
    </div>
  );
}
