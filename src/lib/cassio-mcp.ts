const PROTOCOL = "2025-03-26";

export function cassioMcpTools() {
  return [
    {
      name: "estimate_activity",
      description:
        "Look up a person, job, or estimate in this seat's book. Returns status, when it was sent, and whether a homeowner opened it.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Person name, job code, or estimate number.",
          },
        },
        required: ["query"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "recent_updates",
      description: "List estimates in this seat's book that a homeowner opened in the last 14 days.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "log_client_communication",
      description:
        "In a private text from the account owner, prepare a note, call, or text on the person's open job. Ask them to reply YES, then call again. Does nothing in a group.",
      inputSchema: {
        type: "object",
        properties: {
          client: { type: "string", description: "Client or person name." },
          kind: { type: "string", enum: ["note", "call", "text"] },
          body: { type: "string", description: "What to record." },
        },
        required: ["client", "body"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "schedule_job_appointment",
      description:
        "In a private text from the account owner, prepare an appointment on a job. Ask them to reply YES, then call again. Does nothing in a group.",
      inputSchema: {
        type: "object",
        properties: {
          job: { type: "string", description: "Job code or person name." },
          title: { type: "string" },
          startsAt: { type: "string", description: "ISO start time." },
          endsAt: { type: "string", description: "ISO end time." },
        },
        required: ["job", "title", "startsAt"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "share_lead_status",
      description:
        "In a private text from the account owner, prepare a lead status line for the one verified Seeds group. Ask them to reply YES, then call again. Never accepts a group id.",
      inputSchema: {
        type: "object",
        properties: {
          lead: { type: "string", description: "Lead or person name." },
        },
        required: ["lead"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

type RpcResult = { status: number; body: unknown | null };

function rpcResult(id: unknown, result: unknown): RpcResult {
  return { status: 200, body: { jsonrpc: "2.0", id: id ?? null, result } };
}

function rpcError(id: unknown, code: number, message: string): RpcResult {
  return { status: 200, body: { jsonrpc: "2.0", id: id ?? null, error: { code, message } } };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatWhen(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function formatMatch(value: unknown) {
  const row = asRecord(value) ?? {};
  const contact = typeof row.contact === "string" && row.contact.trim() ? row.contact.trim() : "Unknown contact";
  const estimate = typeof row.estimate === "string" ? row.estimate.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const status = typeof row.status === "string" ? row.status.trim() : "";
  const job = typeof row.job === "string" ? row.job.trim() : "";
  const address = typeof row.address === "string" ? row.address.trim() : "";
  const opens = typeof row.opens === "number" ? row.opens : 0;
  const sent = formatWhen(row.sentAt);
  const opened = formatWhen(row.lastOpenedAt);
  const label = [estimate, name].filter(Boolean).join(" ");
  const openedText =
    opens > 0
      ? `opened ${opens} time${opens === 1 ? "" : "s"}${opened ? `, last ${opened}` : ""}`
      : "not opened";
  const where = [job, address].filter(Boolean).join(" · ");
  return [
    contact,
    label ? `estimate ${label}` : "",
    status ? `status ${status}` : "",
    sent ? `sent ${sent}` : "",
    openedText,
    where,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function formatEstimateActivity(payload: unknown) {
  const row = asRecord(payload);
  if (!row || row.ok === false) {
    return typeof row?.error === "string" && row.error.trim()
      ? row.error.trim()
      : "This number is not connected to a Truss book.";
  }
  const matches = Array.isArray(row.matches) ? row.matches : [];
  if (matches.length === 0) return "No estimate in this seat's book matched that search.";
  const seat = typeof row.seat === "string" && row.seat.trim() ? row.seat.trim() : "This seat";
  return [`${seat}'s book:`, ...matches.map(formatMatch)].join("\n");
}

export function formatRecentUpdates(payload: unknown) {
  const row = asRecord(payload);
  if (!row || row.ok === false) {
    return typeof row?.error === "string" && row.error.trim()
      ? row.error.trim()
      : "This number is not connected to a Truss book.";
  }
  const matches = Array.isArray(row.matches) ? row.matches : [];
  if (matches.length === 0) return "No estimates in this seat's book were opened in the last 14 days.";
  const seat = typeof row.seat === "string" && row.seat.trim() ? row.seat.trim() : "This seat";
  return [`Opened in ${seat}'s book:`, ...matches.map(formatMatch)].join("\n");
}

export async function handleCassioMcp(
  body: unknown,
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>,
): Promise<RpcResult> {
  const message = asRecord(body);
  if (!message || typeof message.method !== "string") {
    return { status: 400, body: { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } } };
  }
  const method = message.method;
  const id = message.id;
  if (method.startsWith("notifications/")) return { status: 202, body: null };
  if (method === "initialize") {
    const params = asRecord(message.params);
    const requested = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
    const protocolVersion = requested === "2024-11-05" || requested === "2025-03-26" ? requested : PROTOCOL;
    return rpcResult(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "truss-cassio", version: "1" },
    });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: cassioMcpTools() });
  if (method === "tools/call") {
    const params = asRecord(message.params) ?? {};
    const name = typeof params.name === "string" ? params.name : "";
    const args = asRecord(params.arguments) ?? {};
    const text = await callTool(name, args);
    return rpcResult(id, { content: [{ type: "text", text }], isError: false });
  }
  return rpcError(id ?? null, -32601, "Method not found");
}
