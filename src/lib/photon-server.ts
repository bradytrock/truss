import { imessageEffectId, imessageTapbackVerb } from "@/lib/imessage";
import { toE164 } from "@/lib/phone";
import {
  looksLikePhotonProjectId,
  looksLikePhotonProjectSecret,
  photonImessageLinePhone,
  photonSecretHint,
} from "@/lib/photon";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";

const SPECTRUM_PROJECT_URL = "https://spectrum.photon.codes/projects";

export type PhotonSendResult =
  | { ok: true; mocked: boolean; to: string; handle: string }
  | { ok: false; mocked: false; error: string };

type PhotonCredentials = {
  projectId: string;
  projectSecret: string;
  projectName: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function credentialsFrom(payload: unknown): PhotonCredentials | null {
  const row = asRecord(payload);
  if (!row || row.configured !== true) return null;
  const projectId = typeof row.projectId === "string" ? row.projectId.trim() : "";
  const projectSecret = typeof row.projectSecret === "string" ? row.projectSecret.trim() : "";
  if (!looksLikePhotonProjectId(projectId) || !projectSecret) return null;
  return {
    projectId,
    projectSecret,
    projectName: typeof row.projectName === "string" ? row.projectName.trim() : "",
  };
}

export async function verifyPhotonProject(projectId: string, projectSecret: string) {
  const id = projectId.trim();
  const secret = projectSecret.trim();
  if (!looksLikePhotonProjectId(id)) {
    return {
      ok: false as const,
      error: "Paste the Photon project id. It is the UUID on that project's settings page.",
    };
  }
  if (!looksLikePhotonProjectSecret(secret)) {
    return {
      ok: false as const,
      error: "Paste the Photon project secret from that project's settings.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${SPECTRUM_PROJECT_URL}/${id}/`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      },
    });
  } catch {
    return { ok: false as const, error: "Could not reach Photon." };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const body = asRecord(payload);
  if (!response.ok || body?.succeed === false) {
    const message =
      (typeof body?.message === "string" && body.message) ||
      (response.status === 401
        ? "Photon rejected that project id or secret."
        : `Photon returned ${response.status}.`);
    return { ok: false as const, error: message };
  }
  const data = asRecord(body?.data);
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  return {
    ok: true as const,
    projectId: id,
    projectName: name,
    secretHint: photonSecretHint(secret),
  };
}

export async function fetchPhotonImessageLine(projectId: string, projectSecret: string) {
  const id = projectId.trim();
  const secret = projectSecret.trim();
  if (!looksLikePhotonProjectId(id) || !secret) return "";
  try {
    const response = await fetch(`${SPECTRUM_PROJECT_URL}/${id}/lines/?platform=imessage`, {
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
    });
    if (!response.ok) return "";
    return photonImessageLinePhone(await response.json());
  } catch {
    return "";
  }
}

/** Store this office's Photon line so website texts open that number. */
export async function syncOfficePhotonLine() {
  const credentials = await loadOfficeCredentials();
  if (!credentials) return "";
  const phone = await fetchPhotonImessageLine(credentials.projectId, credentials.projectSecret);
  if (!phone) return "";
  try {
    const supabase = await createClient();
    await supabase.rpc("photon_company_set_line", { p_phone: phone });
  } catch {
    return phone;
  }
  return phone;
}

async function loadOfficeCredentials(): Promise<PhotonCredentials | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("photon_outbound_config");
    if (error || !data) return null;
    return credentialsFrom(data);
  } catch {
    return null;
  }
}

async function loadVoiceCredentials(token: string): Promise<PhotonCredentials | null> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("photon_outbound_for_voice", { p_token: token });
  if (error || !data) return null;
  return credentialsFrom(data);
}

type SpectrumSpace = {
  send: (input: unknown) => Promise<unknown>;
};

function sentHandle(sent: unknown) {
  return sent && typeof sent === "object" && "id" in sent && typeof sent.id === "string" ? sent.id : "";
}

function photonError(error: unknown) {
  return error instanceof Error ? error.message : "Could not reach Photon.";
}

function textTargets(to: string | string[]) {
  const raw = Array.isArray(to) ? to : [to];
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const value of raw) {
    const phone = toE164(value);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    phones.push(phone);
  }
  return phones;
}

async function withSpace<T>(
  credentials: PhotonCredentials,
  to: string | string[],
  run: (space: SpectrumSpace) => Promise<T>,
) {
  const phones = textTargets(to);
  if (phones.length === 0) throw new Error("That phone number is not valid.");
  const { Spectrum } = await import("@spectrum-ts/core");
  const { imessage } = await import("@spectrum-ts/imessage");
  const app = await Spectrum({
    projectId: credentials.projectId,
    projectSecret: credentials.projectSecret,
    providers: [imessage.config()],
  });
  try {
    const platform = imessage(app);
    const people = await Promise.all(phones.map((phone) => platform.user(phone)));
    const space = await platform.space.create(people.length === 1 ? people[0] : people);
    return await run(space as SpectrumSpace);
  } finally {
    await app.stop().catch(() => undefined);
  }
}

