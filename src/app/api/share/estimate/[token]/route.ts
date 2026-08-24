import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = token?.trim() ?? "";
  if (trimmed.length < 6) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("shared_estimate", { p_token: trimmed });
    if (error || data == null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = token?.trim() ?? "";
  if (trimmed.length < 6) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let signer = "primary";
  try {
    const body = (await request.json()) as { signer?: unknown };
    if (body?.signer === "second" || body?.signer === "primary") signer = body.signer;
  } catch {
    // Empty body still signs as the primary homeowner.
  }
  try {
    const supabase = await createClient();
    let { data, error } = await supabase.rpc("sign_shared_estimate", {
      p_token: trimmed,
      p_signer: signer,
    });
    if (error && /p_signer|Could not find the function/i.test(error.message)) {
      const retry = await supabase.rpc("sign_shared_estimate", { p_token: trimmed });
      data = retry.data;
      error = retry.error;
    }
    if (error || data == null) {
      return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
