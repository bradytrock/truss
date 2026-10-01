import { liveKitConfigured, liveKitEnv, liveKitSipUriHint } from "@/lib/calls/livekit";

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
  if (!token) return `${base}/api/calls/webhook/{token}`;
  return `${base}/api/calls/webhook/${token}`;
}
