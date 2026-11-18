import { redactFinancials } from "./cassio-guard.ts";

const PROTOCOL = "2025-03-26";

export function cassioMcpTools() {
  return [
    {
      name: "estimate_activity",
      description:
        "Look up a person, job, or estimate in this seat's book. Works in a private text from the account owner and in the verified Seeds group. Returns status, when it was sent, and whether a homeowner opened it. Never include a dollar amount.",
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
      description:
        "List estimates in this seat's book that a homeowner opened in the last 14 days. Works in a private text from the account owner and in the verified Seeds group. Never include a dollar amount.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "job_notes",
      description:
        "Read the notes, calls, and site visits on a job, plus any measured squares and the estimate template names. Call this before drafting an estimate. Ask only for gaps the result lists. Never include a dollar amount.",
      inputSchema: {
        type: "object",
        properties: {
          job: { type: "string", description: "Job code or person name." },
        },
        required: ["job"],
      },
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
      name: "draft_estimate",
      description:
        "Save a draft estimate on a job from a company template. Call job_notes first and ask for a square count and a template when those are missing. Does not send the estimate. Pass squares as 0 to use the measured squares on the job.",
      inputSchema: {
        type: "object",
        properties: {
          job: { type: "string", description: "Job code or person name." },
          template: { type: "string", description: "Estimate template name." },
          squares: { type: "number", description: "Roof squares. 0 uses the measure already on the job." },
        },
        required: ["job", "template"],
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

function noteRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      if (!row) return "";
      const kind = typeof row.type === "string" ? row.type.trim() : "note";
      const body = redactFinancials(typeof row.body === "string" ? row.body.trim() : "");
      return body ? `${kind}: ${body}` : "";
    })
    .filter(Boolean);
}

export function formatJobNotes(payload: unknown) {
  const row = asRecord(payload);
  if (!row || row.ok === false) {
    return typeof row?.error === "string" && row.error.trim()
      ? row.error.trim()
      : "This number is not connected to a Truss book.";
  }
  const code = typeof row.code === "string" ? row.code.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const contact = typeof row.contact === "string" ? row.contact.trim() : "";
  const address = typeof row.address === "string" ? row.address.trim() : "";
  const description = typeof row.description === "string" ? row.description.trim() : "";
  const squares = typeof row.squares === "number" && row.squares > 0 ? row.squares : null;
  const templates = Array.isArray(row.templates)
    ? row.templates.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const gaps = Array.isArray(row.gaps)
    ? row.gaps.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const notes = noteRows(row.notes);
  return [
    [code, name].filter(Boolean).join(" · ") || "Job",
    contact,
    address,
    description ? `Job description: ${redactFinancials(description)}` : "",
    notes.length ? notes.join("\n") : "No notes on this job yet.",
    squares ? `Measured squares: ${squares}` : "No square count on the job.",
    templates.length ? `Templates: ${templates.join(", ")}` : "No estimate templates are saved.",
    gaps.length ? `Ask only for: ${gaps.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatDraftEstimate(payload: unknown, includeTotal: boolean) {
  const row = asRecord(payload);
  if (!row || row.ok === false) {
    return typeof row?.error === "string" && row.error.trim()
      ? row.error.trim()
      : "The draft was not saved.";
  }
  const number = typeof row.number === "string" ? row.number.trim() : "the draft";
  const who = [typeof row.code === "string" ? row.code.trim() : "", typeof row.name === "string" ? row.name.trim() : ""]
    .filter(Boolean)
    .join(" ");
  const lines = Array.isArray(row.lines)
    ? row.lines
        .map((item) => {
          const line = asRecord(item);
          if (!line) return "";
          const title = typeof line.title === "string" ? line.title.trim() : "";
          const quantity = typeof line.quantity === "number" ? String(line.quantity) : "";
          const unit = typeof line.unit === "string" ? line.unit.trim() : "";
          return [title, quantity, unit].filter(Boolean).join(" ");
        })
        .filter(Boolean)
    : [];
  const total = typeof row.total === "number" ? row.total : null;
  const money =
    includeTotal && total !== null
      ? `Total $${Math.round(total).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.`
      : "";
  return [
    `Draft ${number} is on ${who || "the job"} for review.`,
    lines.length ? lines.join(", ") : "The template had no lines.",
    money,
    "It was not sent.",
  ]
    .filter(Boolean)
    .join(" ");
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
