import { isWelcomePendingMetadata } from "@/lib/welcome";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (isWelcomePendingMetadata(user?.user_metadata)) {
      const dest = new URL(next, origin);
      dest.searchParams.set("welcome", "1");
      return NextResponse.redirect(dest.toString());
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
