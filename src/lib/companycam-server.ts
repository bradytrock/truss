import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMPANYCAM_API,
  asCompanyCamList,
  companyCamErrorMessage,
  companyCamPhotoCreateBody,
  companyCamPhotoIdsToDrop,
  companyCamProjectBody,
  companyCamTokenHint,
  companyCamUploadUrl,
  companyCamWebhookUrl,
  isCompanyCamImageUrl,
  isUuid,
  jobHasCompanyCamAddress,
  parseCompanyCamCompany,
  parseCompanyCamPhoto,
  parseCompanyCamProject,
  type CompanyCamPhoto,
  type CompanyCamProject,
} from "@/lib/companycam";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type ConnectionRow = Database["public"]["Tables"]["companycam_connections"]["Row"];
type JobLinkRow = Database["public"]["Tables"]["companycam_job_links"]["Row"];

export type CompanyCamJobRecord = {
  id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  postal_code: string;
  lat: number | null;
  lng: number | null;
  deleted_at: string | null;
};

export function randomCompanyCamWebhookToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function publicCompanyCamStatus(row: ConnectionRow | null, origin: string) {
  const linked = Boolean(row?.linked && row.access_token.trim());
  return {
    linked,
    companyName: row?.companycam_company_name ?? "",
    companycamCompanyId: row?.companycam_company_id ?? "",
    tokenHint: row?.token_hint ?? "",
    linkedAt: row?.linked_at ?? null,
    linkedBy: row?.linked_by ?? "",
    webhookRegistered: Boolean(row?.webhook_id.trim()),
    webhookUrl: row?.webhook_token ? companyCamWebhookUrl(origin, row.webhook_token) : "",
  };
}

export function publicCompanyCamLink(row: JobLinkRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    projectId: row.companycam_project_id,
    name: row.project_name,
    url: row.project_url,
    address: row.address_line,
    lastSyncedAt: row.last_synced_at,
  };
}

export async function loadCompanyCamConnection(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("companycam_connections")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return { error, row: null as ConnectionRow | null };
  return { error: null, row: data };
}

export async function loadCompanyCamJob(supabase: Client, jobId: string) {
  if (!isUuid(jobId)) return { error: "That job was not found.", job: null as CompanyCamJobRecord | null };
  const { data, error } = await supabase
    .from("jobs")
    .select("id, name, street, city, state, postal_code, lat, lng, deleted_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return { error: error.message, job: null };
  if (!data) return { error: "That job was not found.", job: null };
  return { error: null, job: data };
}

export async function loadCompanyCamLink(supabase: Client, companyId: string, jobId: string) {
  const { data, error } = await supabase
    .from("companycam_job_links")
    .select("*")
    .eq("company_id", companyId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) return { error, row: null as JobLinkRow | null };
  return { error: null, row: data };
}

export async function companyCamRequest(token: string, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${COMPANYCAM_API}${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CompanyCam did not respond.";
    return { ok: false as const, status: 0, json: null, error: message };
  }
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
  }
  if (!response.ok) {
    const fallback =
      response.status === 401 || response.status === 403
        ? "CompanyCam rejected that token. Create a new Application Key and paste it again."
        : `CompanyCam returned ${response.status}.`;
    return { ok: false as const, status: response.status, json, error: companyCamErrorMessage(json, fallback) };
  }
  return { ok: true as const, status: response.status, json, error: "" };
}

export async function verifyCompanyCamToken(token: string) {
  const result = await companyCamRequest(token, "/company");
  if (!result.ok) return { ok: false as const, error: result.error, company: null };
  const company = parseCompanyCamCompany(result.json);
  if (!company) {
    return { ok: false as const, error: "CompanyCam did not return a company for that token.", company: null };
  }
  return { ok: true as const, error: "", company };
}

export async function searchCompanyCamProjects(token: string, query: string) {
  const params = new URLSearchParams({ per_page: "25", page: "1" });
  const q = query.trim().slice(0, 120);
  if (q) params.set("query", q);
  const result = await companyCamRequest(token, `/projects?${params.toString()}`);
  if (!result.ok) return { ok: false as const, error: result.error, projects: [] as CompanyCamProject[] };
  const projects = asCompanyCamList(result.json)
    .map(parseCompanyCamProject)
    .filter((item): item is CompanyCamProject => Boolean(item));
  return { ok: true as const, error: "", projects };
}

