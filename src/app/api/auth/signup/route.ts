import { NextResponse } from "next/server";
import { parseClerkSignup } from "@/lib/clerk-account";
import { registerClerkAccount } from "@/lib/clerk-account-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  const parsed = parseClerkSignup(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  const result = await registerClerkAccount(parsed.value);
  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  if (result.status === "exists") return NextResponse.json({ status: "exists" });
  return NextResponse.json({ status: "created", ticket: result.ticket });
}
