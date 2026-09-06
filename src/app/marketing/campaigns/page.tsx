"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMarketing } from "@/lib/marketing/store";
import type { MarketingCampaignKind } from "@/lib/marketing/types";

export default function MarketingCampaignsPage() {
  const marketing = useMarketing();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MarketingCampaignKind>("storm");
  const [neighborhood, setNeighborhood] = useState("");
  const [radiusMiles, setRadiusMiles] = useState("1");
  const [stormName, setStormName] = useState("");
  const [summary, setSummary] = useState("");

  function createCampaign() {
    if (!name.trim()) {
      toast.error("Name the campaign");
      return;
    }
    const now = new Date().toISOString();
    marketing.saveCampaign({
      id: marketing.newId("camp"),
      name: name.trim(),
      kind,
      summary: summary.trim() || `${kind} campaign`,
      neighborhood: neighborhood.trim(),
      radiusMiles: Number(radiusMiles) || 1,
      stormName: stormName.trim(),
      status: "active",
      materialIds: [],
      createdAt: now,
      updatedAt: now,
    });
    setName("");
    setSummary("");
    setNeighborhood("");
    setStormName("");
    toast.success("Campaign created");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-3 rounded-lg border p-4">
        <h2 className="font-heading text-lg font-medium">New campaign</h2>
        <div className="space-y-1.5">
          <Label htmlFor="camp-name">Name</Label>
          <Input
            id="camp-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Plano hail — week of Mar 9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="camp-kind">Type</Label>
          <select
            id="camp-kind"
            className="h-8 w-full rounded-md border bg-background px-2 text-sm"
            value={kind}
            onChange={(event) => setKind(event.target.value as MarketingCampaignKind)}
          >
            <option value="storm">Storm</option>
            <option value="neighborhood">Neighborhood</option>
            <option value="partner">Partner</option>
            <option value="seasonal">Seasonal</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="camp-hood">Neighborhood</Label>
            <Input
              id="camp-hood"
              value={neighborhood}
              onChange={(event) => setNeighborhood(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="camp-radius">Radius (mi)</Label>
            <Input
              id="camp-radius"
              value={radiusMiles}
              onChange={(event) => setRadiusMiles(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="camp-storm">Storm name</Label>
          <Input
            id="camp-storm"
            value={stormName}
            onChange={(event) => setStormName(event.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="camp-summary">Summary</Label>
          <Textarea
            id="camp-summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            className="min-h-20"
          />
        </div>
        <Button type="button" onClick={createCampaign}>
          Create campaign
        </Button>
      </div>

      <div className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Active & recent</h2>
        {marketing.campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create a storm or neighborhood campaign, then attach materials from Templates."
          />
        ) : (
          <ul className="space-y-2">
            {marketing.campaigns.map((campaign) => (
              <li key={campaign.id} className="rounded-lg border px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium tracking-tight">{campaign.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {campaign.kind}
                      {campaign.neighborhood ? ` · ${campaign.neighborhood}` : ""}
                      {campaign.radiusMiles ? ` · ${campaign.radiusMiles} mi` : ""}
                      {campaign.stormName ? ` · ${campaign.stormName}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tracking-wide uppercase">
                    {campaign.status}
                  </span>
                </div>
                {campaign.summary ? (
                  <p className="mt-2 text-sm text-muted-foreground">{campaign.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
