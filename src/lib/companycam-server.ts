import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMPANYCAM_API,
  asCompanyCamList,
  companyCamErrorMessage,
  companyCamProjectBody,
  companyCamTokenHint,
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
    if (!result.ok) return { ok: false as const, error: result.error, photos };
    const batch = asCompanyCamList(result.json)
      .map(parseCompanyCamPhoto)
      .filter((item): item is CompanyCamPhoto => Boolean(item));
    photos.push(...batch);
    if (batch.length < 100) break;
  }
  return { ok: true as const, error: "", photos };
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
      scopes: ["photo.created", "photo.updated"],
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
