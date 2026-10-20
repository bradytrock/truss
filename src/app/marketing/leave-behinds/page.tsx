"use client";

import Link from "next/link";
import { useState } from "react";
import { SuiteCard, SuitePage, SuiteTitle, ToneBadge } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrm } from "@/lib/crm-store";
import { useMarketing } from "@/lib/marketing/store";
import { saveDoors, useDoors, type CanvassDoor } from "@/lib/marketing/suite-prefs";

const PIECES = [
  { id: "finished", label: "Just finished", tone: "red" as const },
  { id: "neighbors", label: "Neighbors", tone: "red" as const },
  { id: "work", label: "Work notice", tone: "ink" as const },
  { id: "storm", label: "Storm", tone: "red" as const },
  { id: "yard", label: "Yard sign", tone: "gold" as const },
];

export default function LeaveBehindsPage() {
  const crm = useCrm();
  const marketing = useMarketing();
  const jobs = crm.jobs.filter((job) => !job.deletedAt);
  const [jobId, setJobId] = useState(jobs[0]?.id || "");
  const [draft, setDraft] = useState("");
  const companyId = crm.user.companyId || "local";
  const job = jobs.find((item) => item.id === jobId) ?? null;
  const storedDoors = useDoors(companyId, job?.id || "none");
  const doors: CanvassDoor[] =
    storedDoors.length > 0
      ? storedDoors
      : job
        ? [{ id: "job", address: [job.street, job.city].filter(Boolean).join(", ") || job.location || "Job address", status: "todo" }]
        : [];

  function update(next: CanvassDoor[]) {
    if (!job) return;
    saveDoors(companyId, job.id, next);
  }

  const left = doors.filter((door) => door.status === "left").length;
  const scans = marketing.materials.filter((item) => item.kind === "door_hanger" || item.kind === "leave_behind");

  return (
    <SuitePage>
      <SuiteTitle
        title="Leave-behinds"
        description="Door hangers and notices for the street around a job. Every QR scan comes back to the rep and the job."
        action={<Button nativeButton={false} render={<Link href="/marketing/print?template=tpl-door-hanger" />}>Print a batch</Button>}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {PIECES.map((piece) => (
          <Link key={piece.id} href="/marketing/templates" className="block rounded-xl border border-[#e7e4df] bg-white p-3">
            <ToneBadge tone={piece.tone}>{piece.label}</ToneBadge>
            <p className="mt-3 text-xs text-[#6f6a64]">Open the kit and merge the job you are standing in front of.</p>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_320px]">
        <SuiteCard className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-medium">Canvass the block</h2>
              <p className="text-xs text-[#8a8680]">{job ? `${job.code} · ${job.street || job.location}` : "Pick a job"}</p>
            </div>
            <select className="h-8 rounded-md border bg-white px-2 text-sm" value={jobId} onChange={(event) => setJobId(event.target.value)}>
              {jobs.map((item) => (
                <option key={item.id} value={item.id}>{item.code} · {item.city || item.name}</option>
              ))}
            </select>
          </div>
          <div className="mb-4 grid h-36 place-items-center rounded-lg bg-[#ece7df] text-sm text-[#6f6a64]">
            {job?.street || job?.location || "Job street"} · {left} of {doors.length} doors marked hanger left
          </div>
          <ul className="divide-y divide-[#f0eeeb]">
            {doors.map((door) => (
              <li key={door.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 text-sm">{door.address}</span>
                {(["left", "talked", "skip"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => update(doors.map((item) => (item.id === door.id ? { ...item, status: item.status === status ? "todo" : status } : item)))}
                    className={`rounded-full px-2.5 py-1 text-xs ${door.status === status ? "bg-[#1c1b1a] text-white" : "bg-[#f4f3f1]"}`}
                  >
                    {status === "left" ? "Hanger left" : status === "talked" ? "Talked" : "No soliciting"}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.trim()) return;
              update([...doors, { id: crypto.randomUUID(), address: draft.trim(), status: "todo" }]);
              setDraft("");
            }}
          >
            <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a door on this street" />
            <Button type="submit" variant="outline">Add</Button>
          </form>
        </SuiteCard>
        <SuiteCard className="p-4">
          <h2 className="font-medium">QR scans</h2>
          <p className="text-xs text-[#8a8680]">Views on door hangers and leave-behinds you have saved.</p>
          {scans.length === 0 ? (
            <p className="mt-4 text-sm text-[#6f6a64]">No scanned pieces yet.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-[10px] tracking-[0.12em] text-[#8a8680] uppercase">
                <tr><th className="py-1">Piece</th><th className="py-1">Scans</th></tr>
              </thead>
              <tbody>
                {scans.slice(0, 8).map((item) => (
                  <tr key={item.id} className="border-t border-[#f0eeeb]">
                    <td className="py-2">{item.name}</td>
                    <td className="py-2">{item.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SuiteCard>
      </div>
    </SuitePage>
  );
}
