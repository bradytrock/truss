import { NextResponse } from "next/server";
import { parseEstimateSignature } from "@/lib/estimate-signature";
import { normalizeShareToken } from "@/lib/share";
import { shareNotFoundJson } from "@/lib/share-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  isMissingSignatureColumn,
  missingSignatureMessage,
  isAmbiguousSignJobId,
  ambiguousSignJobIdMessage,
  isMissingSignerLinks,
  missingSignerLinksMessage,
} from "@/lib/supabase/schema-errors";
import { createClient } from "@/lib/supabase/server";

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
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("shared_estimate", { p_token: trimmed });
    if (error || data == null) {
      return shareNotFoundJson(trimmed);
    }
    return NextResponse.json(data);
  } catch {
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
    return NextResponse.json({ error: "Pick an optional line to include." }, { status: 400 });
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("select_shared_estimate_line", {
      p_token: trimmed,
      p_line_id: lineId,
      p_selected: Boolean(body?.selected),
    });
    if (error) {
      if (isMissingSignerLinks(error) || /select_shared_estimate_line/i.test(error.message ?? "")) {
        return NextResponse.json({ error: missingSignerLinksMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (data == null) {
      return shareNotFoundJson(trimmed);
    }
    return NextResponse.json(data);
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
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("sign_shared_estimate", {
      p_token: trimmed,
      p_signer_name: parsed.signature.name,
      p_signature: parsed.signature.image,
    });
    if (error) {
      if (isMissingSignatureColumn(error)) {
        return NextResponse.json({ error: missingSignatureMessage() }, { status: 400 });
      }
      if (isAmbiguousSignJobId(error)) {
        return NextResponse.json({ error: ambiguousSignJobIdMessage() }, { status: 400 });
      }
      if (isMissingSignerLinks(error)) {
        return NextResponse.json({ error: missingSignerLinksMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (data == null) {
      return shareNotFoundJson(trimmed);
    }
    return NextResponse.json(data);
  } catch {
    return shareNotFoundJson(trimmed);
  }
}
