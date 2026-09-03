import { NextResponse } from "next/server";
import {
  formatResendFrom,
  isResendConfigured,
  resendStatus,
  sendResendEmail,
} from "@/lib/resend-mail";
import {
  looksLikeEmail,
  requestOrigin,
  shareUrlAllowed,
} from "@/lib/share-text";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(resendStatus());
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  const to = typeof body.to === "string" ? body.to : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  const html = typeof body.html === "string" ? body.html : "";
  const text = typeof body.text === "string" ? body.text : "";
  const url = typeof body.url === "string" ? body.url : "";
  const senderName = typeof body.senderName === "string" ? body.senderName.trim() : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const replyTo = typeof body.replyTo === "string" ? body.replyTo.trim() : "";

  if (!looksLikeEmail(to)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!subject.trim()) {
    return NextResponse.json({ error: "Add a subject before sending." }, { status: 400 });
  }
  if (!html.trim() && !text.trim()) {
    return NextResponse.json({ error: "Write a message before sending." }, { status: 400 });
  }
  if (!shareUrlAllowed(url, requestOrigin(request))) {
    return NextResponse.json({ error: "That share link does not belong to this app." }, { status: 400 });
  }
  if (!(html.includes(url) || text.includes(url))) {
    return NextResponse.json({ error: "The email has to include the share link." }, { status: 400 });
  }
  if (!senderName) {
    return NextResponse.json(
      { error: "This document needs a project manager before you can email it." },
      { status: 400 },
    );
  }
  if (!looksLikeEmail(replyTo)) {
    return NextResponse.json(
      {
        error:
          "Add an email on the project manager’s profile (Settings → People or Profile). Replies go to that address.",
      },
      { status: 400 },
    );
  }

  const from = formatResendFrom({
    senderName,
    companyName: companyName || "the office",
  });

  try {
    const result = await sendResendEmail({ to, subject, html, text, from, replyTo });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      mocked: result.mocked,
      configured: isResendConfigured() || !result.mocked,
      id: result.id,
      to,
      from,
      replyTo,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reach Resend." },
      { status: 502 },
    );
  }
}
