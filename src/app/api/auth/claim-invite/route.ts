import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { claimClerkInvite } from "@/lib/clerk-account-server";
import { clerkConfigured } from "@/lib/clerk-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!clerkConfigured()) {
    return NextResponse.json({ error: "Sign-in uses Clerk. Add the Clerk keys on the host." }, { status: 400 });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to accept this invite." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "That invite is missing." }, { status: 400 });

  const person = await currentUser();
  const email = person?.primaryEmailAddress?.emailAddress ?? "";
  const fullName = [person?.firstName, person?.lastName].filter(Boolean).join(" ");
  const claimed = await claimClerkInvite({ clerkUserId: userId, email, fullName, token });
  if (!claimed.ok) return NextResponse.json({ error: claimed.message }, { status: 400 });
  return NextResponse.json({ ok: true, companyId: claimed.companyId });
}
