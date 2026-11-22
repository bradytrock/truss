import { APPLICATION_AUTHORIZATIONS } from "@/lib/pay-at-close";
import { parseFieldValues, parseInterviewValues, parseSharedApplication } from "@/lib/pay-at-close-application";
import { normalizeZip } from "@/lib/pay-at-close-homeowner";
import { requestAudit } from "@/lib/request-audit";
import { isApplicationToken, normalizeShareToken } from "@/lib/share";
import { shareJson } from "@/lib/share-server";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = "This link isn’t available. Ask your contractor for a fresh one.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tokenFrom(raw: string) {
  const token = normalizeShareToken(raw);
  return isApplicationToken(token) ? token : "";
}

async function readBody(request: Request) {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

/**
 * The homeowner's page. Without `?zip=` (or with the wrong one) only the intro comes back;
 * the answers open once the ZIP matches the job site.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = tokenFrom(token);
  if (!trimmed || !isSupabaseConfigured()) return shareJson({ error: NOT_FOUND }, 404);
  const zip = normalizeZip(new URL(request.url).searchParams.get("zip") ?? "");
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("shared_pay_at_close_application", { p_token: trimmed, p_zip: zip || null });
    if (error) {
      console.error("[share] shared_pay_at_close_application", error.code, error.message);
      return shareJson({ error: NOT_FOUND }, 404);
    }
    const payload = parseSharedApplication(data);
    if (!payload) return shareJson({ error: NOT_FOUND }, 404);
    return shareJson(payload);
  } catch (error) {
    console.error("[share] shared_pay_at_close_application threw", error);
    return shareJson({ error: NOT_FOUND }, 404);
  }
}

/** Save as the homeowner goes. Nothing is stamped. */
export async function PUT(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = tokenFrom(token);
  if (!trimmed || !isSupabaseConfigured()) return shareJson({ error: NOT_FOUND }, 404);
  const body = await readBody(request);
  if (!body) return shareJson({ error: "Could not read the answers." }, 400);
  const zip = normalizeZip(typeof body.zip === "string" ? body.zip : "");

  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("save_pay_at_close_application", {
      p_token: trimmed,
      p_zip: zip,
      p_answers: parseInterviewValues(body.answers),
      p_fields: parseFieldValues(body.fields) as never,
    });
    if (error) {
      console.error("[share] save_pay_at_close_application", error.code, error.message);
      return shareJson({ error: "Could not save. Try again in a moment." }, 500);
    }
    if (!isRecord(data) || data.ok !== true) {
      const message = isRecord(data) && typeof data.error === "string" ? data.error : "Could not save.";
      return shareJson(
        { error: message, submitted: isRecord(data) && data.submitted === true, expired: isRecord(data) && data.expired === true, locked: isRecord(data) && data.locked === true },
        409,
      );
    }
    return shareJson({ ok: true, savedAt: typeof data.savedAt === "string" ? data.savedAt : new Date().toISOString() });
  } catch (error) {
    console.error("[share] save_pay_at_close_application threw", error);
    return shareJson({ error: "Could not save. Try again in a moment." }, 500);
  }
}

/** The homeowner taps Send. */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = tokenFrom(token);
  if (!trimmed || !isSupabaseConfigured()) return shareJson({ error: NOT_FOUND }, 404);
  const body = await readBody(request);
  if (!body) return shareJson({ error: "Could not read the answers." }, 400);
  const zip = normalizeZip(typeof body.zip === "string" ? body.zip : "");

  const knownIds = new Set(APPLICATION_AUTHORIZATIONS.map((item) => item.id));
  const authorizations = Array.isArray(body.authorizations)
    ? body.authorizations.filter((item): item is string => typeof item === "string" && knownIds.has(item))
    : [];

  const audit = requestAudit(request.headers);
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("submit_pay_at_close_application", {
      p_token: trimmed,
      p_zip: zip,
      p_answers: parseInterviewValues(body.answers),
      p_fields: parseFieldValues(body.fields) as never,
      p_authorizations: authorizations,
      p_ip: audit.ipAddress,
      p_user_agent: audit.userAgent,
    });
    if (error) {
      console.error("[share] submit_pay_at_close_application", error.code, error.message);
      return shareJson({ error: "Could not send your answers. Try again in a moment." }, 500);
    }
    if (!isRecord(data) || data.ok !== true) {
      const message = isRecord(data) && typeof data.error === "string" ? data.error : "Could not send your answers.";
      return shareJson(
        { error: message, submitted: isRecord(data) && data.submitted === true, expired: isRecord(data) && data.expired === true, locked: isRecord(data) && data.locked === true },
        409,
      );
    }
    return shareJson({ ok: true, submittedAt: typeof data.submittedAt === "string" ? data.submittedAt : new Date().toISOString() });
  } catch (error) {
    console.error("[share] submit_pay_at_close_application threw", error);
    return shareJson({ error: "Could not send your answers. Try again in a moment." }, 500);
  }
}