export async function fetchCompanyCamProject(token: string, projectId: string) {
  const result = await companyCamRequest(token, `/projects/${encodeURIComponent(projectId)}`);
  if (!result.ok) return { ok: false as const, error: result.error, project: null };
  const project = parseCompanyCamProject(result.json);
  if (!project) return { ok: false as const, error: "CompanyCam project was not found.", project: null };
  return { ok: true as const, error: "", project };
}

export async function createCompanyCamProject(token: string, job: CompanyCamJobRecord) {
  const address = {
    street: job.street,
    city: job.city,
    state: job.state,
    postalCode: job.postal_code,
  };
  if (!jobHasCompanyCamAddress(address)) {
    return {
      ok: false as const,
      error: "Add the street, city, state, and ZIP on the job before creating a CompanyCam project.",
      project: null,
    };
  }
  const result = await companyCamRequest(token, "/projects", {
    method: "POST",
    body: JSON.stringify(
      companyCamProjectBody({
        name: job.name,
        ...address,
        lat: job.lat,
        lng: job.lng,
      }),
    ),
  });
  if (!result.ok) return { ok: false as const, error: result.error, project: null };
  const project = parseCompanyCamProject(result.json);
  if (!project) return { ok: false as const, error: "CompanyCam did not return the new project.", project: null };
  return { ok: true as const, error: "", project };
}

export async function listCompanyCamPhotos(token: string, projectId: string) {
  const photos: CompanyCamPhoto[] = [];
  for (let page = 1; page <= 4; page += 1) {
    const params = new URLSearchParams({ page: String(page), per_page: "100" });
    const result = await companyCamRequest(
      token,
      `/projects/${encodeURIComponent(projectId)}/photos?${params.toString()}`,
    );
    if (!result.ok) return { ok: false as const, error: result.error, photos, complete: false };
    const batch = asCompanyCamList(result.json)
      .map(parseCompanyCamPhoto)
      .filter((item): item is CompanyCamPhoto => Boolean(item));
    photos.push(...batch);
    if (batch.length < 100) return { ok: true as const, error: "", photos, complete: true };
  }
  return { ok: true as const, error: "", photos, complete: false };
}

export async function saveCompanyCamLink(
  supabase: Client,
  input: { companyId: string; jobId: string; project: CompanyCamProject },
) {
  const { data: existing, error: existingError } = await supabase
    .from("companycam_job_links")
    .select("id, job_id")
    .eq("company_id", input.companyId)
    .eq("companycam_project_id", input.project.id)
    .maybeSingle();
  if (existingError) return { error: existingError, row: null as JobLinkRow | null };
  if (existing && existing.job_id !== input.jobId) {
    return { error: { message: "That CompanyCam project is already linked to another job." }, row: null };
  }

  const now = new Date().toISOString();
  const payload = {
    company_id: input.companyId,
    job_id: input.jobId,
    companycam_project_id: input.project.id,
    project_name: input.project.name,
    project_url: input.project.url,
    address_line: input.project.address,
    updated_at: now,
  };
  const { data: current } = await supabase
    .from("companycam_job_links")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("job_id", input.jobId)
    .maybeSingle();

  if (current?.id) {
    const { data, error } = await supabase
      .from("companycam_job_links")
      .update(payload)
      .eq("id", current.id)
      .select("*")
      .single();
    return { error, row: data };
  }

  const { data, error } = await supabase
    .from("companycam_job_links")
    .insert(payload)
    .select("*")
    .single();
  return { error, row: data };
}

export async function importCompanyCamPhotos(
  supabase: Client,
  input: { companyId: string; jobId: string; photos: CompanyCamPhoto[] },
) {
  const ids = [...new Set(input.photos.map((photo) => photo.id))];
  const existing = new Set<string>();
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("job_photos")
      .select("companycam_photo_id")
      .eq("company_id", input.companyId)
      .in("companycam_photo_id", ids);
    if (error) return { error, imported: 0, skipped: 0 };
    for (const row of data ?? []) {
      if (row.companycam_photo_id) existing.add(row.companycam_photo_id);
    }
  }

  const fresh = input.photos.filter((photo) => !existing.has(photo.id) && isCompanyCamImageUrl(photo.url));
  let imported = 0;
  for (let index = 0; index < fresh.length; index += 50) {
    const chunk = fresh.slice(index, index + 50).map((photo) => ({
      company_id: input.companyId,
      job_id: input.jobId,
      caption: photo.caption || "CompanyCam",
      category: "progress" as const,
      taken_at: photo.takenOn,
      image_url: photo.url,
      storage_path: null,
      created_by: "CompanyCam",
      companycam_photo_id: photo.id,
    }));
    const { error } = await supabase.from("job_photos").insert(chunk);
    if (error) return { error, imported, skipped: input.photos.length - imported };
    imported += chunk.length;
  }

  await supabase
    .from("companycam_job_links")
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("company_id", input.companyId)
    .eq("job_id", input.jobId);

  return { error: null, imported, skipped: input.photos.length - imported };
}

