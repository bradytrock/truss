import { NextResponse } from "next/server";
import { fallbackChatReplies, parseSuggestedReplies, type WebsiteChatMessage } from "@/lib/website-chat";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const transcript = messages
    .map((item) => {
      const row = item as Partial<WebsiteChatMessage>;
      const who = row.direction === "outbound" ? "Office" : "Visitor";
      const text = typeof row.body === "string" ? row.body.trim() : "";
      return text ? `${who}: ${text}` : "";
    })
    .filter(Boolean)
    .slice(-12)
    .join("\n");

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || !transcript) {
    return NextResponse.json({ ok: true, replies: fallbackChatReplies() });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              "You draft two short replies for a roofing office in a website chat. Return JSON only: {\"replies\":[\"...\",\"...\"]}. Each reply is under 160 characters. Do not invent prices, dates, or payment links.",
          },
          { role: "user", content: transcript },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: true, replies: fallbackChatReplies() });
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const replies = parseSuggestedReplies(payload.choices?.[0]?.message?.content ?? "");
    return NextResponse.json({ ok: true, replies: replies.length ? replies : fallbackChatReplies() });
  } catch {
    return NextResponse.json({ ok: true, replies: fallbackChatReplies() });
  }
}
