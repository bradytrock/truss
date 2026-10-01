import { liveKitConfigured, liveKitEnv, liveKitSipUriHint } from "./livekit.ts";

export function callingHostStatus() {
  const env = liveKitEnv();
  return {
    livekitConfigured: liveKitConfigured(),
    livekitUrl: env?.url ?? "",
    photonSipHost: "sip.spectrum.photon.codes",
    photonSipPort: 5061,
    inboundSipUriHint: liveKitSipUriHint(),
  };
}

export function callingWebhookUrl(origin: string, token: string) {
  const base = origin.replace(/\/$/, "");
  const value = token.trim();
  if (!base || !value || value.includes("{") || value.includes("}")) return "";
  return `${base}/api/calls/webhook/${encodeURIComponent(value)}`;
}