async function loadCredentials(voiceToken?: string) {
  const token = voiceToken?.trim() ?? "";
  return token ? loadVoiceCredentials(token) : loadOfficeCredentials();
}

/** Photon only needs the message id. Unsends must be marked outbound; a refetched message is treated as inbound and rejected. */
function phoneMessage(handle: string, direction: "inbound" | "outbound") {
  return { id: handle, direction, content: { type: "text" as const, text: "" } };
}

async function outboundPayload(input: { content: string; effectId: string; replyToHandle: string }) {
  const { reply } = await import("@spectrum-ts/core");
  let payload: unknown = input.content;
  if (input.effectId) {
    const mod = (await import("@spectrum-ts/imessage")) as unknown as {
      effect: (body: string, messageEffect: string) => unknown;
    };
    payload = mod.effect(input.content, input.effectId);
  }
  if (input.replyToHandle) {
    payload = reply(payload as never, phoneMessage(input.replyToHandle, "inbound") as never);
  }
  return payload;
}

export async function sendOfficeText(input: {
  to: string | string[];
  content: string;
  effect?: string;
  replyToHandle?: string;
  voiceToken?: string;
}): Promise<PhotonSendResult> {
  const phones = textTargets(input.to);
  const content = input.content.trim();
  const requestedEffect = input.effect?.trim() ?? "";
  const effectId = requestedEffect ? imessageEffectId(requestedEffect) : "";
  const replyToHandle = input.replyToHandle?.trim() ?? "";
  const destination = phones.join(", ");
  if (phones.length === 0) return { ok: false, mocked: false, error: "That phone number is not valid." };
  if (!content) return { ok: false, mocked: false, error: "Write a message before sending." };
  if (requestedEffect && !effectId) return { ok: false, mocked: false, error: "That effect is not available." };

  const credentials = await loadCredentials(input.voiceToken);
  if (!credentials) {
    return { ok: true, mocked: true, to: destination, handle: `mock_${Date.now()}` };
  }

  try {
    return await withSpace(credentials, phones, async (space) => {
      const sent = await space.send(await outboundPayload({ content, effectId, replyToHandle }));
      return { ok: true as const, mocked: false as const, to: destination, handle: sentHandle(sent) };
    });
  } catch (error) {
    return { ok: false, mocked: false, error: photonError(error) };
  }
}

export async function sendOfficeReaction(input: {
  to: string;
  handle: string;
  emoji: string;
}): Promise<PhotonSendResult> {
  const to = toE164(input.to);
  const handle = input.handle.trim();
  const emoji = input.emoji.trim();
  if (!to) return { ok: false, mocked: false, error: "That phone number is not valid." };
  if (!handle) return { ok: false, mocked: false, error: "That message cannot be reacted to." };
  if (!imessageTapbackVerb(emoji)) return { ok: false, mocked: false, error: "That reaction is not an iMessage tapback." };

  const credentials = await loadCredentials();
  if (!credentials) {
    return { ok: true, mocked: true, to, handle: `mock_${Date.now()}` };
  }

  try {
    const { reaction } = await import("@spectrum-ts/core");
    return await withSpace(credentials, to, async (space) => {
      const sent = await space.send(reaction(emoji, phoneMessage(handle, "inbound") as never));
      return { ok: true as const, mocked: false as const, to, handle: sentHandle(sent) };
    });
  } catch (error) {
    return { ok: false, mocked: false, error: photonError(error) };
  }
}

export async function sendOfficeUnsend(input: { to: string; handle: string }): Promise<PhotonSendResult> {
  const to = toE164(input.to);
  const handle = input.handle.trim();
  if (!to) return { ok: false, mocked: false, error: "That phone number is not valid." };
  if (!handle) return { ok: false, mocked: false, error: "That message cannot be unsent." };

  const credentials = await loadCredentials();
  if (!credentials) {
    return { ok: true, mocked: true, to, handle };
  }

  try {
    const { unsend } = await import("@spectrum-ts/core");
    return await withSpace(credentials, to, async (space) => {
      await space.send(unsend(phoneMessage(handle, "outbound") as never));
      return { ok: true as const, mocked: false as const, to, handle };
    });
  } catch (error) {
    return { ok: false, mocked: false, error: photonError(error) };
  }
}

export async function officePhotonConfigured() {
  const credentials = await loadOfficeCredentials();
  return { configured: Boolean(credentials) };
}
