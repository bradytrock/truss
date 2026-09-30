import type { SupabaseClient } from "@supabase/supabase-js";
import { toE164 } from "@/lib/phone";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
export type PhotonConnectionRow = Database["public"]["Tables"]["photon_connections"]["Row"];

export type PhotonAccount = {
  companyId: string;
  projectId: string;
  projectSecret: string;
  fromNumber: string;
};

export function randomPhotonWebhookToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function photonWebhookUrl(origin: string, token: string) {
  const base = origin.replace(/\/$/, "");
  if (!base || !token) return "";
  return `${base}/api/messages/inbound?token=${encodeURIComponent(token)}`;
}

export function photonAccountFromRow(row: PhotonConnectionRow | null): PhotonAccount | null {
  if (!row?.linked) return null;
  const projectId = row.project_id.trim();
  const projectSecret = row.project_secret.trim();
  const fromNumber = toE164(row.from_number);
  if (!projectId || !projectSecret || !fromNumber) return null;
  return { companyId: row.company_id, projectId, projectSecret, fromNumber };
}

export function publicPhotonStatus(row: PhotonConnectionRow | null, origin: string) {
  const account = photonAccountFromRow(row);
  const fromNumber = account?.fromNumber ?? "";
  return {
    linked: Boolean(account),
    projectId: row?.project_id.trim() ?? "",
    fromNumber,
    fromLabel: fromNumber ? `ending ${fromNumber.slice(-4)}` : "",
    hasProjectSecret: Boolean(row?.project_secret.trim()),
    hasWebhookSecret: Boolean(row?.webhook_secret.trim()),
    webhookUrl: row?.webhook_token ? photonWebhookUrl(origin, row.webhook_token) : "",
    linkedAt: row?.linked_at ?? null,
    linkedBy: row?.linked_by ?? "",
  };
}

export async function loadPhotonConnection(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("photon_connections")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return { error, row: null as PhotonConnectionRow | null };
  return { error: null, row: data };
}

export async function registerSpectrumWebhook(input: {
  projectId: string;
  projectSecret: string;
  webhookUrl: string;
}) {
  const response = await fetch(
    `https://spectrum.photon.codes/projects/${encodeURIComponent(input.projectId)}/webhooks/`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${input.projectId}:${input.projectSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ webhookUrl: input.webhookUrl }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  const data =
    payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : payload;
  const signingSecret = typeof data.signingSecret === "string" ? data.signingSecret.trim() : "";
  const id = typeof data.id === "string" ? data.id.trim() : "";
  if (!response.ok || payload.succeed === false || !signingSecret) {
    const message =
      (typeof payload.message === "string" && payload.message) ||
      (typeof data.message === "string" && data.message) ||
      `Photon could not register the webhook (${response.status}).`;
    return { ok: false as const, error: message, id: "", signingSecret: "" };
  }
  return { ok: true as const, error: "", id, signingSecret };
}
