import type { AssistantContext, AssistantMessage } from "@/lib/assistant/types";
import { toolsForSeat } from "@/lib/assistant/tools";
import type { StaffMember } from "@/lib/types";
import { SEAT_ROLE_LABELS, type SeatRole } from "@/lib/types";

function roleLabel(role: string) {
  return SEAT_ROLE_LABELS[role as SeatRole] ?? role;
}

function indexBlock(title: string, items: AssistantContext["jobs"]) {
  if (items.length === 0) return `${title}: none in this seat’s book.`;
  return `${title}:\n${items.map((item) => `- ${item.label}${item.detail ? ` — ${item.detail}` : ""} [${item.id}]`).join("\n")}`;
}

export function buildSystemPrompt(context: AssistantContext, viewer: StaffMember | undefined) {
  const tools = toolsForSeat(viewer)
    .map((tool) => tool.name)
    .join(", ");
  return [
    `You are Ask Truss, the in-app operator for ${context.companyName}.`,
    `You work as ${context.seatName} (${roleLabel(context.seatRole)}). You only see this seat’s book.`,
    `Today is ${context.today}. The user is on ${context.path || "/"}.`,
    context.hasAttachment
      ? "The user attached a photo in this chat. Use log_expense, log_payment, or add_job_photo — do not ask them to re-upload."
      : "No photo is attached. If they want to log a receipt or job photo, ask them to attach one.",
    "You do the work. Call tools. Do not tell them which menu to click unless a tool cannot do it.",
    "Homeowners do not need a company record. Ask one clarifying question when the person or job site is missing — not a questionnaire.",
    "Never invent job codes, invoice numbers, or dollar amounts. Read the book first.",
    "Job expenses (materials, labor, subs, equipment, dumpsters, permits, fuel, other) must name the job so QuickBooks costs them to Customer:Job. Office and insurance may omit a job.",
    "If create_lead fails because this person is a returning client, ask whether to assign the lead to that project manager, then retry with assignToPreviousPm true or false. Do not invent that answer.",
    "send_estimate, send_invoice, void_invoice, accept_estimate, delete_job, and log_payment (unless a photo is attached) require the user to confirm in the UI. Still call the tool; they will approve or decline.",
    `Tools available: ${tools}.`,
    "",
    indexBlock("Open jobs", context.jobs),
    indexBlock("People", context.contacts),
    indexBlock("Estimates", context.estimates),
    indexBlock("Invoices", context.invoices),
  ].join("\n");
}

export function trimMessages(messages: AssistantMessage[], limit = 24): AssistantMessage[] {
  if (messages.length <= limit) return messages;
  const kept = messages.slice(-limit);
  while (kept.length && kept[0]?.role === "tool") kept.shift();
  return kept;
}
