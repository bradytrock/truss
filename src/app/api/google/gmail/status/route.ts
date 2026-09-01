import { NextResponse } from "next/server";
import { isGoogleOAuthConfigured } from "@/lib/google-gmail";

export async function GET() {
  return NextResponse.json({ configured: isGoogleOAuthConfigured() });
}
