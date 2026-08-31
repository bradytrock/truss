import { NextResponse } from "next/server";
import {
  normalizeShareToken,
  parseShareSender,
  parseSharedEstimate,
  parseSharedInvoice,
  parseSharedPage,
  type ShareSender,
  type SharedEstimatePayload,
  type SharedInvoicePayload,
  type SharedPagePayload,
} from "@/lib/share";
import { parseSharedCard, type SharedCardPayload } from "@/lib/card";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export function shareJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

function logShareRpc(fn: string, token: string, error: { code?: string; message?: string } | null) {
  const hint = token ? `${token.slice(0, 8)}…` : "(empty)";
  console.error(`[share] ${fn} token=${hint}`, error?.code ?? "", error?.message ?? "no row");
}

export async function lookupShareSender(token: string): Promise<ShareSender | null> {
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6 || !isSupabaseConfigured()) return null;
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("shared_link_sender", { p_token: trimmed });
    if (error) {
      logShareRpc("shared_link_sender", trimmed, error);
      return null;
    }
    if (data == null) return null;
    return parseShareSender(data);
  } catch (error) {
    logShareRpc("shared_link_sender", trimmed, {
      message: error instanceof Error ? error.message : "threw",
    });
    return null;
  }
}

export async function shareNotFoundJson(token: string, error = "Not found") {
  const sender = await lookupShareSender(token);
  return shareJson(
    {
      error,
      ...(sender
        ? { company: sender.company, projectManager: sender.projectManager }
        : {}),
    },
    404,
  );
}

async function rpcShare(fn: "shared_estimate" | "shared_invoice" | "shared_page", token: string) {
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6 || !isSupabaseConfigured()) {
    return { data: null as unknown, sender: null as ShareSender | null };
  }
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc(fn, { p_token: trimmed });
    if (error) {
      logShareRpc(fn, trimmed, error);
      return { data: null, sender: await lookupShareSender(trimmed) };
    }
    if (data == null) {
      return { data: null, sender: await lookupShareSender(trimmed) };
    }
    return { data, sender: null };
  } catch (error) {
    logShareRpc(fn, trimmed, { message: error instanceof Error ? error.message : "threw" });
    return { data: null, sender: await lookupShareSender(trimmed) };
  }
}

export async function loadSharedEstimate(token: string): Promise<{
  payload: SharedEstimatePayload | null;
  sender: ShareSender | null;
}> {
  const { data, sender } = await rpcShare("shared_estimate", token);
  const payload = parseSharedEstimate(data);
  if (data != null && !payload) {
    logShareRpc("shared_estimate", token, { message: "unparseable payload" });
    return { payload: null, sender: sender ?? (await lookupShareSender(token)) };
  }
  return { payload, sender };
}

export async function loadSharedInvoice(token: string): Promise<{
  payload: SharedInvoicePayload | null;
  sender: ShareSender | null;
}> {
  const { data, sender } = await rpcShare("shared_invoice", token);
  const payload = parseSharedInvoice(data);
  if (data != null && !payload) {
    logShareRpc("shared_invoice", token, { message: "unparseable payload" });
    return { payload: null, sender: sender ?? (await lookupShareSender(token)) };
  }
  return { payload, sender };
}

export async function loadSharedPage(token: string): Promise<{
  payload: SharedPagePayload | null;
  sender: ShareSender | null;
}> {
  const { data, sender } = await rpcShare("shared_page", token);
  const payload = parseSharedPage(data);
  if (data != null && !payload) {
    logShareRpc("shared_page", token, { message: "unparseable payload" });
    return { payload: null, sender: sender ?? (await lookupShareSender(token)) };
  }
  return { payload, sender };
}

export async function loadSharedCard(
  company: string,
  person: string,
): Promise<SharedCardPayload | null> {
  const companySlug = company.trim().toLowerCase();
  const personSlug = person.trim().toLowerCase();
  if (!companySlug || !personSlug || !isSupabaseConfigured()) return null;
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("shared_card", {
      p_company: companySlug,
      p_person: personSlug,
    });
    if (error) {
      logShareRpc("shared_card", `${companySlug}/${personSlug}`, error);
      return null;
    }
    return parseSharedCard(data);
  } catch (error) {
    logShareRpc("shared_card", `${companySlug}/${personSlug}`, {
      message: error instanceof Error ? error.message : "threw",
    });
    return null;
  }
}
