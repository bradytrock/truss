import type { TextMessage } from "@/lib/types";

function text(
  id: string,
  input: {
    contactId: string;
    jobId: string | null;
    opportunityId?: string | null;
    direction: "inbound" | "outbound";
    phone: string;
    body: string;
    createdAt: string;
    createdBy: string;
  },
): TextMessage {
  return {
    id,
    contactId: input.contactId,
    jobId: input.jobId,
    opportunityId: input.opportunityId ?? null,
    direction: input.direction,
    phone: input.phone,
    body: input.body,
    handle: "",
    status: "delivered",
    mediaUrl: "",
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  };
}

/** Sample homeowner threads for the Northline book. */
export const extraMessages: TextMessage[] = [
  text("msg_alvarez_1", {
    contactId: "con_dana",
    jobId: "job_alvarez_roof",
    direction: "outbound",
    phone: "(303) 555-2140",
    body: "Dana — Elena with Northline. Dumpster is on Forest tomorrow 7am. Crew will knock before they start the tear-off.",
    createdAt: "2026-08-24T15:12:00.000Z",
    createdBy: "Elena Voss",
  }),
  text("msg_alvarez_2", {
    contactId: "con_dana",
    jobId: "job_alvarez_roof",
    direction: "inbound",
    phone: "(303) 555-2140",
    body: "Perfect. We’ll leave the gate unlatched. Dogs will be inside.",
    createdAt: "2026-08-24T15:28:00.000Z",
    createdBy: "Dana Alvarez",
  }),
  text("msg_alvarez_3", {
    contactId: "con_dana",
    jobId: "job_alvarez_roof",
    direction: "outbound",
    phone: "(303) 555-2140",
    body: "Shingles are on. Punch in the morning for two ridge caps and the downspout kick. I’ll text when we’re wrapping.",
    createdAt: "2026-08-25T22:04:00.000Z",
    createdBy: "Elena Voss",
  }),
  text("msg_alvarez_4", {
    contactId: "con_dana",
    jobId: "job_alvarez_roof",
    direction: "inbound",
    phone: "(303) 555-2140",
    body: "Thank you. Can you leave the leftover bundle in the garage?",
    createdAt: "2026-08-25T22:11:00.000Z",
    createdBy: "Dana Alvarez",
  }),
  text("msg_hart_1", {
    contactId: "con_owen",
    jobId: "job_hart_water",
    direction: "inbound",
    phone: "(720) 555-3301",
    body: "Water’s still coming from the kitchen wall. Can someone come tonight?",
    createdAt: "2026-08-18T01:14:00.000Z",
    createdBy: "Owen Hart",
  }),
  text("msg_hart_2", {
    contactId: "con_owen",
    jobId: "job_hart_water",
    direction: "outbound",
    phone: "(720) 555-3301",
    body: "Owen — Tom is 20 minutes out with extractors. Keep the breaker off to that wall.",
    createdAt: "2026-08-18T01:19:00.000Z",
    createdBy: "Elena Voss",
  }),
  text("msg_hart_3", {
    contactId: "con_owen",
    jobId: "job_hart_water",
    direction: "outbound",
    phone: "(720) 555-3301",
    body: "Equipment stays through Friday. Nina asked for photos of the cabinets before we pull them — I’ll send those to her from the job.",
    createdAt: "2026-08-20T16:40:00.000Z",
    createdBy: "Elena Voss",
  }),
  text("msg_hart_4", {
    contactId: "con_owen",
    jobId: "job_hart_water",
    direction: "inbound",
    phone: "(720) 555-3301",
    body: "Got it. Kids are at my sister’s until Saturday.",
    createdAt: "2026-08-20T17:02:00.000Z",
    createdBy: "Owen Hart",
  }),
  text("msg_redmond_1", {
    contactId: "con_cleo",
    jobId: "job_redmond_add",
    direction: "outbound",
    phone: "(303) 555-9012",
    body: "Cleo — deposit invoice INV-2010 is in your email. Reply here if the bank needs a W-9 before they wire.",
    createdAt: "2026-08-19T18:05:00.000Z",
    createdBy: "Maya Chen",
  }),
  text("msg_redmond_2", {
    contactId: "con_cleo",
    jobId: "job_redmond_add",
    direction: "inbound",
    phone: "(303) 555-9012",
    body: "Sent. Permit still sitting with the city. I’ll call them tomorrow.",
    createdAt: "2026-08-19T19:44:00.000Z",
    createdBy: "Cleo Redmond",
  }),
  text("msg_blake_1", {
    contactId: "con_nora",
    jobId: "job_blake_kitchen",
    direction: "outbound",
    phone: "(303) 555-5560",
    body: "Nora — cabinets land Thursday. We’ll need the island clear and the dog gated. Crew 7:30.",
    createdAt: "2026-08-23T14:22:00.000Z",
    createdBy: "Maya Chen",
  }),
  text("msg_blake_2", {
    contactId: "con_nora",
    jobId: "job_blake_kitchen",
    direction: "inbound",
    phone: "(303) 555-5560",
    body: "We’ll be out. Leave the quartz samples on the dining table if they show.",
    createdAt: "2026-08-23T14:41:00.000Z",
    createdBy: "Nora Blake",
  }),
  text("msg_blake_3", {
    contactId: "con_nora",
    jobId: "job_blake_kitchen",
    direction: "inbound",
    phone: "(303) 555-5560",
    body: "Are the old cabinets going to Habitat or the dumpster?",
    createdAt: "2026-08-26T13:08:00.000Z",
    createdBy: "Nora Blake",
  }),
  text("msg_pell_1", {
    contactId: "con_drew",
    jobId: null,
    opportunityId: "opp_pell_roof",
    direction: "outbound",
    phone: "(303) 555-4455",
    body: "Drew — estimate EST-1005 is ready. I can walk the roof Saturday if that still works.",
    createdAt: "2026-08-21T17:30:00.000Z",
    createdBy: "Priya Shah",
  }),
  text("msg_pell_2", {
    contactId: "con_drew",
    jobId: null,
    opportunityId: "opp_pell_roof",
    direction: "inbound",
    phone: "(303) 555-4455",
    body: "Saturday 9 is good. Gate code 4419.",
    createdAt: "2026-08-21T17:46:00.000Z",
    createdBy: "Drew Pell",
  }),
];
