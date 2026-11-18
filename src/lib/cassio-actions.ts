import { CASSIO_SILENCE, guardToolText, isCassioYes, publicSeedLine, redactFinancials, type CassioAudience } from "./cassio-guard.ts";
import { formatDraftEstimate, formatJobNotes } from "./cassio-mcp.ts";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function askYes(summary: string) {
  return `Reply YES to save this: ${summary}`;
}

async function remember(rpc: Rpc, token: string, kind: string, payload: Record<string, unknown>, summary: string) {
  const saved = asRecord(await rpc("cassio_action_remember", {
    p_token: token,
    p_kind: kind,
    p_payload: payload,
    p_summary: summary,
  }));
  if (!saved || saved.ok === false) return text(saved?.error) || "That could not be prepared.";
  return askYes(text(saved.summary) || summary);
}

export async function runCassioAction(input: {
  name: string;
  args: Record<string, unknown>;
  token: string;
  audience: CassioAudience;
  latestText: string;
  seedChatId: string;
  rpc: Rpc;
  sendSeed: (line: string) => Promise<boolean>;
  readBook: (name: string, args: Record<string, unknown>) => Promise<string>;
}) {
  if (input.audience !== "owner_dm" && input.audience !== "seeds") return CASSIO_SILENCE;

  const yes = isCassioYes(input.latestText);
  const kind =
    input.name === "log_client_communication"
      ? "communication"
      : input.name === "schedule_job_appointment"
        ? "appointment"
        : input.name === "share_lead_status"
          ? "seed"
          : "";
  if (input.audience !== "owner_dm" && (yes || kind)) {
    return "Saving a note or booking a time happens in a private text to this number.";
  }
  if (yes && kind) {
    {
      const committed = asRecord(await input.rpc("cassio_action_commit", { p_token: input.token, p_kind: kind }));
      if (!committed || committed.ok === false) return text(committed?.error) || "Nothing was saved.";
      const summary = text(committed.summary);
      if (committed.kind === "seed") {
        const line = publicSeedLine(summary);
        if (!line || !input.seedChatId) return "That update was not posted.";
        const sent = await input.sendSeed(line);
        return sent ? "Posted to the Seeds group." : "The Seeds group did not accept the update.";
      }
      if (committed.kind === "appointment") {
        const line = publicSeedLine(summary.replace(/^Booked /, "Appointment set: "));
        if (line && input.seedChatId) await input.sendSeed(line);
      }
      return guardToolText(input.audience, summary);
    }
  }

  if (input.name === "estimate_activity" || input.name === "recent_updates") {
    return guardToolText(input.audience, await input.readBook(input.name, input.args));
  }

  if (input.name === "job_notes") {
    const job = text(input.args.job) || text(input.args.query);
    if (!job) return "Name the job.";
    const found = await input.rpc("cassio_job_notes", { p_token: input.token, p_query: job });
    return guardToolText(input.audience, redactFinancials(formatJobNotes(found)));
  }

  if (input.name === "draft_estimate") {
    const job = text(input.args.job) || text(input.args.query);
    const template = text(input.args.template);
    const squares = typeof input.args.squares === "number" ? input.args.squares : 0;
    if (!job || !template) return "Name the job and the estimate template.";
    const found = await input.rpc("cassio_draft_estimate", {
      p_token: input.token,
      p_query: job,
      p_template: template,
      p_squares: squares,
    });
    const includeTotal = input.audience === "owner_dm";
    const summary = formatDraftEstimate(found, includeTotal);
    return guardToolText(input.audience, includeTotal ? summary : redactFinancials(summary));
  }

  if (input.name === "log_client_communication") {
    const client = text(input.args.client);
    const body = text(input.args.body);
    const kind = text(input.args.kind) || "note";
    if (!client || !body) return "Name the client and what to record.";
    const found = asRecord(await input.rpc("cassio_visible_client", { p_token: input.token, p_query: client }));
    if (!found || found.ok === false) return text(found?.error) || "No client in this book matched.";
    const jobCode = text(found.openJobCode);
    const where = jobCode ? `job ${jobCode}` : text(found.name) || client;
    const summary = `Log a ${kind} on ${where}.`;
    return remember(input.rpc, input.token, "communication", {
      clientId: found.clientId,
      name: found.name,
      jobId: text(found.openJobId),
      kind,
      body,
    }, summary);
  }

  if (input.name === "schedule_job_appointment") {
    const job = text(input.args.job);
    const title = text(input.args.title);
    const startsAt = text(input.args.startsAt);
    if (!job || !title || !startsAt) return "Name the job, a title, and a start time.";
    const found = asRecord(await input.rpc("cassio_visible_job", { p_token: input.token, p_query: job }));
    if (!found || found.ok === false) return text(found?.error) || "No job in this book matched.";
    const who = text(found.contact) || text(found.code) || text(found.name);
    const summary = `Book ${title} on ${who}.`;
    return remember(input.rpc, input.token, "appointment", {
      jobId: found.jobId,
      code: found.code,
      clientId: found.clientId,
      opportunityId: found.opportunityId,
      location: found.location,
      title,
      startsAt,
      endsAt: text(input.args.endsAt),
    }, summary);
  }

  if (input.name === "share_lead_status") {
    const lead = text(input.args.lead);
    if (!lead) return "Name the lead.";
    if (!input.seedChatId) return "Verify the Seeds group in settings before posting an update.";
    const found = asRecord(await input.rpc("cassio_lead_status", { p_token: input.token, p_query: lead }));
    if (!found || found.ok === false) return text(found?.error) || "No lead in this book matched.";
    const line = publicSeedLine(
      ["Lead update:", text(found.name), text(found.stage), text(found.where)].filter(Boolean).join(" · "),
    );
    if (!line) return "That update was not posted.";
    return remember(input.rpc, input.token, "seed", { line }, line);
  }

  return "That tool is not on this number.";
}
