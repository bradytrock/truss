import { NextResponse } from "next/server";
import { formatResendFrom, sendResendEmail } from "@/lib/resend-mail";
import { readSessionUser } from "@/lib/session-user";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { looksLikeEmail } from "@/lib/share-text";

export const runtime = "nodejs";

const MAX_PDF_CHARS = 8_000_000;

async function requireUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  return readSessionUser(supabase);
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in before emailing a material order." }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const html = typeof body.html === "string" ? body.html.trim() : "";
  const senderName = typeof body.senderName === "string" ? body.senderName.trim() : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const replyTo = typeof body.replyTo === "string" ? body.replyTo.trim() : "";
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const pdf = typeof body.pdf === "string" ? body.pdf.trim() : "";

  if (!looksLikeEmail(to)) {
    return NextResponse.json({ error: "The supplier needs an email address." }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ error: "Add a subject before sending." }, { status: 400 });
  }
  if (!text && !html) {
    return NextResponse.json({ error: "Write a message before sending." }, { status: 400 });
  }
  if (!senderName) {
    return NextResponse.json({ error: "This order needs someone to send it." }, { status: 400 });
  }
  if (!looksLikeEmail(replyTo)) {
    return NextResponse.json(
      { error: "Add an email on your profile. Replies from the supplier go to that address." },
      { status: 400 },
    );
  }
  if (!filename.toLowerCase().endsWith(".pdf") || !pdf) {
    return NextResponse.json({ error: "Attach the material order PDF before sending." }, { status: 400 });
  }
  if (pdf.length > MAX_PDF_CHARS) {
    return NextResponse.json({ error: "That PDF is too large to email." }, { status: 400 });
  }

  try {
    const result = await sendResendEmail({
      to,
      subject,
      html: html || text,
      text: text || html,
      from: formatResendFrom({ senderName, companyName: companyName || "the office" }),
      replyTo,
      attachments: [{ filename: filename.replace(/[^\w.\-]+/g, "-"), content: pdf }],
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, mocked: result.mocked, id: result.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reach email." },
      { status: 502 },
    );
  }
}
