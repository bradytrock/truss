"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrm } from "@/lib/crm-store";

type CompanyCamLink = {
  projectId: string;
  name: string;
  url: string;
  address: string;
  lastSyncedAt: string | null;
};

type CompanyCamProject = {
  id: string;
  name: string;
  address: string;
  url: string;
};

type JobResponse = {
  connected?: boolean;
  companyName?: string;
  link?: CompanyCamLink | null;
  projects?: CompanyCamProject[];
  searchError?: string;
  error?: string;
  sql?: string | null;
  imported?: number;
  removed?: number;
  pushed?: number;
  skipped?: number;
  total?: number;
  syncError?: string;
};

export function JobCompanyCamPanel({ jobId, disabled }: { jobId: string; disabled?: boolean }) {
  const crm = useCrm();
  const job = crm.jobs.find((item) => item.id === jobId);
  const [info, setInfo] = useState<JobResponse | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [projects, setProjects] = useState<CompanyCamProject[]>([]);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const syncedProject = useRef("");
  const reloadRef = useRef(crm.reload);
  useEffect(() => {
    reloadRef.current = crm.reload;
  }, [crm.reload]);

  async function load(search?: string) {
    const params = new URLSearchParams({ jobId });
    if (search !== undefined) params.set("q", search.trim());
    const response = await fetch(`/api/companycam/job?${params.toString()}`);
    const data = (await response.json()) as JobResponse;
    if (!response.ok) {
      setInfo(data);
      return data;
    }
    setInfo(data);
    if (search !== undefined) setProjects(data.projects ?? []);
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({ jobId });
        const response = await fetch(`/api/companycam/job?${params.toString()}`);
        const data = (await response.json()) as JobResponse;
        if (!cancelled) setInfo(data);
      } catch {
        if (!cancelled) setInfo({ error: "Could not load CompanyCam." });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    const projectId = info?.link?.projectId ?? "";
    if (!loaded || disabled || !info?.connected || !projectId) return;
    if (syncedProject.current === projectId) return;
    let cancelled = false;
    void (async () => {
      setPending(true);
      try {
        const response = await fetch("/api/companycam/job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, action: "sync" }),
        });
        const data = (await response.json()) as JobResponse;
        if (cancelled || !response.ok) return;
        syncedProject.current = projectId;
        setInfo((current) => ({ ...current, ...data, link: data.link ?? current?.link }));
        if ((data.imported ?? 0) > 0 || (data.removed ?? 0) > 0 || (data.pushed ?? 0) > 0) {
          await reloadRef.current();
        }
      } catch {
        // The next visit tries again.
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [disabled, info?.connected, info?.link?.projectId, jobId, loaded]);

  const searchValue = query ?? job?.street ?? "";

  async function act(action: "link" | "create" | "unlink", projectId?: string) {
    if (disabled) return;
    if (action === "unlink" && !window.confirm("Unlink this CompanyCam project from the job?")) return;
    setPending(true);
    try {
      const response = await fetch("/api/companycam/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action, projectId }),
      });
      const data = (await response.json()) as JobResponse;
      if (!response.ok) {
        toast.error(data.error || "CompanyCam request failed.");
        if (data.sql) setInfo((current) => ({ ...current, sql: data.sql }));
        return;
      }
      if (action === "unlink") {
        toast.success("CompanyCam project unlinked.");
        setProjects([]);
        syncedProject.current = "";
      } else {
        if (data.syncError) toast.error(data.syncError);
        else toast.success(action === "create" ? "CompanyCam project created. Photos stay in sync." : "CompanyCam project linked. Photos stay in sync.");
        setProjects([]);
        if (data.link?.projectId) syncedProject.current = data.link.projectId;
        await crm.reload();
      }
      await load();
    } catch {
      toast.error("CompanyCam request failed.");
    } finally {
      setPending(false);
    }
  }

  const link = info?.link ?? null;
  const canCreate = Boolean(
    job?.street.trim() && job.city.trim() && job.state.trim() && job.postalCode.trim(),
  );

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">CompanyCam</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {info?.connected
              ? `This company is connected to ${info.companyName || "CompanyCam"}. Link the job's project and its photos stay in the gallery.`
              : "Connect this company's CompanyCam account to show a project's photos on the job."}
          </p>
        </div>
        <Button nativeButton={false} size="sm" variant="ghost" render={<Link href="/settings/companycam" />}>
          Settings
        </Button>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        {info?.sql ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{info.sql}</p>
        ) : null}

        {!loaded ? <p className="text-sm text-muted-foreground">Loading CompanyCam…</p> : null}

        {loaded && info?.error && !info.sql ? (
          <p className="text-sm text-muted-foreground">{info.error}</p>
        ) : null}

        {loaded && info && !info.connected && !info.sql && !info.error ? (
          <p className="text-sm text-muted-foreground">
            A company admin can paste this office&apos;s CompanyCam token in Settings.
          </p>
        ) : null}

        {link ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{link.name || "CompanyCam project"}</p>
            {link.address ? <p className="text-sm text-muted-foreground">{link.address}</p> : null}
            <p className="text-sm text-muted-foreground">
              {pending ? "Syncing photos…" : "Photos taken in CompanyCam show up here. Photos added on this job go to CompanyCam."}
            </p>
            <div className="flex flex-wrap gap-2">
              {link.url ? (
                <Button nativeButton={false} size="sm" variant="outline" render={<a href={link.url} target="_blank" rel="noreferrer" />}>
                  Open in CompanyCam
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="outline" disabled={disabled || pending} onClick={() => void act("unlink")}>
                Unlink
              </Button>
            </div>
          </div>
        ) : null}

        {loaded && info?.connected ? (
          <div className="space-y-2">
            <Label htmlFor={`cc-search-${jobId}`}>{link ? "Link a different project" : "Find a project"}</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id={`cc-search-${jobId}`}
                value={searchValue}
                disabled={disabled || pending}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Address or project name"
                className="min-w-48 flex-1"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || pending}
                onClick={() => void load(searchValue)}
              >
                Search
              </Button>
              {!link ? (
                <Button type="button" size="sm" disabled={disabled || pending || !canCreate} onClick={() => void act("create")}>
                  Create project
                </Button>
              ) : null}
            </div>
            {!canCreate && !link ? (
              <p className="text-xs text-muted-foreground">
                Add the street, city, state, and ZIP on the job to create a CompanyCam project from it.
              </p>
            ) : null}
            {info.searchError ? <p className="text-sm text-muted-foreground">{info.searchError}</p> : null}
            {projects.length > 0 ? (
              <ul className="space-y-1.5">
                {projects.map((project) => (
                  <li key={project.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{project.name}</span>
                      {project.address ? (
                        <span className="block truncate text-xs text-muted-foreground">{project.address}</span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled || pending}
                      onClick={() => void act("link", project.id)}
                    >
                      Link
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
