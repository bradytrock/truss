import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { buildSystemPrompt, trimMessages } from "@/lib/assistant/prompt";
import { completeAssistant, assistantKeysConfigured } from "@/lib/assistant/providers";
import { toolsForSeat } from "@/lib/assistant/tools";
import type { AssistantContext, AssistantMessage, AssistantResponse } from "@/lib/assistant/types";
import type { SeatRole, StaffMember } from "@/lib/types";
import { SEAT_ROLES } from "@/lib/types";

export const runtime = "nodejs";

function isSeatRole(value: string): value is SeatRole {
  return (SEAT_ROLES as readonly string[]).includes(value);
}

function isMessage(value: unknown): value is AssistantMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.role === "user" && typeof row.content === "string") return true;
  if (row.role === "assistant" && typeof row.content === "string") return true;
  if (row.role === "tool" && typeof row.toolCallId === "string" && typeof row.content === "string") return true;
  return false;
}

function viewerFromContext(context: AssistantContext): StaffMember | undefined {
  if (!isSeatRole(context.seatRole)) return undefined;
  return {
    id: "seat",
    name: context.seatName,
    title: "",
    role: context.seatRole,
    teamId: null,
    initials: "",
    email: "",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  };
}

async function requireUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: false, code: "unauthorized", message: "Sign in to ask Truss." } satisfies AssistantResponse, {
      status: 401,
    });
  }
  return NextResponse.json({ configured: assistantKeysConfigured() });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: false, code: "unauthorized", message: "Sign in to ask Truss." } satisfies AssistantResponse, {
      status: 401,
    });
  }

  const body = (await request.json().catch(() => null)) as
    | { messages?: unknown; context?: AssistantContext }
    | null;
  const messages = Array.isArray(body?.messages) ? body.messages.filter(isMessage) : [];
  const context = body?.context;
  if (!context || typeof context.companyName !== "string" || typeof context.seatName !== "string") {
    return NextResponse.json({ ok: false, code: "bad_request", message: "Missing assistant context." } satisfies AssistantResponse, {
      status: 400,
    });
  }
  if (!messages.length) {
    return NextResponse.json({ ok: false, code: "bad_request", message: "Say what you need done." } satisfies AssistantResponse, {
      status: 400,
    });
  }

  const viewer = viewerFromContext(context);
  const tools = toolsForSeat(viewer);
  const system = buildSystemPrompt(context, viewer);
  const reply = await completeAssistant(system, trimMessages(messages), tools);

  if (reply && "missingKey" in reply) {
    return NextResponse.json(
      {
        ok: false,
        code: "no_key",
        message:
          "Ask Truss needs OPENAI_API_KEY on the server. Add it to .env.local and restart.",
      } satisfies AssistantResponse,
      { status: 503 },
    );
  }
  if (!reply) {
    return NextResponse.json(
      {
        ok: false,
        code: "provider",
        message: "Ask Truss could not reach OpenAI. Check OPENAI_API_KEY and try again in a moment.",
      } satisfies AssistantResponse,
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: {
      role: "assistant",
      content: reply.content,
      toolCalls: reply.toolCalls.length ? reply.toolCalls : undefined,
    },
  } satisfies AssistantResponse);
}
