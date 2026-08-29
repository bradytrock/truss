import { parseEstimateSignature } from "@/lib/estimate-signature";
import { normalizeShareToken } from "@/lib/share";
import { loadShareAudit, recordShareEvent } from "@/lib/share-estimate-audit";
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
import {
  ESIGN_CONSENT_TEXT,
  ESIGN_CONSENT_VERSION,
  estimateDocumentSnapshot,
  hashEstimateDocument,
} from "@/lib/estimate-signature-audit";
import { fillEstimateLine } from "@/lib/estimate-totals";
import { parseSharedEstimate } from "@/lib/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function payloadWithAudit(token: string, data: unknown) {
  const events = await loadShareAudit(token);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...(data as Record<string, unknown>), signatureEvents: events };
  }
  return data;
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
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
    await recordShareEvent(trimmed, request.headers, { kind: "opened" });
    return shareJson(await payloadWithAudit(trimmed, data));
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
    | {
        signerName?: string;
        name?: string;
        signature?: string;
        image?: string;
        consented?: boolean;
        consentText?: string;
        timeZone?: string;
      }
    | null;
  if (body?.consented !== true) {
    return shareJson({ error: "Agree to sign this proposal electronically, then try again." }, 400);
  }
  const parsed = parseEstimateSignature({
    name: body?.signerName ?? body?.name,
    image: body?.signature ?? body?.image,
  });
  if (!parsed.ok) {
    return shareJson({ error: parsed.error }, 400);
  }
  try {
    const supabase = createAnonClient();
    const before = await supabase.rpc("shared_estimate", { p_token: trimmed });
    const shared = parseSharedEstimate(before.data);
    const snapshot = shared
      ? estimateDocumentSnapshot(
          {
            ...shared.estimate,
            notes: shared.estimate.notes,
          },
          shared.lines.map((line) => fillEstimateLine(line)),
        )
      : null;
    const documentSha256 = snapshot ? await hashEstimateDocument(snapshot) : "";
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
    await recordShareEvent(trimmed, request.headers, {
      kind: "signed",
      signerName: parsed.signature.name,
      consentText: typeof body.consentText === "string" && body.consentText.trim() ? body.consentText : ESIGN_CONSENT_TEXT,
      consentVersion: ESIGN_CONSENT_VERSION,
      documentSha256,
      documentSnapshot: snapshot ?? undefined,
      timeZone: typeof body.timeZone === "string" ? body.timeZone : "",
    });
    return shareJson(await payloadWithAudit(trimmed, data));
  } catch {
    return shareNotFoundJson(trimmed);
  }
}
