import { authErrorMessage } from "@/lib/auth-errors";
import { appOrigin } from "@/lib/app-origin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Enter your email first, then tap Forgot Password." }, { status: 400 });
  }
  try {
    const supabase = await createClient();
    const origin = await appOrigin();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/login`,
    });
    if (error) return NextResponse.json({ error: authErrorMessage(error) }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: authErrorMessage(error instanceof Error ? error.message : "Could not send reset email.") },
      { status: 400 },
    );
  }
}
