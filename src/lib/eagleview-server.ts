import {
  eagleviewHostCredentials,
  fetchEagleviewAccessToken,
  isEagleviewProductId,
  type EagleviewProductId,
} from "@/lib/eagleview";
import { mapEagleviewConnection } from "@/lib/supabase/mappers";
import { uploadToB2 } from "@/lib/storage/b2";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

export function randomWebhookToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function loadEagleviewConnection(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("eagleview_connections")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return { error, connection: null, row: null };
  if (!data) return { error: null, connection: null, row: null };
  return { error: null, connection: mapEagleviewConnection(data), row: data };
}

/** Prefer company Settings credentials; fall back to host env. */
export function resolveEagleviewCredentials(row: {
  client_id?: string | null;
  client_secret?: string | null;
  sandbox?: boolean | null;
  default_product?: string | null;
} | null) {
  const host = eagleviewHostCredentials();
  const clientId = row?.client_id?.trim() || host.clientId;
  const clientSecret = row?.client_secret?.trim() || host.clientSecret;
  const sandbox = row?.sandbox == null ? host.sandbox : Boolean(row.sandbox);
  const defaultProduct = isEagleviewProductId(row?.default_product ?? "")
    ? (row!.default_product as EagleviewProductId)
    : ("premium_residential" as EagleviewProductId);
  const live = Boolean(clientId && clientSecret);
  return { clientId, clientSecret, sandbox, defaultProduct, live };
}

export async function ensureEagleviewAccessToken(
  supabase: Client,
  companyId: string,
  row: Database["public"]["Tables"]["eagleview_connections"]["Row"] | null,
) {
  const creds = resolveEagleviewCredentials(row);
  if (!creds.live) {
    return { ok: false as const, error: "EagleView credentials are not configured.", creds };
  }
  const expiresAt = row?.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  if (row?.access_token?.trim() && expiresAt > Date.now() + 60_000) {
    return { ok: true as const, accessToken: row.access_token, creds };
  }
  const token = await fetchEagleviewAccessToken({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
  });
  if (!token.ok) return { ok: false as const, error: token.error, creds };
  const expires = new Date(Date.now() + token.expiresIn * 1000).toISOString();
  if (row) {
    await supabase
      .from("eagleview_connections")
      .update({
        access_token: token.accessToken,
        token_expires_at: expires,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);
  }
  return { ok: true as const, accessToken: token.accessToken, creds };
}

export async function attachEagleviewPdf(input: {
  supabase: Client;
  companyId: string;
  jobId: string;
  fileName: string;
  pdf: Buffer;
  /** Display name (legacy schema). */
  createdBy: string;
  /** Auth user id when the live schema uses uploaded_by uuid. */
  uploadedBy?: string | null;
}) {
  const fileId = crypto.randomUUID();
  const storagePath = `${input.jobId}/${fileId}.pdf`;
  const contentType = "application/pdf";

  let uploaded: { bucket: string; storagePath: string; url: string };
  try {
    const result = await uploadToB2({
      companyId: input.companyId,
      kind: "job-files",
      path: storagePath,
      body: input.pdf,
      contentType,
    });
    uploaded = {
      bucket: result.bucket,
      storagePath: result.storagePath,
      url: result.url,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not upload the report PDF.",
    };
  }

  const base = {
    id: fileId,
    company_id: input.companyId,
    job_id: input.jobId,
    name: input.fileName,
    size_bytes: input.pdf.byteLength,
    storage_path: uploaded.storagePath,
    url: uploaded.url,
  };

  // Live Truss schema: content_type + category + uploaded_by (uuid).
  const livePayload = {
    ...base,
    content_type: contentType,
    category: "other",
    uploaded_by: input.uploadedBy?.trim() || null,
  };
  // Repo migration schema: mime_type + created_by (text).
  const legacyPayload = {
    ...base,
    mime_type: contentType,
    created_by: input.createdBy || "",
  };

  type JobFileRow = Database["public"]["Tables"]["job_files"]["Row"];

  async function tryInsert(payload: Record<string, unknown>) {
    return input.supabase
      .from("job_files")
      .insert(payload as Database["public"]["Tables"]["job_files"]["Insert"])
      .select("*")
      .single();
  }

  let { data, error } = await tryInsert(livePayload);
  if (error) {
    const message = (error.message ?? "").toLowerCase();
    const schemaMismatch =
      message.includes("content_type") ||
      message.includes("uploaded_by") ||
      message.includes("category") ||
      message.includes("mime_type") ||
      message.includes("created_by") ||
      message.includes("schema cache") ||
      message.includes("could not find the");
    if (schemaMismatch) {
      ({ data, error } = await tryInsert(legacyPayload));
    }
  }

  if (error || !data) {
    return { ok: false as const, error: error?.message || "Could not save the report file." };
  }
  return { ok: true as const, file: data as JobFileRow };
}

export function measurementsJson(value: Record<string, unknown>): Json {
  return value as Json;
}

export async function loadProfileCompany(supabase: Client) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, error: "Sign in to continue." as const };
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, company_id, full_name, role, staff_id")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile?.company_id) {
    return { user, profile: null, error: "Your account is missing a company." as const };
  }
  return { user, profile, error: null };
}
