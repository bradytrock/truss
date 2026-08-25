import { NextResponse } from "next/server";
import { parseShareSender, type ShareSender } from "@/lib/share";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function lookupShareSender(token: string): Promise<ShareSender | null> {
  if (!token || token.length < 6 || !isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("shared_link_sender", { p_token: token });
    if (error || data == null) return null;
    return parseShareSender(data);
  } catch {
    return null;
  }
}

export async function shareNotFoundJson(token: string, error = "Not found") {
  const sender = await lookupShareSender(token);
  return NextResponse.json(
    {
      error,
      ...(sender
        ? { company: sender.company, projectManager: sender.projectManager }
        : {}),
    },
    { status: 404 },
  );
}
