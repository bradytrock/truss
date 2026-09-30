export {
  SPECTRUM_SIGNATURE_TOLERANCE_SEC,
  authorizeInboundWebhook,
  parseInboundText,
  verifySpectrumSignature,
} from "../../supabase/functions/_shared/photon-webhook";

export type { ParsedInboundText } from "../../supabase/functions/_shared/photon-webhook";
