import type { AssistantMessage, AssistantToolCall } from "@/lib/assistant/types";
import { toAnthropicTools, toOpenAiTools, type AssistantToolDef } from "@/lib/assistant/tools";

const OPENAI_MODEL = "gpt-4o";
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

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

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

function toAnthropicMessages(messages: AssistantMessage[]) {
  const converted: Array<{ role: "user" | "assistant"; content: string | AnthropicBlock[] }> = [];
  const pendingResults: AnthropicBlock[] = [];

  function flushResults() {
    if (!pendingResults.length) return;
    converted.push({ role: "user", content: [...pendingResults] });
    pendingResults.length = 0;
  }

  for (const message of messages) {
    if (message.role === "tool") {
      pendingResults.push({
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content,
      });
      continue;
    }
    flushResults();
    if (message.role === "user") {
      converted.push({ role: "user", content: message.content });
      continue;
    }
    const blocks: AnthropicBlock[] = [];
    if (message.content.trim()) blocks.push({ type: "text", text: message.content });
    for (const call of message.toolCalls ?? []) {
      blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.arguments ?? {} });
    }
    converted.push({
      role: "assistant",
      content: blocks.length ? blocks : [{ type: "text", text: message.content || " " }],
    });
  }
  flushResults();
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
      tools: toOpenAiTools(tools),
      tool_choice: "auto",
      messages: toOpenAiMessages(system, messages),
    }),
  });
  if (!response.ok) return null;
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

export async function completeWithAnthropic(
  system: string,
  messages: AssistantMessage[],
  tools: AssistantToolDef[],
): Promise<ProviderReply | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1600,
      temperature: 0.2,
      system,
      tools: toAnthropicTools(tools),
      messages: toAnthropicMessages(messages),
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    content?: Array<{
      type?: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
  };
  const blocks = body.content ?? [];
  const content = blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
  const toolCalls: AssistantToolCall[] = blocks.flatMap((block, index) => {
    if (block.type !== "tool_use" || !block.name) return [];
    return [
      {
        id: block.id || `toolu_${index}`,
        name: block.name,
        arguments: parseArguments(block.input),
      },
    ];
  });
  return { content, toolCalls };
}

export function assistantKeysConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim());
}

export async function completeAssistant(
  system: string,
  messages: AssistantMessage[],
  tools: AssistantToolDef[],
): Promise<ProviderReply | { missingKey: true } | null> {
  if (!assistantKeysConfigured()) return { missingKey: true };
  return (await completeWithOpenAi(system, messages, tools)) ?? (await completeWithAnthropic(system, messages, tools));
}
