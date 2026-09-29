import { NextResponse } from "next/server";
import {
  createCompanyCamProject,
  fetchCompanyCamProject,
  loadCompanyCamConnection,
  loadCompanyCamJob,
  loadCompanyCamLink,
  publicCompanyCamLink,
  saveCompanyCamLink,
  searchCompanyCamProjects,
  syncCompanyCamJob,
} from "@/lib/companycam-server";
import { isUuid } from "@/lib/companycam";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { createClient } from "@/lib/supabase/server";
import { isMissingCompanyCam, missingCompanyCamMessage } from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function schemaFailure(error: { message?: string; code?: string } | null | undefined) {
  if (!isMissingCompanyCam(error)) return null;
  return NextResponse.json({ error: missingCompanyCamMessage(), sql: missingCompanyCamMessage() }, { status: 400 });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim() || "";
  const query = url.searchParams.get("q")?.trim() || "";
  const searching = url.searchParams.has("q");
  if (!isUuid(jobId)) return NextResponse.json({ error: "That job was not found." }, { status: 404 });

  const { job, error: jobError } = await loadCompanyCamJob(supabase, jobId);
  if (!job) return NextResponse.json({ error: jobError }, { status: 404 });

  const { row, error } = await loadCompanyCamConnection(supabase, profile.company_id);
  const missing = schemaFailure(error);
  if (missing) return missing;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const linkResult = await loadCompanyCamLink(supabase, profile.company_id, job.id);
  const linkMissing = schemaFailure(linkResult.error);
  if (linkMissing) return linkMissing;
  if (linkResult.error) return NextResponse.json({ error: linkResult.error.message }, { status: 400 });

  const connected = Boolean(row?.linked && row.access_token.trim());
  let projects: { id: string; name: string; address: string; url: string }[] = [];
  let searchError = "";
  if (searching && connected && row) {
    const found = await searchCompanyCamProjects(row.access_token, query);
    if (!found.ok) searchError = found.error;
    else projects = found.projects;
  }

  return NextResponse.json({
    connected,
    companyName: row?.companycam_company_name ?? "",
    link: publicCompanyCamLink(linkResult.row),
    projects,
    searchError,
    sql: null,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { jobId?: string; action?: string; projectId?: string }
    | null;
  const jobId = body?.jobId?.trim() || "";
  const action = body?.action?.trim() || "";
  if (!isUuid(jobId)) return NextResponse.json({ error: "That job was not found." }, { status: 404 });

  const { job, error: jobError } = await loadCompanyCamJob(supabase, jobId);
  if (!job) return NextResponse.json({ error: jobError }, { status: 404 });
  if (job.deleted_at) {
    return NextResponse.json({ error: "This job is in the trash." }, { status: 400 });
  }

  const { row, error } = await loadCompanyCamConnection(supabase, profile.company_id);
  const missing = schemaFailure(error);
  if (missing) return missing;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const token = row?.linked ? row.access_token.trim() : "";
  if (!token && action !== "unlink") {
    return NextResponse.json(
      { error: "Connect this company's CompanyCam account in Settings first." },
      { status: 400 },
    );
  }

  if (action === "unlink") {
    const { error: unlinkError } = await supabase
      .from("companycam_job_links")
      .delete()
      .eq("company_id", profile.company_id)
      .eq("job_id", job.id);
    if (unlinkError) {
      const failed = schemaFailure(unlinkError);
      if (failed) return failed;
      return NextResponse.json({ error: unlinkError.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, link: null });
  }

  if (action === "create" || action === "link") {
    const projectId = body?.projectId?.trim() || "";
    if (action === "link" && !projectId) {
      return NextResponse.json({ error: "Choose a CompanyCam project to link." }, { status: 400 });
    }
    const projectResult =
      action === "create"
        ? await createCompanyCamProject(token, job)
        : await fetchCompanyCamProject(token, projectId);
    if (!projectResult.ok || !projectResult.project) {
      return NextResponse.json({ error: projectResult.error || "Could not use that CompanyCam project." }, { status: 400 });
    }
    const saved = await saveCompanyCamLink(supabase, {
      companyId: profile.company_id,
      jobId: job.id,
      project: projectResult.project,
    });
    if (saved.error || !saved.row) {
      const failed = schemaFailure(saved.error);
      if (failed) return failed;
      return NextResponse.json(
        { error: saved.error?.message || "Could not link the CompanyCam project." },
        { status: 400 },
      );
    }
    const synced = await syncCompanyCamJob(supabase, {
      token,
      companyId: profile.company_id,
      jobId: job.id,
      projectId: saved.row.companycam_project_id,
    });
    return NextResponse.json({
      ok: true,
      link: publicCompanyCamLink({
        ...saved.row,
        last_synced_at: synced.ok ? new Date().toISOString() : saved.row.last_synced_at,
      }),
      imported: synced.imported,
      removed: synced.removed,
      pushed: synced.pushed,
      total: synced.total,
      syncError: synced.ok ? "" : synced.error,
    });
  }

  if (action === "sync") {
    const linkResult = await loadCompanyCamLink(supabase, profile.company_id, job.id);
    const linkMissing = schemaFailure(linkResult.error);
    if (linkMissing) return linkMissing;
    if (!linkResult.row) {
      return NextResponse.json({ error: "Link a CompanyCam project before syncing photos." }, { status: 400 });
    }
    const synced = await syncCompanyCamJob(supabase, {
      token,
      companyId: profile.company_id,
      jobId: job.id,
      projectId: linkResult.row.companycam_project_id,
    });
    if (!synced.ok) return NextResponse.json({ error: synced.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      imported: synced.imported,
      removed: synced.removed,
      pushed: synced.pushed,
      total: synced.total,
      link: publicCompanyCamLink({
        ...linkResult.row,
        last_synced_at: new Date().toISOString(),
      }),
    });
  }

  return NextResponse.json({ error: "Unknown CompanyCam action." }, { status: 400 });
}
