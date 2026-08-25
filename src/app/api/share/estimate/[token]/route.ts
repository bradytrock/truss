import { parseEstimateSignature } from "@/lib/estimate-signature";
import { normalizeShareToken } from "@/lib/share";
import { shareJson, shareNotFoundJson } from "@/lib/share-server";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  isMissingSignatureColumn,
  missingSignatureMessage,
  isAmbiguousSignJobId,
  ambiguousSignJobIdMessage,
  isMissingSignerLinks,
  missingSignerLinksMessage,
} from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6) {
    return shareNotFoundJson(trimmed);
  }
  if (!isSupabaseConfigured()) {
    return shareNotFoundJson(trimmed);
  }
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("shared_estimate", { p_token: trimmed });
    if (error) {
      console.error("[share] shared_estimate", error.code, error.message);
      return shareNotFoundJson(trimmed);
    }
    if (data == null) {
      return shareNotFoundJson(trimmed);
    }
    return shareJson(data);
  } catch (error) {
    console.error("[share] shared_estimate threw", error);
    return shareNotFoundJson(trimmed);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6) {
    return shareNotFoundJson(trimmed);
  }
  if (!isSupabaseConfigured()) {
    return shareNotFoundJson(trimmed);
  }
  const body = (await request.json().catch(() => null)) as
    | { lineId?: string; selected?: boolean }
    | null;
  const lineId = typeof body?.lineId === "string" ? body.lineId.trim() : "";
  if (!lineId) {
    return shareJson({ error: "Pick an optional line to include." }, 400);
  }
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("select_shared_estimate_line", {
      p_token: trimmed,
      p_line_id: lineId,
      p_selected: Boolean(body?.selected),
    });
    if (error) {
      if (isMissingSignerLinks(error) || /select_shared_estimate_line/i.test(error.message ?? "")) {
        return shareJson({ error: missingSignerLinksMessage() }, 400);
      }
      return shareJson({ error: error.message }, 400);
    }
    if (data == null) {
      return shareNotFoundJson(trimmed);
    }
    return shareJson(data);
  } catch {
    return shareNotFoundJson(trimmed);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6) {
    return shareNotFoundJson(trimmed);
  }
  if (!isSupabaseConfigured()) {
    return shareNotFoundJson(trimmed);
  }
  const body = (await request.json().catch(() => null)) as
    | { signerName?: string; name?: string; signature?: string; image?: string }
    | null;
  const parsed = parseEstimateSignature({
    name: body?.signerName ?? body?.name,
    image: body?.signature ?? body?.image,
  });
  if (!parsed.ok) {
    return shareJson({ error: parsed.error }, 400);
  }
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("sign_shared_estimate", {
      p_token: trimmed,
      p_signer_name: parsed.signature.name,
      p_signature: parsed.signature.image,
    });
    if (error) {
      if (isMissingSignatureColumn(error)) {
        return shareJson({ error: missingSignatureMessage() }, 400);
      }
      if (isAmbiguousSignJobId(error)) {
        return shareJson({ error: ambiguousSignJobIdMessage() }, 400);
      }
      if (isMissingSignerLinks(error)) {
        return shareJson({ error: missingSignerLinksMessage() }, 400);
      }
      return shareJson({ error: error.message }, 400);
    }
    if (data == null) {
      return shareNotFoundJson(trimmed);
    }
    return shareJson(data);
  } catch {
    return shareNotFoundJson(trimmed);
  }
}
