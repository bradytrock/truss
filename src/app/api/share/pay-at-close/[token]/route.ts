import { APPLICATION_AUTHORIZATIONS, applicationAuthorizationsComplete } from "@/lib/pay-at-close";
import { parseFieldValues, parseInterviewValues, parseSharedApplication } from "@/lib/pay-at-close-application";
import { requestAudit } from "@/lib/request-audit";
import { normalizeShareToken } from "@/lib/share";
import { shareJson } from "@/lib/share-server";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = "This application link isn’t available. Ask your contractor for a fresh one.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 16 || !isSupabaseConfigured()) return shareJson({ error: NOT_FOUND }, 404);
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("shared_pay_at_close_application", { p_token: trimmed });
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

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 16 || !isSupabaseConfigured()) return shareJson({ error: NOT_FOUND }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return shareJson({ error: "Could not read the application." }, 400);
  }
  if (!isRecord(body)) return shareJson({ error: "Could not read the application." }, 400);

  const signatureName = typeof body.signatureName === "string" ? body.signatureName.trim() : "";
  const signatureImage = typeof body.signatureImage === "string" ? body.signatureImage : "";
  const authorizations = Array.isArray(body.authorizations)
    ? body.authorizations.filter((item): item is string => typeof item === "string")
    : [];
  if (!signatureName) return shareJson({ error: "Type your full name to sign." }, 400);
  if (!signatureImage.startsWith("data:image/") || signatureImage.length > 400_000) {
    return shareJson({ error: "Draw your signature to sign." }, 400);
  }
  if (!applicationAuthorizationsComplete(authorizations)) {
    return shareJson({ error: "Check each of the four authorizations to submit." }, 400);
  }
  const knownIds = new Set(APPLICATION_AUTHORIZATIONS.map((item) => item.id));
  const checked = authorizations.filter((id) => knownIds.has(id));

  const audit = requestAudit(request.headers);
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("submit_pay_at_close_application", {
      p_token: trimmed,
      p_answers: parseInterviewValues(body.answers),
      p_fields: parseFieldValues(body.fields) as never,
      p_signature_name: signatureName,
      p_signature_image: signatureImage,
      p_authorizations: checked,
      p_ip: audit.ipAddress,
      p_user_agent: audit.userAgent,
    });
    if (error) {
      console.error("[share] submit_pay_at_close_application", error.code, error.message);
      return shareJson({ error: "Could not save the application. Try again in a moment." }, 500);
    }
    if (!isRecord(data) || data.ok !== true) {
      const message = isRecord(data) && typeof data.error === "string" ? data.error : "Could not save the application.";
      return shareJson({ error: message, submitted: isRecord(data) && data.submitted === true }, 409);
    }
    return shareJson({ ok: true, submittedAt: typeof data.submittedAt === "string" ? data.submittedAt : new Date().toISOString() });
  } catch (error) {
    console.error("[share] submit_pay_at_close_application threw", error);
    return shareJson({ error: "Could not save the application. Try again in a moment." }, 500);
  }
}
