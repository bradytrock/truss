export const ESTIMATE_SIGNATURE_SQL = "supabase/migrations/20260821200000_estimate_signature.sql";
export const ESTIMATE_SIGNATURE_SQL_RAW =
  "https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821200000_estimate_signature.sql";

export const SIGNATURE_MAX_CHARS = 180_000;

export type EstimateSignature = {
  name: string;
  image: string;
};

export function isSignaturePng(value: string | null | undefined) {
  if (!value) return false;
  return (
    value.startsWith("data:image/png;base64,") &&
    value.length >= 100 &&
    value.length <= SIGNATURE_MAX_CHARS
  );
}

export function hasEstimateSignature(estimate: { signatureImage?: string | null }) {
  return isSignaturePng(estimate.signatureImage);
}

export function parseEstimateSignature(input: { name?: string; image?: string } | null | undefined):
  | { ok: true; signature: EstimateSignature }
  | { ok: false; error: string } {
  const name = input?.name?.trim() ?? "";
  const image = input?.image?.trim() ?? "";
  if (name.length < 2) return { ok: false, error: "Type the name that should print under the signature." };
  if (!isSignaturePng(image)) return { ok: false, error: "Draw a signature on the pad." };
  return { ok: true, signature: { name, image } };
}
