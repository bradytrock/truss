import type { AssistantMessage, AssistantToolCall } from "@/lib/assistant/types";
import { toOpenAiTools, type AssistantToolDef } from "@/lib/assistant/tools";

const OPENAI_MODEL = "gpt-4o";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return asRecord(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return asRecord(raw);
}

function toOpenAiMessages(system: string, messages: AssistantMessage[]) {
  const converted: Array<Record<string, unknown>> = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "user") {
      converted.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      converted.push({
        role: "assistant",
        content: message.content || null,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
              })),
            }
          : {}),
      });
      continue;
    }
    converted.push({
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    });
  }
  return converted;
}

export type ProviderReply = {
  content: string;
  toolCalls: AssistantToolCall[];
};

export async function completeWithOpenAi(
  system: string,
  messages: AssistantMessage[],
  tools: AssistantToolDef[],
): Promise<ProviderReply | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      max_tokens: 1600,
      tools: toOpenAiTools(tools),
      tool_choice: "auto",
      messages: toOpenAiMessages(system, messages),
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Ask Truss OpenAI error", response.status, detail.slice(0, 400));
    return null;
  }
  const body = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
      };
    }>;
  };
  const message = body.choices?.[0]?.message;
  if (!message) return null;
  const toolCalls: AssistantToolCall[] = (message.tool_calls ?? []).flatMap((call, index) => {
    const name = call.function?.name?.trim();
    if (!name) return [];
    return [
      {
        id: call.id || `call_${index}`,
        name,
        arguments: parseArguments(call.function?.arguments),
      },
    ];
  });
  return { content: message.content?.trim() ?? "", toolCalls };
}

export function assistantKeysConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function completeAssistant(
  system: string,
  messages: AssistantMessage[],
  tools: AssistantToolDef[],
): Promise<ProviderReply | { missingKey: true } | null> {
  if (!assistantKeysConfigured()) return { missingKey: true };
  return completeWithOpenAi(system, messages, tools);
}
