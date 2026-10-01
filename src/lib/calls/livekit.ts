import { AccessToken, LiveKitAPI, type SipDispatchRuleIndividual } from "livekit-server-sdk";
import { SIPMediaEncryption, SIPTransport } from "@livekit/protocol";
import { toE164 } from "../phone.ts";

export const PHOTON_SIP_HOST = "sip.spectrum.photon.codes";
export const PHOTON_SIP_TLS_PORT = 5061;

export type LiveKitEnv = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

export function liveKitEnv(): LiveKitEnv | null {
  const url = (process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || "").trim();
  const apiKey = (process.env.LIVEKIT_API_KEY || "").trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET || "").trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export function liveKitConfigured() {
  return liveKitEnv() != null;
}

export function createLiveKitApi(env: LiveKitEnv = liveKitEnv()!) {
  if (!env) throw new Error("LiveKit is not configured.");
  return new LiveKitAPI({
    host: env.url,
    apiKey: env.apiKey,
    secret: env.apiSecret,
  });
}

export function callRoomName(companyId: string, callId: string) {
  return `call_${companyId.replace(/-/g, "")}_${callId.replace(/-/g, "")}`;
}

export function softphoneIdentity(staffId: string) {
  return `staff_${staffId}`;
}

export function cellLegIdentity(staffId: string, legId: string) {
  return `cell_${staffId}_${legId.replace(/-/g, "").slice(0, 12)}`;
}

export function pstnIdentity(sessionId: string) {
  return `pstn_${sessionId.replace(/-/g, "").slice(0, 16)}`;
}

export async function mintSoftphoneToken(options: {
  roomName: string;
  staffId: string;
  staffName?: string;
  canPublish?: boolean;
  ttlSeconds?: number;
}) {
  const env = liveKitEnv();
  if (!env) throw new Error("LiveKit is not configured.");
  const at = new AccessToken(env.apiKey, env.apiSecret, {
    identity: softphoneIdentity(options.staffId),
    name: options.staffName || "Softphone",
    ttl: `${options.ttlSeconds ?? 60 * 60}s`,
  });
  at.addGrant({
    roomJoin: true,
    room: options.roomName,
    canPublish: options.canPublish !== false,
    canSubscribe: true,
    canPublishData: true,
  });
  return {
    token: await at.toJwt(),
    url: env.url,
    identity: softphoneIdentity(options.staffId),
  };
}

/** Photon uses RTP (not SRTP). Prefer DISABLE so media can negotiate. */
export async function ensurePhotonOutboundTrunk(options: {
  name: string;
  officeLine: string;
  projectId: string;
  projectSecret: string;
  existingTrunkId?: string;
}) {
  const api = createLiveKitApi();
  const number = toE164(options.officeLine);
  if (!number) throw new Error("Set the office calling line in E.164 first.");

  if (options.existingTrunkId) {
    const trunks = await api.sip.listSipOutboundTrunk({
      trunkIds: [options.existingTrunkId],
    });
    if (trunks[0]) return trunks[0];
  }

  return api.sip.createSipOutboundTrunk(
    options.name,
    `${PHOTON_SIP_HOST}:${PHOTON_SIP_TLS_PORT}`,
    [number],
    {
      transport: SIPTransport.SIP_TRANSPORT_TLS,
      authUsername: options.projectId,
      authPassword: options.projectSecret,
      metadata: JSON.stringify({ provider: "photon", officeLine: number }),
      mediaEncryption: SIPMediaEncryption.SIP_MEDIA_ENCRYPT_DISABLE,
    },
  );
}

export async function ensurePhotonInboundTrunk(options: {
  name: string;
  officeLine: string;
  existingTrunkId?: string;
}) {
  const api = createLiveKitApi();
  const number = toE164(options.officeLine);
  if (!number) throw new Error("Set the office calling line in E.164 first.");

  if (options.existingTrunkId) {
    const trunks = await api.sip.listSipInboundTrunk({
      trunkIds: [options.existingTrunkId],
    });
    if (trunks[0]) return trunks[0];
  }

  return api.sip.createSipInboundTrunk(options.name, [number], {
    metadata: JSON.stringify({ provider: "photon", officeLine: number }),
    mediaEncryption: SIPMediaEncryption.SIP_MEDIA_ENCRYPT_DISABLE,
    krispEnabled: true,
  });
}

export async function ensureInboundDispatchRule(options: {
  name: string;
  trunkId: string;
  roomPrefix: string;
  existingRuleId?: string;
}) {
  const api = createLiveKitApi();
  if (options.existingRuleId) {
    const rules = await api.sip.listSipDispatchRule({
      dispatchRuleIds: [options.existingRuleId],
    });
    if (rules[0]) return rules[0];
  }

  const rule: SipDispatchRuleIndividual = {
    type: "individual",
    roomPrefix: options.roomPrefix,
  };
  return api.sip.createSipDispatchRule(rule, {
    name: options.name,
    trunkIds: [options.trunkId],
    metadata: JSON.stringify({ provider: "photon" }),
  });
}

export async function dialSipParticipant(options: {
  trunkId: string;
  toNumber: string;
  roomName: string;
  fromNumber?: string;
  participantIdentity: string;
  participantName?: string;
  waitUntilAnswered?: boolean;
  ringingTimeout?: number;
  playDialtone?: boolean;
}) {
  const api = createLiveKitApi();
  const to = toE164(options.toNumber);
  if (!to) throw new Error("Enter a valid phone number to dial.");
  return api.sip.createSipParticipant(options.trunkId, to, options.roomName, {
    fromNumber: options.fromNumber ? toE164(options.fromNumber) || undefined : undefined,
    participantIdentity: options.participantIdentity,
    participantName: options.participantName || to,
    waitUntilAnswered: options.waitUntilAnswered,
    ringingTimeout: options.ringingTimeout,
    playDialtone: options.playDialtone,
  });
}

export async function transferSipParticipant(options: {
  roomName: string;
  participantIdentity: string;
  transferTo: string;
  playDialtone?: boolean;
}) {
  const api = createLiveKitApi();
  const target = options.transferTo.startsWith("sip:") || options.transferTo.startsWith("tel:")
    ? options.transferTo
    : `tel:${toE164(options.transferTo)}`;
  if (target === "tel:") throw new Error("Enter a valid transfer number.");
  await api.sip.transferSipParticipant(
    options.roomName,
    options.participantIdentity,
    target,
    { playDialtone: options.playDialtone ?? false },
  );
}

export async function removeParticipant(roomName: string, identity: string) {
  const api = createLiveKitApi();
  try {
    await api.room.removeParticipant(roomName, identity);
  } catch {
    // Already gone.
  }
}

export async function deleteRoom(roomName: string) {
  const api = createLiveKitApi();
  try {
    await api.room.deleteRoom(roomName);
  } catch {
    // Already gone.
  }
}

export function liveKitSipUriHint() {
  const env = liveKitEnv();
  if (!env) return "sips:<extension>@<your-livekit-sip-host>:5061";
  try {
    const host = new URL(env.url).hostname.replace(".livekit.cloud", ".sip.livekit.cloud");
    return `sips:truss@${host}:5061`;
  } catch {
    return "sips:truss@<project>.sip.livekit.cloud:5061";
  }
}
