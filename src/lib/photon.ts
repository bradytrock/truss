/** Stable Photon Spectrum. Project id and secret come from the project settings on app.photon.codes. */

export const PHOTON_NOT_CONNECTED =
  "Photon is not connected for this company. The text is logged on the job. Add this office's Photon project under Settings → Photon.";

const PROJECT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikePhotonProjectId(value: string) {
  return PROJECT_ID.test(value.trim());
}

export function looksLikePhotonProjectSecret(value: string) {
  const secret = value.trim();
  if (secret.length < 8 || secret.length > 512) return false;
  if (/\s/.test(secret)) return false;
  return true;
}

export function photonSecretHint(value: string) {
  const secret = value.trim();
  if (secret.length < 4) return "";
  return secret.slice(-4);
}

/** One inbound URL per office. The token is the company, not an app-wide secret. */
export function photonWebhookUrl(origin: string, token: string) {
  const base = origin.trim().replace(/\/+$/, "");
  const webhookToken = token.trim();
  if (!base || webhookToken.length < 24) return "";
  return `${base}/api/messages/inbound/${encodeURIComponent(webhookToken)}`;
}

export function photonNotSetupMessage(companyName: string) {
  const name = companyName.trim() || "this company";
  return `Photon is not set up for ${name}.`;
}

/** Supabase SQL editor runs the buffer as SQL. A chat title is not a statement. */
export function isSqlScript(value: string) {
  const line = value.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!line) return false;
  if (/^new chat$/i.test(line)) return false;
  return true;
}
