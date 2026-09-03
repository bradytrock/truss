import {
  eagleviewHostCredentials,
  fetchEagleviewAccessToken,
  isEagleviewProductId,
  type EagleviewProductId,
} from "@/lib/eagleview";
import { mapEagleviewConnection } from "@/lib/supabase/mappers";
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
  createdBy: string;
}) {
  const fileId = crypto.randomUUID();
  const storagePath = `${input.companyId}/${input.jobId}/${fileId}.pdf`;
  const contentType = "application/pdf";

  async function tryUpload(bucket: string, path: string) {
    const { error } = await input.supabase.storage.from(bucket).upload(path, input.pdf, {
      contentType,
      upsert: false,
    });
    if (error) return { ok: false as const, error };
    return {
      ok: true as const,
      bucket,
      storagePath: path,
      url: input.supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl,
    };
  }

  let uploaded = await tryUpload("job-files", storagePath);
  if (!uploaded.ok) {
    uploaded = await tryUpload("receipts", `${input.companyId}/job-files/${input.jobId}/${fileId}.pdf`);
  }
  if (!uploaded.ok) {
    return { ok: false as const, error: uploaded.error.message || "Could not upload the report PDF." };
  }

  const { data, error } = await input.supabase
    .from("job_files")
    .insert({
      id: fileId,
      company_id: input.companyId,
      job_id: input.jobId,
      name: input.fileName,
      mime_type: contentType,
      size_bytes: input.pdf.byteLength,
      storage_path: uploaded.storagePath,
      url: uploaded.url,
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false as const, error: error?.message || "Could not save the report file." };
  }
  return { ok: true as const, file: data };
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
