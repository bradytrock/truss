import type { StaffMember } from "@/lib/types";
import { canDeleteJobs } from "@/lib/visibility";
import { isBusinessDevelopment } from "@/lib/bd";

export type ToolGate = "any" | "ops" | "admin";

export type JsonSchema = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
};

export type AssistantToolDef = {
  name: string;
  description: string;
  parameters: JsonSchema;
  gate: ToolGate;
  confirm?: boolean;
  status: string;
};

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const bool = (description: string) => ({ type: "boolean", description });

function object(
  properties: JsonSchema["properties"],
  required: string[] = [],
): JsonSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

export const ASSISTANT_TOOLS: AssistantToolDef[] = [
  {
    name: "search_book",
    description: "Search jobs, contacts, estimates, and invoices the current seat can see.",
    status: "Searching the book…",
    gate: "any",
    parameters: object(
      {
        query: str("Name, job code, address, phone, email, or estimate/invoice number"),
        kind: {
          type: "string",
          enum: ["all", "job", "contact", "estimate", "invoice"],
          description: "Limit the search. Default all.",
        },
      },
      ["query"],
    ),
  },
  {
    name: "get_job",
    description: "Get a job summary: site, status, homeowner, AR, and related estimates.",
    status: "Opening the job…",
    gate: "any",
    parameters: object({ job: str("Job id or job code such as BJ081926-A") }, ["job"]),
  },
  {
    name: "get_contact",
    description: "Get a person: phone, email, company, and jobs they sit on.",
    status: "Opening the contact…",
    gate: "any",
    parameters: object({ contact: str("Contact id or full name") }, ["contact"]),
  },
  {
    name: "get_estimate",
    description: "Get an estimate: status, total, job, and line count.",
    status: "Opening the estimate…",
    gate: "any",
    parameters: object({ estimate: str("Estimate id or number") }, ["estimate"]),
  },
  {
    name: "get_invoice",
    description: "Get an invoice: status, total, balance, and job.",
    status: "Opening the invoice…",
    gate: "any",
    parameters: object({ invoice: str("Invoice id or number") }, ["invoice"]),
  },
  {
    name: "search_catalog",
    description: "Search the company price book to add lines onto an estimate.",
    status: "Searching the price book…",
    gate: "ops",
    parameters: object({ query: str("Product or labor name, e.g. architectural shingle") }, ["query"]),
  },
  {
    name: "open_record",
    description: "Navigate the user to a job, contact, estimate, or invoice in the app.",
    status: "Opening the record…",
    gate: "any",
    parameters: object(
      {
        kind: { type: "string", enum: ["job", "contact", "estimate", "invoice"] },
        id: str("Record id"),
      },
      ["kind", "id"],
    ),
  },
  {
    name: "create_lead",
    description:
      "Open a new lead: homeowner, job site, seed, and residential vs commercial. Creates the costing job. Reuse an existing contact when the name already matches.",
    status: "Opening a lead…",
    gate: "any",
    parameters: object(
      {
        firstName: str("Homeowner first name"),
        lastName: str("Homeowner last name"),
        phone: str("Mobile or home phone"),
        email: str("Email"),
        street: str("Job site street"),
        city: str("City"),
        state: str("State abbreviation"),
        postalCode: str("ZIP"),
        source: {
          type: "string",
          enum: [
            "podium",
            "website",
            "google_ad",
            "phone",
            "angies_list",
            "realtor",
            "referral",
            "sales_team",
            "text_main_line",
            "past_client",
            "chatgpt",
            "social_media",
          ],
          description: "How the lead found you (seed).",
        },
        market: { type: "string", enum: ["residential", "commercial"], description: "Default residential." },
        notes: str("Anything the caller said"),
        referralContactId: str("Required when source is referral — id of the person who sent them"),
      },
      ["firstName", "lastName", "source"],
    ),
  },
  {
    name: "create_or_update_contact",
    description: "Add a person or update an existing one. Homeowners do not need a company.",
    status: "Saving the contact…",
    gate: "any",
    parameters: object(
      {
        contactId: str("Existing id when updating"),
        name: str("Full name"),
        title: str("Title, e.g. Homeowner or Adjuster"),
        phone: str("Phone"),
        email: str("Email"),
        isReferralPartner: bool("True for realtors, adjusters, and other referral partners"),
      },
      ["name"],
    ),
  },
  {
    name: "update_job",
    description: "Update a job’s site, name, crew names, or notes.",
    status: "Updating the job…",
    gate: "any",
    parameters: object({
      job: str("Job id or code"),
      name: str("Job name"),
      street: str("Street"),
      city: str("City"),
      state: str("State"),
      postalCode: str("ZIP"),
      projectManager: str("Project manager name"),
      superintendent: str("Superintendent name"),
      description: str("Job description / notes on the record"),
    }),
  },
  {
    name: "move_job",
    description: "Move a job on the board: lead, estimating, proposal_sent, in_progress, punch, complete, on_hold, lost.",
    status: "Moving the job…",
    gate: "any",
    parameters: object(
      {
        job: str("Job id or code"),
        column: {
          type: "string",
          enum: ["lead", "estimating", "proposal_sent", "in_progress", "punch", "complete", "on_hold", "lost"],
        },
      },
      ["job", "column"],
    ),
  },
  {
    name: "create_estimate",
    description: "Start a draft estimate on a job. Add lines next with add_estimate_line.",
    status: "Starting an estimate…",
    gate: "ops",
    parameters: object(
      {
        job: str("Job id or code"),
        name: str("Estimate title. Default the job name."),
        notes: str("Internal notes"),
      },
      ["job"],
    ),
  },
  {
    name: "add_estimate_line",
    description: "Add a price-book or custom line to an estimate. Search the catalog first when you can.",
    status: "Adding an estimate line…",
    gate: "ops",
    parameters: object(
      {
        estimate: str("Estimate id or number"),
        catalogItemId: str("Price book id from search_catalog"),
        title: str("Custom line title when not using the catalog"),
        quantity: num("Quantity. Default 1."),
        unitCost: num("Unit price for a custom line"),
        unit: str("Unit, e.g. SQ or LS"),
        groupName: str("Section name, e.g. Roofing"),
        optional: bool("True if this is optional work"),
      },
      ["estimate"],
    ),
  },
  {
    name: "update_estimate_line",
    description: "Change quantity, price, or title on an existing estimate line.",
    status: "Updating the line…",
    gate: "ops",
    parameters: object(
      {
        lineId: str("Estimate line id"),
        quantity: num("Quantity"),
        unitCost: num("Unit price"),
        title: str("Title"),
        optional: bool("Optional work"),
        selected: bool("Whether an optional line is included"),
      },
      ["lineId"],
    ),
  },
  {
    name: "create_invoice",
    description: "Create a draft invoice on a job.",
    status: "Creating an invoice…",
    gate: "ops",
    parameters: object(
      {
        job: str("Job id or code"),
        name: str("Invoice title"),
        notes: str("Notes on the invoice"),
      },
      ["job"],
    ),
  },
  {
    name: "convert_estimate_to_invoice",
    description: "Turn an accepted or sent estimate’s included lines into an invoice.",
    status: "Converting the estimate…",
    gate: "ops",
    parameters: object({ estimate: str("Estimate id or number") }, ["estimate"]),
  },
  {
    name: "log_expense",
    description:
      "Log a job cost onto a job so QuickBooks assigns it to Customer:Job, not company overhead. Office and insurance may omit the job. If the user attached a photo, it will be read and stored on the expense. Amount is dollars.",
    status: "Logging the expense…",
    gate: "any",
    parameters: object(
      {
        job: str("Job id or code. Required for job costs (materials, labor, subs, and similar)."),
        vendor: str("Vendor name"),
        amount: num("Amount in dollars"),
        account: {
          type: "string",
          enum: [
            "materials",
            "subcontractors",
            "equipment_rental",
            "dumpsters",
            "permits",
            "labor",
            "fuel",
            "office",
            "insurance",
            "other",
          ],
        },
        method: {
          type: "string",
          enum: ["credit_card", "debit", "check", "ach", "cash"],
        },
        date: str("YYYY-MM-DD. Default today."),
        memo: str("What it was for"),
      },
      ["vendor", "amount"],
    ),
  },
  {
    name: "log_payment",
    description: "Record a payment against an invoice or job. Confirm with the user unless a check photo was just attached.",
    status: "Recording the payment…",
    gate: "ops",
    confirm: true,
    parameters: object(
      {
        invoice: str("Invoice id or number"),
        job: str("Job id or code when not on a specific invoice"),
        amount: num("Amount in dollars"),
        method: str("check, ACH, wire, card, cash"),
        date: str("YYYY-MM-DD. Default today."),
        reference: str("Check number or confirmation"),
      },
      ["amount"],
    ),
  },
  {
    name: "add_job_photo",
    description: "Attach the photo from this chat onto a job. Requires an attached image.",
    status: "Adding the photo…",
    gate: "any",
    parameters: object(
      {
        job: str("Job id or code"),
        caption: str("What the photo shows"),
        category: { type: "string", enum: ["before", "progress", "after", "issue"] },
      },
      ["job"],
    ),
  },
  {
    name: "schedule_event",
    description: "Put a field event on the Truss calendar.",
    status: "Scheduling the event…",
    gate: "ops",
    parameters: object(
      {
        title: str("Event title"),
        kind: {
          type: "string",
          enum: ["site_walk", "pre_bid", "inspection", "production", "meeting", "punch"],
        },
        startsAt: str("ISO or YYYY-MM-DDTHH:mm local start"),
        endsAt: str("ISO or YYYY-MM-DDTHH:mm local end"),
        job: str("Related job id or code"),
        location: str("Address or meet-up"),
        notes: str("Notes"),
      },
      ["title", "startsAt"],
    ),
  },
  {
    name: "add_activity",
    description: "Write a note on a job.",
    status: "Saving the note…",
    gate: "any",
    parameters: object(
      {
        job: str("Job id or code"),
        body: str("The note"),
      },
      ["job", "body"],
    ),
  },
  {
    name: "send_estimate",
    description: "Mark an estimate sent and mint a client link. Always confirm first.",
    status: "Sending the estimate…",
    gate: "ops",
    confirm: true,
    parameters: object({ estimate: str("Estimate id or number") }, ["estimate"]),
  },
  {
    name: "send_invoice",
    description: "Mark an invoice sent and mint a client link. Always confirm first.",
    status: "Sending the invoice…",
    gate: "ops",
    confirm: true,
    parameters: object({ invoice: str("Invoice id or number") }, ["invoice"]),
  },
  {
    name: "void_invoice",
    description: "Void an invoice. Always confirm first.",
    status: "Voiding the invoice…",
    gate: "ops",
    confirm: true,
    parameters: object({ invoice: str("Invoice id or number") }, ["invoice"]),
  },
  {
    name: "accept_estimate",
    description: "Mark an estimate signed in the office (no drawn signature). Always confirm first.",
    status: "Accepting the estimate…",
    gate: "ops",
    confirm: true,
    parameters: object({ estimate: str("Estimate id or number") }, ["estimate"]),
  },
  {
    name: "delete_job",
    description: "Soft-delete a job into the Deleted column. Company admin only. Always confirm first.",
    status: "Deleting the job…",
    gate: "admin",
    confirm: true,
    parameters: object(
      {
        job: str("Job id or code"),
        reason: str("Why it is being deleted"),
      },
      ["job", "reason"],
    ),
  },
];

export function toolsForSeat(viewer: StaffMember | undefined) {
  const bd = isBusinessDevelopment(viewer?.role);
  const admin = canDeleteJobs(viewer);
  return ASSISTANT_TOOLS.filter((tool) => {
    if (tool.gate === "admin") return admin;
    if (tool.gate === "ops") return !bd;
    return true;
  });
}

export function toolByName(name: string) {
  return ASSISTANT_TOOLS.find((tool) => tool.name === name);
}

export function toolNeedsConfirm(name: string) {
  return Boolean(toolByName(name)?.confirm);
}

export function toolStatus(name: string) {
  return toolByName(name)?.status ?? "Working…";
}

export function toOpenAiTools(tools: AssistantToolDef[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
