import { NextResponse } from "next/server";
import {
  browserTimeZone,
  ESIGN_CONSENT_TEXT,
  ESIGN_CONSENT_VERSION,
  estimateDocumentSnapshot,
  hashEstimateDocument,
  hashShareToken,
  isSignatureEventKind,
  parseSignatureEventRole,
  tokenSuffix,
} from "@/lib/estimate-signature-audit";
import { requestAudit } from "@/lib/request-audit";
import { createClient } from "@/lib/supabase/server";
import { isMissingSignatureAudit, looksLikeUuid, missingSignatureAuditMessage } from "@/lib/supabase/schema-errors";
import { fillEstimate, fillEstimateLine, linesForEstimate } from "@/lib/estimate-totals";
import { mapEstimate, mapEstimateLine } from "@/lib/supabase/mappers";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const estimateId = typeof body?.estimateId === "string" ? body.estimateId.trim() : "";
  const kindRaw = typeof body?.kind === "string" ? body.kind.trim() : "";
  if (!estimateId || !isSignatureEventKind(kindRaw)) {
    return NextResponse.json({ error: "Missing signature event." }, { status: 400 });
  }
  if (kindRaw === "signed") {
    const consented = body?.consented === true;
    const consentText =
      typeof body?.consentText === "string" && body.consentText.trim()
        ? body.consentText.trim()
        : ESIGN_CONSENT_TEXT;
    if (!consented) {
      return NextResponse.json({ error: "The signer must agree to sign electronically." }, { status: 400 });
    }
    body.consentText = consentText;
    body.consentVersion = typeof body.consentVersion === "string" ? body.consentVersion : ESIGN_CONSENT_VERSION;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to record that signature." }, { status: 401 });
  }

  const { data: estimateRow, error: estimateError } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", estimateId)
    .maybeSingle();
  if (estimateError || !estimateRow) {
    return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
  }

  const { data: lineRows } = await supabase.from("estimate_lines").select("*").eq("estimate_id", estimateId);
  const estimate = fillEstimate(mapEstimate(estimateRow));
  const lines = (lineRows ?? []).map(mapEstimateLine).map(fillEstimateLine);
  const snapshot = estimateDocumentSnapshot(estimate, linesForEstimate(lines, estimateId));
  const documentSha256 =
    typeof body?.documentSha256 === "string" && body.documentSha256.trim()
      ? body.documentSha256.trim()
      : await hashEstimateDocument(snapshot);

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const audit = requestAudit(request.headers);
  const timeZone =
    typeof body?.timeZone === "string" && body.timeZone.trim() ? body.timeZone.trim() : browserTimeZone();

  const { data, error } = await supabase
    .from("estimate_signature_events")
    .insert({
      company_id: estimateRow.company_id,
      estimate_id: estimateId,
      kind: kindRaw,
      signer_role: parseSignatureEventRole(typeof body?.signerRole === "string" ? body.signerRole : ""),
      contact_id:
        typeof body?.contactId === "string" && looksLikeUuid(body.contactId) ? body.contactId.trim() : null,
      signer_name: typeof body?.signerName === "string" ? body.signerName.trim() : "",
      token_suffix: token ? tokenSuffix(token) : "",
      token_sha256: token ? await hashShareToken(token) : "",
      ip_address: audit.ipAddress,
      forwarded_for: audit.forwardedFor,
      user_agent: audit.userAgent,
      accept_language: audit.acceptLanguage,
      time_zone: timeZone.slice(0, 80),
      delivery_channel: typeof body?.deliveryChannel === "string" ? body.deliveryChannel.slice(0, 40) : "",
      delivery_to: typeof body?.deliveryTo === "string" ? body.deliveryTo.slice(0, 80) : "",
      consent_text: typeof body?.consentText === "string" ? body.consentText : "",
      consent_version: typeof body?.consentVersion === "string" ? body.consentVersion.slice(0, 40) : "",
      document_sha256: documentSha256,
      document_snapshot: snapshot as unknown as Json,
      captured_in_office: body?.capturedInOffice === true,
      staff_id:
        typeof body?.staffId === "string" && looksLikeUuid(body.staffId)
          ? body.staffId.trim()
          : looksLikeUuid(user.id)
            ? user.id
            : null,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingSignatureAudit(error)) {
      return NextResponse.json({ ok: false, warning: missingSignatureAuditMessage() }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data?.id, documentSha256 });
}
