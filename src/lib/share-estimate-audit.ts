import { requestAudit } from "@/lib/request-audit";
import { createAnonClient } from "@/lib/supabase/anon";
import { isMissingSignatureAudit } from "@/lib/supabase/schema-errors";
import type { SignatureEventKind } from "@/lib/types";

export async function recordShareEvent(
  token: string,
  headers: Headers,
  input: {
    kind: SignatureEventKind;
    signerName?: string;
    consentText?: string;
    consentVersion?: string;
    documentSha256?: string;
    documentSnapshot?: Record<string, unknown>;
    timeZone?: string;
    deliveryChannel?: string;
    deliveryTo?: string;
  },
) {
  const audit = requestAudit(headers);
  try {
    const supabase = createAnonClient();
    const { error } = await supabase.rpc("record_estimate_share_event", {
      p_token: token,
      p_kind: input.kind,
      p_signer_name: input.signerName ?? "",
      p_consent_text: input.consentText ?? "",
      p_consent_version: input.consentVersion ?? "",
      p_document_sha256: input.documentSha256 ?? "",
      p_document_snapshot: (input.documentSnapshot ?? {}) as never,
      p_ip: audit.ipAddress,
      p_forwarded_for: audit.forwardedFor,
      p_user_agent: audit.userAgent,
      p_accept_language: audit.acceptLanguage,
      p_time_zone: input.timeZone ?? "",
      p_delivery_channel: input.deliveryChannel ?? "",
      p_delivery_to: input.deliveryTo ?? "",
    });
    if (error && !isMissingSignatureAudit(error)) {
      console.error("[share] record_estimate_share_event", error.code, error.message);
      return error;
    }
    return error ?? null;
  } catch (error) {
    console.error("[share] record_estimate_share_event threw", error);
    return { message: error instanceof Error ? error.message : "threw" };
  }
}
