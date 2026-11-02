"use client";

import { useEffect, useMemo, useState } from "react";
import { CloudLightning } from "lucide-react";
import Link from "next/link";
import { useCrm } from "@/lib/crm-store";
import { isDeletedJob } from "@/lib/job-record";
import { jobHasCoords } from "@/lib/project-map";
import { PHOTO_PROMPT, buildStormDesk, type DeskJob } from "@/lib/weather/desk";
import { loadStormLayers } from "@/lib/weather/client";
import type { Job } from "@/lib/types";

export function JobStormChip({ job }: { job: Job }) {
  const crm = useCrm();
  const [ready, setReady] = useState(false);
  const deskJobs = useMemo<DeskJob[]>(() => {
    return (crm.jobs ?? [])
      .filter((item) => !isDeletedJob(item) && jobHasCoords(item))
      .map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        city: item.city,
        state: item.state,
        postalCode: item.postalCode,
        status: item.status,
        lat: item.lat as number,
        lng: item.lng as number,
        ownerStaffId: item.ownerStaffId,
      }));
  }, [crm.jobs]);
  const focus = deskJobs.find((item) => item.id === job.id);
  const states = useMemo(
    () => [crm.company.state, job.state].filter(Boolean),
    [crm.company.state, job.state],
  );

  useEffect(() => {
    if (!focus) return;
    let cancel = false;
    loadStormLayers(
      deskJobs.map((item) => ({ id: item.id, lat: item.lat, lng: item.lng, state: item.state })),
      states,
    )
      .then(() => {
        if (!cancel) setReady(true);
      })
      .catch(() => {
        if (!cancel) setReady(false);
      });
    return () => {
      cancel = true;
    };
  }, [deskJobs, focus, states]);

  if (!focus || !ready) return null;
  return <JobStormChipBody jobs={deskJobs} states={states} jobId={job.id} />;
}

function JobStormChipBody({ jobs, states, jobId }: { jobs: DeskJob[]; states: string[]; jobId: string }) {
  const [impactText, setImpactText] = useState<{ hail: string; hold: string; photo: boolean; warning: string } | null>(null);

  useEffect(() => {
    let cancel = false;
    loadStormLayers(
      jobs.map((item) => ({ id: item.id, lat: item.lat, lng: item.lng, state: item.state })),
      states,
    )
      .then((layers) => {
        if (cancel) return;
        const impact = buildStormDesk(jobs, layers).impacts.find((row) => row.id === jobId);
        if (!impact || (!impact.hailText && !impact.warning && !impact.hold)) {
          setImpactText(null);
          return;
        }
        setImpactText({
          hail: impact.hailText,
          hold: impact.holdReason,
          photo: impact.photoPrompt,
          warning: impact.warning?.headline ?? "",
        });
      })
      .catch(() => {
        if (!cancel) setImpactText(null);
      });
    return () => {
      cancel = true;
    };
  }, [jobId, jobs, states]);

  if (!impactText) return null;
  return (
    <div className="mt-3 max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <p className="flex items-center gap-2 font-medium">
        <CloudLightning className="size-4" />
        {impactText.hail || "Storm on this job"}
      </p>
      {impactText.warning ? <p className="mt-1">{impactText.warning}</p> : null}
      {impactText.hold ? <p className="mt-1">{impactText.hold}</p> : null}
      {impactText.photo ? <p className="mt-1">{PHOTO_PROMPT}</p> : null}
      <Link href="/storm" className="mt-1 inline-block text-xs underline">
        Open the storm desk
      </Link>
    </div>
  );
}
