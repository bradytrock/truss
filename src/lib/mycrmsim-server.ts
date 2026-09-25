import {
  MYCRMSIM_SEND_URL,
  mycrmsimSendBody,
  normalizeMycrmsimChannel,
  type MycrmsimChannel,
  type TextSendResult,
} from "@/lib/mycrmsim";
import { toE164 } from "@/lib/phone";
import { createAnonClient } from "@/lib/supabase/anon";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

export type MycrmsimConfig = {
  locationId: string;
  channel: MycrmsimChannel;
  source: "company" | "host";
};

type ConfigPayload = {
  ok?: boolean;
  configured?: boolean;
  missing?: boolean;
  locationId?: string;
  channel?: string;
  userId?: string;
  error?: string;
};

function asConfig(data: unknown): ConfigPayload | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as ConfigPayload;
}

export async function postMycrmsimMessage(input: {
  locationId: string;
  userId: string;
  to: string;
  content: string;
  channel: MycrmsimChannel;
  attachments?: string[];
  messageId?: string;
}): Promise<TextSendResult> {
  const to = toE164(input.to);
  const content = input.content.trim();
  if (!to) return { ok: false, mocked: false, error: "That phone number is not valid." };
  if (!content) return { ok: false, mocked: false, error: "Write a message before sending." };
  if (!input.locationId.trim()) {
    return { ok: false, mocked: false, error: "myCRMSIM location id is missing." };
  }

  const messageId = input.messageId?.trim() || crypto.randomUUID();
  let response: Response;
  try {
    response = await fetch(MYCRMSIM_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mycrmsimSendBody({
          locationId: input.locationId.trim(),
          userId: input.userId,
          phone: to,
          message: content,
          messageId,
          channel: input.channel,
          attachments: input.attachments,
        }),
      ),
    });
  } catch {
    return { ok: false, mocked: false, error: "Could not reach myCRMSIM." };
  }

  let payload: Record<string, unknown> = {};
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message =
      (typeof payload.error === "string" && payload.error) ||
      (typeof payload.message === "string" && payload.message) ||
      (typeof payload.error_message === "string" && payload.error_message) ||
      `myCRMSIM returned ${response.status}.`;
    return { ok: false, mocked: false, error: message };
  }

  return { ok: true, mocked: false, to, handle: messageId };
}

export function randomWebhookToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function mycrmsimHostLocation() {
  return process.env.MYCRMSIM_LOCATION_ID?.trim() || "";
}

export function mycrmsimHostChannel(): MycrmsimChannel {
  return normalizeMycrmsimChannel(process.env.MYCRMSIM_CHANNEL);
}

function hostConfig(): MycrmsimConfig | null {
  const locationId = mycrmsimHostLocation();
  if (!locationId) return null;
  return { locationId, channel: mycrmsimHostChannel(), source: "host" };
}

export async function resolveMycrmsimConfig(
  supabase: Client,
  companyId: string,
): Promise<MycrmsimConfig | null> {
  const { data, error } = await supabase
    .from("mycrmsim_connections")
    .select("location_id, channel, linked")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!error && data) {
    if (data.linked && data.location_id.trim()) {
      return {
        locationId: data.location_id.trim(),
        channel: normalizeMycrmsimChannel(data.channel),
        source: "company",
      };
    }
    return null;
  }

  const rpc = await supabase.rpc("mycrmsim_outbound_config", { p_company_id: companyId });
  const payload = asConfig(rpc.data);
  if (!rpc.error && payload?.configured && payload.locationId?.trim()) {
    return {
      locationId: payload.locationId.trim(),
      channel: normalizeMycrmsimChannel(payload.channel),
      source: "company",
    };
  }
  if (!rpc.error && payload?.missing === false) return null;
  if (!rpc.error && payload?.error) return null;

  return hostConfig();
}

export async function sendCompanyText(input: {
  companyId: string;
  userId: string;
  to: string;
  content: string;
  attachments?: string[];
  supabase?: Client;
}): Promise<TextSendResult> {
  const supabase = input.supabase ?? createAnonClient();
  const config = await resolveMycrmsimConfig(supabase, input.companyId);
  if (!config) {
    const to = input.to.trim();
    return { ok: true, mocked: true, to, handle: `mock_${Date.now()}` };
  }
  return postMycrmsimMessage({
    locationId: config.locationId,
    userId: input.userId,
    to: input.to,
    content: input.content,
    channel: config.channel,
    attachments: input.attachments,
  });
}

export async function sendVoiceStaffText(input: {
  token: string;
  to: string;
  content: string;
}): Promise<TextSendResult> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("mycrmsim_config_for_voice", { p_token: input.token });
  const payload = asConfig(data);
  if (!error && payload?.configured && payload.locationId?.trim()) {
    return postMycrmsimMessage({
      locationId: payload.locationId.trim(),
      userId: payload.userId?.trim() || "voice",
      to: input.to,
      content: input.content,
      channel: normalizeMycrmsimChannel(payload.channel),
    });
  }
  if (!error && payload?.missing === false) {
    return { ok: true, mocked: true, to: input.to.trim(), handle: `mock_${Date.now()}` };
  }
  const host = hostConfig();
  if (!host) {
    return { ok: true, mocked: true, to: input.to.trim(), handle: `mock_${Date.now()}` };
  }
  return postMycrmsimMessage({
    locationId: host.locationId,
    userId: "voice",
    to: input.to,
    content: input.content,
    channel: host.channel,
  });
}

export async function mycrmsimStatusForCompany(supabase: Client, companyId: string) {
  const config = await resolveMycrmsimConfig(supabase, companyId);
  return {
    configured: Boolean(config),
    channel: config?.channel ?? "sms",
    source: config?.source ?? null,
  };
}
