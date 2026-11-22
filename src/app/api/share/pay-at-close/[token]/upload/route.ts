import { createClient } from "@supabase/supabase-js";
import { applicationLinkExpired, parseApplicationUploads, type ApplicationUpload } from "@/lib/pay-at-close";
import { APPLICATION_UPLOAD_BUCKET, APPLICATION_UPLOAD_MAX_BYTES, APPLICATION_UPLOAD_TYPES } from "@/lib/pay-at-close-application";
import { normalizeZip } from "@/lib/pay-at-close-homeowner";
import { isApplicationToken, normalizeShareToken } from "@/lib/share";
import { shareJson } from "@/lib/share-server";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 6;
const NOT_FOUND = "This application link isn’t available.";
const NOT_CONFIGURED = "File uploads are not set up on this server. Text or email the statement to your contractor instead.";

/**
 * The homeowner's statement goes into a private bucket. Anonymous callers cannot write there,
 * so the route writes with the service role after checking the token itself.
 */
function serviceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const url = getSupabaseUrl();
  if (!serviceKey || !url) return null;
  return createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function safeFileName(name: string) {
  const trimmed = name.trim().replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").slice(0, 80);
  return trimmed || "statement";
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = normalizeShareToken(token);
  if (!isApplicationToken(trimmed) || !isSupabaseConfigured()) return shareJson({ error: NOT_FOUND }, 404);
  const supabase = serviceClient();
  if (!supabase) return shareJson({ error: NOT_CONFIGURED }, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return shareJson({ error: "Could not read the file." }, 400);
  }
  const file = form.get("file");
  const zip = normalizeZip(typeof form.get("zip") === "string" ? (form.get("zip") as string) : "");
  if (!(file instanceof File) || file.size === 0) return shareJson({ error: "Choose a file first." }, 400);
  if (file.size > APPLICATION_UPLOAD_MAX_BYTES) return shareJson({ error: "Files are limited to 15 MB." }, 400);
  const contentType = file.type || "application/octet-stream";
  if (!APPLICATION_UPLOAD_TYPES.has(contentType)) {
    return shareJson({ error: "Upload a PDF or a photo (JPG, PNG, HEIC)." }, 400);
  }

  const { data: row, error: rowError } = await supabase
    .from("job_pay_at_close")
    .select("id, company_id, job_id, application_uploads, application_submitted_at, application_sent_at")
    .eq("application_token", trimmed)
    .maybeSingle();
  if (rowError) {
    console.error("[share] pay-at-close upload lookup", rowError.code, rowError.message);
    return shareJson({ error: NOT_FOUND }, 404);
  }
  if (!row) return shareJson({ error: NOT_FOUND }, 404);
  if (row.application_submitted_at) return shareJson({ error: "These answers were already sent." }, 409);
  if (applicationLinkExpired({ sentAt: row.application_sent_at, submittedAt: row.application_submitted_at })) {
    return shareJson({ error: "This link has expired. Ask for a new one." }, 409);
  }
  // Same gate as the page: the file goes nowhere until the property ZIP matches.
  const { data: job } = await supabase.from("jobs").select("postal_code").eq("id", row.job_id).maybeSingle();
  const jobZip = (job?.postal_code ?? "").replace(/\D/g, "").slice(0, 5);
  if (jobZip && jobZip !== zip) return shareJson({ error: "Confirm the property ZIP code first." }, 403);
  const existing = parseApplicationUploads(row.application_uploads);
  if (existing.length >= MAX_FILES) return shareJson({ error: `Up to ${MAX_FILES} files per application.` }, 400);

  const fileId = crypto.randomUUID();
  const path = `${row.company_id}/${row.id}/${fileId}-${safeFileName(file.name)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(APPLICATION_UPLOAD_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (uploadError) {
    console.error("[share] pay-at-close upload write", uploadError.message);
    return shareJson({ error: "Could not store the file. Try again in a moment." }, 500);
  }

  const upload: ApplicationUpload = {
    path,
    name: file.name.trim().slice(0, 120) || "statement",
    size: file.size,
    contentType,
    uploadedAt: new Date().toISOString(),
  };
  const uploads = [...existing, upload];
  const { error: saveError } = await supabase
    .from("job_pay_at_close")
    .update({ application_uploads: uploads as never, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (saveError) {
    console.error("[share] pay-at-close upload record", saveError.code, saveError.message);
    await supabase.storage.from(APPLICATION_UPLOAD_BUCKET).remove([path]);
    return shareJson({ error: "Could not store the file. Try again in a moment." }, 500);
  }
  return shareJson({ ok: true, upload, uploads });
}