const OUTBOUND_PHOTO_LIMIT = 25;
const DROP_GRACE_MS = 15 * 60 * 1000;

export async function syncCompanyCamJob(
  supabase: Client,
  input: { token: string; companyId: string; jobId: string; projectId: string },
) {
  const listed = await listCompanyCamPhotos(input.token, input.projectId);
  if (!listed.ok) {
    return { ok: false as const, error: listed.error, imported: 0, removed: 0, pushed: 0, total: listed.photos.length };
  }
  const imported = await importCompanyCamPhotos(supabase, {
    companyId: input.companyId,
    jobId: input.jobId,
    photos: listed.photos.map((photo) => ({
      ...photo,
      projectId: photo.projectId || input.projectId,
    })),
  });
  if (imported.error) {
    return {
      ok: false as const,
      error: imported.error.message,
      imported: imported.imported,
      removed: 0,
      pushed: 0,
      total: listed.photos.length,
    };
  }

  let removed = 0;
  if (listed.complete) {
    const cutoff = new Date(Date.now() - DROP_GRACE_MS).toISOString();
    const { data: local, error: localError } = await supabase
      .from("job_photos")
      .select("id, companycam_photo_id, created_at")
      .eq("company_id", input.companyId)
      .eq("job_id", input.jobId)
      .is("deleted_at", null)
      .neq("companycam_photo_id", "")
      .lt("created_at", cutoff);
    if (!localError && local) {
      const dropPhotoIds = companyCamPhotoIdsToDrop(
        local.map((row) => row.companycam_photo_id ?? ""),
        listed.photos.map((photo) => photo.id),
        true,
      );
      const dropRows = local.filter((row) => dropPhotoIds.includes(row.companycam_photo_id ?? ""));
      if (dropRows.length > 0) {
        const now = new Date().toISOString();
        const { error: dropError } = await supabase
          .from("job_photos")
          .update({ deleted_at: now, deleted_by: "CompanyCam" })
          .in(
            "id",
            dropRows.map((row) => row.id),
          );
        if (!dropError) {
          removed = dropRows.length;
          await supabase
            .from("jobs")
            .update({ primary_photo_id: null })
            .eq("id", input.jobId)
            .in(
              "primary_photo_id",
              dropRows.map((row) => row.id),
            );
        }
      }
    }
  }

  const pushed = await pushUnlinkedJobPhotos(supabase, input);
  return {
    ok: true as const,
    error: "",
    imported: imported.imported,
    removed,
    pushed: pushed.pushed,
    total: listed.photos.length,
  };
}

async function pushUnlinkedJobPhotos(
  supabase: Client,
  input: { token: string; companyId: string; jobId: string; projectId: string },
) {
  const { data, error } = await supabase
    .from("job_photos")
    .select("id, image_url, caption, taken_at, companycam_photo_id, created_by, deleted_at")
    .eq("company_id", input.companyId)
    .eq("job_id", input.jobId)
    .is("deleted_at", null)
    .eq("companycam_photo_id", "")
    .order("created_at", { ascending: true })
    .limit(OUTBOUND_PHOTO_LIMIT);
  if (error || !data) return { pushed: 0 };
  let pushed = 0;
  for (const row of data) {
    if ((row.created_by ?? "") === "CompanyCam") continue;
    const result = await pushJobPhotoToCompanyCam(supabase, {
      token: input.token,
      companyId: input.companyId,
      projectId: input.projectId,
      photo: row,
    });
    if (result.ok && !result.skipped) pushed += 1;
  }
  return { pushed };
}

