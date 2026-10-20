"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { useMarketing } from "@/lib/marketing/store";
import type { MarketingSocialPost } from "@/lib/marketing/types";

const TEMPLATES = [
  { id: "before", label: "Before / after" },
  { id: "finished", label: "Just finished" },
  { id: "review", label: "Review spotlight" },
  { id: "storm", label: "Storm alert" },
];

function Compose() {
  const crm = useCrm();
  const router = useRouter();
  const marketing = useMarketing();
  const params = useSearchParams();
  const jobs = crm.jobs.filter((job) => !job.deletedAt);
  const existing = marketing.socialPosts.find((post) => post.id === params.get("post"));
  const [jobId, setJobId] = useState(jobs.find((job) => job.status === "complete")?.id || jobs[0]?.id || "");
  const [template, setTemplate] = useState(existing ? "before" : "before");
  const [channels, setChannels] = useState<Array<MarketingSocialPost["channel"]>>([existing?.channel || "instagram"]);
  const job = jobs.find((item) => item.id === jobId);
  const photos = crm.photos.filter((photo) => photo.jobId === jobId && !photo.deletedAt);
  const [caption, setCaption] = useState(existing?.body || "");
  const headline = existing
    ? existing.title
    : !job
      ? "New post"
      : template === "storm"
        ? `Hail check in ${job.city || "town"}`
        : template === "review"
          ? "A homeowner said it better than we could."
          : template === "finished"
            ? `${job.city || "Another roof"}. Start to finish.`
            : `${job.city || job.name}. Start to finish in one day.`;

  function save(status: MarketingSocialPost["status"]) {
    const post: MarketingSocialPost = {
      id: existing?.id || marketing.newId("social"),
      title: headline,
      channel: channels[0] || "instagram",
      body: caption || `${headline}\n\n${crm.company.phone} · ${crm.company.website || crm.company.name}`,
      materialId: null,
      scheduledFor: status === "scheduled" ? new Date().toISOString() : "",
      status,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    marketing.saveSocialPost(post);
    toast.success(status === "scheduled" ? "Scheduled. It still needs a publish from the connected account." : "Draft saved");
    if (status !== "idea") router.push("/marketing/social");
  }

  const checks = [
    { ok: true, label: "Headline readable at phone size" },
    { ok: Boolean(crm.company.phone), label: "Phone number is on the company" },
    { ok: photos.length > 0, label: photos.length ? "Job has photos" : "This job has no photos yet" },
    { ok: true, label: "No house numbers are added unless you type them" },
  ];

  return (
    <div className="grid h-dvh grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
      <aside className="overflow-y-auto border-r border-[#e4dfd8] bg-[#f7f5f2] p-4">
        <Link href="/marketing/social" className="text-sm text-[#3f3c38]">← Social</Link>
        <h1 className="mt-3 font-medium">{headline}</h1>
        <p className="text-xs text-[#8a8680]">Draft · edited by {crm.user.name}</p>
        <label className="mt-4 block text-xs text-[#6f6a64]">
          Job
          <select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={jobId} onChange={(event) => setJobId(event.target.value)}>
            {jobs.map((item) => (
              <option key={item.id} value={item.id}>{item.street || item.name}</option>
            ))}
          </select>
        </label>
        <p className="mt-4 text-xs text-[#8a8680]">Photos · {photos.length}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {photos.slice(0, 6).map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.id} src={photo.imageUrl} alt="" className="h-16 w-full rounded object-cover" />
          ))}
        </div>
        <p className="mt-4 text-xs text-[#8a8680]">Template</p>
        <div className="mt-2 space-y-1">
          {TEMPLATES.map((item) => (
            <button key={item.id} type="button" onClick={() => setTemplate(item.id)} className={`block w-full rounded-md px-2 py-1.5 text-left text-sm ${template === item.id ? "bg-[#1c1b1a] text-white" : "bg-white"}`}>
              {item.label}
            </button>
          ))}
        </div>
      </aside>
      <main className="overflow-y-auto bg-[#ebe6df] p-6">
        <article className="mx-auto max-w-md bg-white shadow-sm">
          <div className="grid grid-cols-2">
            <div className="grid h-56 place-items-center bg-[#2a2a2a] text-xs text-white/60">Before photo</div>
            <div className="grid h-56 place-items-center bg-[#e7e2da] text-xs text-[#8a847a]">
              {photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[0].imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                "After photo"
              )}
            </div>
          </div>
          <div className="p-5">
            <h2 className="font-heading text-3xl leading-tight font-medium">{headline}</h2>
            <p className="mt-2 text-sm text-[#6f6a64]">{job ? `${job.name} · ${job.city}` : crm.company.name}</p>
          </div>
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-sm font-medium text-white">
            <span>{crm.company.phone || "Add a phone"}</span>
            <span>{crm.company.website || crm.company.name}</span>
          </div>
        </article>
        <SuiteChecks checks={checks} />
      </main>
      <aside className="overflow-y-auto border-l border-[#e4dfd8] bg-white p-4">
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => save("idea")}>Save draft</Button>
          <Button type="button" size="sm" onClick={() => save("scheduled")}>Schedule</Button>
        </div>
        <p className="mt-4 text-xs tracking-[0.12em] text-[#8a8680] uppercase">Post to</p>
        {(["instagram", "facebook", "linkedin"] as const).map((channel) => (
          <label key={channel} className="mt-2 flex items-center gap-2 text-sm capitalize">
            <input
              type="checkbox"
              checked={channels.includes(channel)}
              onChange={(event) =>
                setChannels((current) =>
                  event.target.checked ? [...current, channel] : current.filter((item) => item !== channel),
                )
              }
            />
            {channel}
          </label>
        ))}
        <label className="mt-4 block text-xs text-[#6f6a64]">
          Caption
          <Textarea className="mt-1" rows={6} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Write the caption, or leave it and we'll use the headline." />
        </label>
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setCaption((current) => current.slice(0, 120))}>Shorter</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setCaption((current) => `${current}\n\nProud of this crew.`)}>Friendlier</Button>
        </div>
        <p className="mt-4 text-xs text-[#6f6a64]">Posts stay drafts until a company admin publishes them on the connected account. This screen does not post to Instagram or Facebook by itself.</p>
      </aside>
    </div>
  );
}

function SuiteChecks({ checks }: { checks: Array<{ ok: boolean; label: string }> }) {
  return (
    <div className="mx-auto mt-4 max-w-md rounded-xl bg-white p-4 text-sm shadow-sm">
      <p className="text-[10px] tracking-[0.14em] text-[#8a8680] uppercase">Cassio checked this graphic</p>
      <ul className="mt-2 space-y-1">
        {checks.map((check) => (
          <li key={check.label} className={check.ok ? "text-emerald-800" : "text-amber-800"}>
            {check.ok ? "✓" : "!"} {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SocialComposePage() {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-sm">Opening the post…</div>}>
      <Compose />
    </Suspense>
  );
}
