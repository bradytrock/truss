import { toE164 } from "@/lib/phone";
import {
  looksLikePhotonProjectId,
  looksLikePhotonProjectSecret,
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

async function sendViaSpectrum(input: {
  projectId: string;
  projectSecret: string;
  to: string[];
  content: string;
}): Promise<PhotonSendResult> {
  const { Spectrum } = await import("@spectrum-ts/core");
  const { imessage } = await import("@spectrum-ts/imessage");
  const app = await Spectrum({
    projectId: input.projectId,
    projectSecret: input.projectSecret,
    providers: [imessage.config()],
  });
  try {
    const platform = imessage(app);
    const people = await Promise.all(input.to.map((phone) => platform.user(phone)));
    const space = await platform.space.create(people.length === 1 ? people[0] : people);
    const sent = await space.send(input.content);
    const handle = sent && typeof sent === "object" && "id" in sent && typeof sent.id === "string" ? sent.id : "";
    return { ok: true, mocked: false, to: input.to.join(", "), handle };
  } finally {
    await app.stop().catch(() => undefined);
  }
}

export async function sendOfficeText(input: {
  to: string | string[];
  content: string;
  voiceToken?: string;
}): Promise<PhotonSendResult> {
  const to = textTargets(input.to);
  const content = input.content.trim();
  if (to.length === 0) return { ok: false, mocked: false, error: "That phone number is not valid." };
  if (!content) return { ok: false, mocked: false, error: "Write a message before sending." };

  const voiceToken = input.voiceToken?.trim() ?? "";
  const credentials = voiceToken ? await loadVoiceCredentials(voiceToken) : await loadOfficeCredentials();
  if (!credentials) {
    return { ok: true, mocked: true, to: to.join(", "), handle: `mock_${Date.now()}` };
  }

  try {
    return await sendViaSpectrum({
      projectId: credentials.projectId,
      projectSecret: credentials.projectSecret,
      to,
      content,
    });
  } catch (error) {
    return {
      ok: false,
      mocked: false,
      error: error instanceof Error ? error.message : "Could not reach Photon.",
    };
  }
}

export async function officePhotonConfigured() {
  const credentials = await loadOfficeCredentials();
  return { configured: Boolean(credentials) };
}
