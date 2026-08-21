export type AssistantRole = "user" | "assistant" | "tool";

export type AssistantToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AssistantMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AssistantToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type AssistantIndexItem = {
  id: string;
  label: string;
  detail?: string;
};

export type AssistantContext = {
  companyName: string;
  seatName: string;
  seatRole: string;
  path: string;
  today: string;
  hasAttachment: boolean;
  jobs: AssistantIndexItem[];
  contacts: AssistantIndexItem[];
  estimates: AssistantIndexItem[];
  invoices: AssistantIndexItem[];
};

export type AssistantToolResult = {
  ok: boolean;
  error?: string;
  data?: unknown;
  href?: string;
  label?: string;
};

export type AssistantOkResponse = {
  ok: true;
  message: Extract<AssistantMessage, { role: "assistant" }>;
};

export type AssistantErrResponse = {
  ok: false;
  code: "unauthorized" | "no_key" | "provider" | "bad_request";
  message: string;
};

export type AssistantResponse = AssistantOkResponse | AssistantErrResponse;