export async function pushJobPhotoToCompanyCam(
  supabase: Client,
  input: {
    token: string;
    companyId: string;
    projectId: string;
    photo: {
      id: string;
      image_url: string;
      caption: string;
      taken_at: string;
      companycam_photo_id?: string | null;
      created_by?: string | null;
    };
  },
) {
  const existingId = (input.photo.companycam_photo_id ?? "").trim();
  if (existingId) {
    const current = await companyCamRequest(input.token, `/photos/${encodeURIComponent(existingId)}`);
    if (current.ok) return { ok: true as const, skipped: true, error: "", companyCamPhotoId: existingId };
    if (current.status !== 404) return { ok: false as const, skipped: false, error: current.error, companyCamPhotoId: "" };
  }
  const uri = companyCamUploadUrl(input.photo.image_url);
  if (!uri) return { ok: true as const, skipped: true, error: "", companyCamPhotoId: existingId };
  const created = await companyCamRequest(
    input.token,
    `/projects/${encodeURIComponent(input.projectId)}/photos`,
    {
      method: "POST",
      body: JSON.stringify(
        companyCamPhotoCreateBody({
          uri,
          capturedAt: input.photo.taken_at,
          description: input.photo.caption,
        }),
      ),
    },
  );
  if (!created.ok) return { ok: false as const, skipped: false, error: created.error, companyCamPhotoId: "" };
  const photo = parseCompanyCamPhoto(created.json);
  if (!photo) {
    return { ok: false as const, skipped: false, error: "CompanyCam did not return the new photo.", companyCamPhotoId: "" };
  }
  await claimCompanyCamPhotoId(supabase, {
    companyId: input.companyId,
    photoId: input.photo.id,
    companyCamPhotoId: photo.id,
  });
  return { ok: true as const, skipped: false, error: "", companyCamPhotoId: photo.id };
}

async function claimCompanyCamPhotoId(
  supabase: Client,
  input: { companyId: string; photoId: string; companyCamPhotoId: string },
) {
  const now = new Date().toISOString();
  const first = await supabase
    .from("job_photos")
    .update({ companycam_photo_id: input.companyCamPhotoId })
    .eq("id", input.photoId)
    .eq("company_id", input.companyId);
  if (!first.error) return;
  if (first.error.code !== "23505") return;
  await supabase
    .from("job_photos")
    .update({ companycam_photo_id: "", deleted_at: now, deleted_by: "CompanyCam" })
    .eq("company_id", input.companyId)
    .eq("companycam_photo_id", input.companyCamPhotoId)
    .neq("id", input.photoId);
  await supabase
    .from("job_photos")
    .update({ companycam_photo_id: input.companyCamPhotoId })
    .eq("id", input.photoId)
    .eq("company_id", input.companyId);
}

export async function removeJobPhotoFromCompanyCam(token: string, companyCamPhotoId: string) {
  const id = companyCamPhotoId.trim();
  if (!id) return { ok: true as const, skipped: true, error: "" };
  const result = await companyCamRequest(token, `/photos/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (result.ok || result.status === 404) return { ok: true as const, skipped: result.status === 404, error: "" };
  return { ok: false as const, skipped: false, error: result.error };
}

export async function registerCompanyCamWebhook(input: {
  token: string;
  webhookToken: string;
  webhookUrl: string;
  previousWebhookId?: string;
}) {
  if (input.previousWebhookId?.trim()) {
    await companyCamRequest(input.token, `/webhooks/${encodeURIComponent(input.previousWebhookId.trim())}`, {
      method: "DELETE",
    });
  }
  const created = await companyCamRequest(input.token, "/webhooks", {
    method: "POST",
    body: JSON.stringify({
      url: input.webhookUrl,
      scopes: ["photo.created", "photo.updated", "photo.description_updated"],
      enabled: true,
      token: input.webhookToken,
    }),
  });
  if (created.ok && created.json && typeof created.json === "object" && "id" in created.json) {
    const id = String((created.json as { id?: unknown }).id ?? "").trim();
    if (id) return { id, error: "" };
  }
  const listed = await companyCamRequest(input.token, "/webhooks?per_page=100");
  if (listed.ok) {
    const match = asCompanyCamList(listed.json).find((item) => {
      if (!item || typeof item !== "object") return false;
      const url = "url" in item && typeof item.url === "string" ? item.url : "";
      return url === input.webhookUrl;
    }) as { id?: unknown } | undefined;
    const id = String(match?.id ?? "").trim();
    if (id) return { id, error: "" };
  }
  return {
    id: "",
    error: created.ok ? "CompanyCam did not return a webhook id." : created.error,
  };
}

export async function deleteCompanyCamWebhook(token: string, webhookId: string) {
  if (!token.trim() || !webhookId.trim()) return;
  await companyCamRequest(token, `/webhooks/${encodeURIComponent(webhookId.trim())}`, { method: "DELETE" });
}

export function connectionTokenHint(token: string) {
  return companyCamTokenHint(token);
}
