import { NextResponse } from "next/server";
import { sendGmailMessage } from "@/lib/google-gmail";
import { gmailAccessToken, gmailCredentialsForStaff } from "@/lib/google-gmail-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        staffId?: string;
        to?: string;
        subject?: string;
        body?: string;
        threadId?: string;
      }
    | null;
  const staffId = body?.staffId?.trim() || "";
  const to = body?.to?.trim() || "";
  const subject = body?.subject?.trim() || "";
  const content = body?.body?.trim() || "";
  if (!staffId) return NextResponse.json({ error: "Missing staffId." }, { status: 400 });
  if (!to.includes("@")) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Add a subject." }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Write a message before sending." }, { status: 400 });

  try {
    const tokens = await gmailCredentialsForStaff(staffId);
    if (!tokens?.accessToken && !tokens?.refreshToken) {
      return NextResponse.json(
        { error: "Connect Gmail for this seat before sending." },
        { status: 400 },
      );
    }
    const token = await gmailAccessToken(tokens);
    const sent = await sendGmailMessage({
      accessToken: token,
      from: tokens.googleEmail,
      to,
      subject,
      body: content,
      threadId: body?.threadId?.trim() || undefined,
    });
    return NextResponse.json({
      ok: true,
      gmailId: sent.gmailId,
      threadId: sent.threadId,
      from: tokens.googleEmail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send that email.";
    const reconnect =
      message.toLowerCase().includes("insufficient") ||
      message.toLowerCase().includes("scope") ||
      message.toLowerCase().includes("insufficient permission");
    return NextResponse.json(
      {
        error: reconnect
          ? "Gmail needs send permission. Disconnect and Connect Gmail again, then retry."
          : message,
      },
      { status: 400 },
    );
  }
}
