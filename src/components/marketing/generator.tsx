"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MarketingCanvas, materialPreviewModel } from "@/components/marketing/canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { applyMarketingMerge, buildMarketingMerge } from "@/lib/marketing/merge";
import { useMarketing } from "@/lib/marketing/store";
import { marketingShareUrl } from "@/lib/marketing/storage";
import type { MarketingTemplate } from "@/lib/marketing/types";

export function MarketingGenerator({
  template,
  initialJobId = "",
  initialPartnerId = "",
}: {
  template: MarketingTemplate;
  initialJobId?: string;
  initialPartnerId?: string;
}) {
  const crm = useCrm();
  const marketing = useMarketing();
  const router = useRouter();
  const [jobId, setJobId] = useState(initialJobId);
  const [partnerId, setPartnerId] = useState(initialPartnerId);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [vanitySlug, setVanitySlug] = useState("");
  const [headline, setHeadline] = useState("");
  const [subhead, setSubhead] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("");

  const jobs = useMemo(
    () => crm.jobs.filter((job) => !job.deletedAt).slice(0, 100),
    [crm.jobs],
  );
  const partners = useMemo(
    () => crm.contacts.filter((contact) => contact.isReferralPartner),
    [crm.contacts],
  );
  const job = jobs.find((item) => item.id === jobId) ?? null;
  const contact = job?.primaryContactId
    ? (crm.contacts.find((item) => item.id === job.primaryContactId) ?? null)
    : null;
  const partner = partners.find((item) => item.id === partnerId) ?? null;

  const reviewUrl = useMemo(() => {
    const locations = crm.googleLocations ?? [];
    const preferredId = crm.effectiveStaff?.googleLocationId;
    return (
      locations.find((location) => location.id === preferredId)?.reviewUrl ||
      locations.find((location) => location.isDefault)?.reviewUrl ||
      locations[0]?.reviewUrl ||
      ""
    );
  }, [crm.effectiveStaff?.googleLocationId, crm.googleLocations]);

  const merge = useMemo(
    () =>
      buildMarketingMerge({
        company: crm.company,
        staff: crm.effectiveStaff,
        job,
        contact,
        partner,
        reviewUrl,
        origin: typeof window !== "undefined" ? window.location.origin : "",
      }),
    [contact, crm.company, crm.effectiveStaff, job, partner, reviewUrl],
  );

  useEffect(() => {
    setHeadline(applyMarketingMerge(template.headline, merge));
    setSubhead(applyMarketingMerge(template.subhead, merge));
    setBody(applyMarketingMerge(template.body, merge));
    setCta(applyMarketingMerge(template.cta, merge));
  }, [merge, template.body, template.cta, template.headline, template.subhead]);

  const jobPhotos = useMemo(
    () =>
      crm.photos.filter(
        (photo) => photo.jobId === jobId && !photo.deletedAt && Boolean(photo.imageUrl),
      ),
    [crm.photos, jobId],
  );

  function togglePhoto(url: string) {
    setSelectedPhotos((current) => {
      if (current.includes(url)) return current.filter((item) => item !== url);
      if (current.length >= 2) return [current[1], url];
      return [...current, url];
    });
  }

  function save(copyLink: boolean) {
    const material = marketing.createFromTemplate({
      template,
      headline: headline.trim() || template.name,
      subhead: subhead.trim(),
      body: body.trim(),
      cta: cta.trim(),
      jobId: jobId || null,
      contactId: contact?.id ?? null,
      partnerContactId: partnerId || null,
      photoUrls: selectedPhotos,
      vanitySlug,
    });
    if (copyLink && typeof window !== "undefined") {
      const url = marketingShareUrl(material.shareToken, window.location.origin);
      void navigator.clipboard.writeText(url);
      marketing.track(material.id, "share");
      toast.success("Saved and share link copied");
    } else {
      toast.success("Material saved");
    }
    router.push(`/marketing/materials/${material.id}`);
  }

  const preview = materialPreviewModel(
    {
      kind: template.kind,
      headline,
      subhead,
      body,
      cta,
      badge: template.badge,
      accent: template.accent,
      photoUrls: selectedPhotos,
    },
    crm.company.name,
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Job</Label>
            <Select
              value={jobId || "__none"}
              onValueChange={(value) => {
                const next = value ?? "__none";
                setJobId(next === "__none" ? "" : next);
                setSelectedPhotos([]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a job" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No job</SelectItem>
                {jobs.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Realtor / partner</Label>
            <Select
              value={partnerId || "__none"}
              onValueChange={(value) => {
                const next = value ?? "__none";
                setPartnerId(next === "__none" ? "" : next);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Optional partner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No partner</SelectItem>
                {partners.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mk-headline">Headline</Label>
          <Input id="mk-headline" value={headline} onChange={(event) => setHeadline(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mk-subhead">Subhead</Label>
          <Input id="mk-subhead" value={subhead} onChange={(event) => setSubhead(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mk-body">Body</Label>
          <Textarea
            id="mk-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-28"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mk-cta">Call to action</Label>
            <Input id="mk-cta" value={cta} onChange={(event) => setCta(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mk-slug">Vanity link (optional)</Label>
            <Input
              id="mk-slug"
              placeholder="hail-plano"
              value={vanitySlug}
              onChange={(event) => setVanitySlug(event.target.value)}
            />
          </div>
        </div>

        {jobId ? (
          <div className="space-y-2">
            <Label>Job photos (up to 2)</Label>
            {jobPhotos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No photos on this job yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {jobPhotos.slice(0, 12).map((photo) => {
                  const active = selectedPhotos.includes(photo.imageUrl);
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => togglePhoto(photo.imageUrl)}
                      className={
                        active
                          ? "overflow-hidden rounded-md ring-2 ring-primary"
                          : "overflow-hidden rounded-md ring-1 ring-border"
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.imageUrl} alt="" className="aspect-square w-full object-cover" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => save(false)}>
            Save material
          </Button>
          <Button type="button" variant="outline" onClick={() => save(true)}>
            Save & copy link
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Preview</p>
        <MarketingCanvas model={preview} />
      </div>
    </div>
  );
}
