import { contactForEmail } from "@/lib/job-emails";
import { jobForContact } from "@/lib/job-messages";
import type { Contact, GmailMessage, Job, Opportunity } from "@/lib/types";

type Sample = {
  gmailId: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  receivedAt: string;
  direction: "inbound" | "outbound";
  tagIfMatched?: boolean;
};

const OFFICE = "elena.voss@northlineco.com";

const SAMPLES: Sample[] = [
  {
    gmailId: "demo_alvarez_1",
    threadId: "demo_alvarez",
    fromName: "Dana Alvarez",
    fromEmail: "dana.alvarez.parkhill@gmail.com",
    toEmail: OFFICE,
    subject: "Dumpster and gate for Forest tomorrow",
    body: "Elena — we’ll leave the side gate unlatched at 7. Dogs will be inside. Can the dumpster sit on the apron so it doesn’t block the alley?",
    receivedAt: "2026-08-24T15:31:00.000Z",
    direction: "inbound",
    tagIfMatched: true,
  },
  {
    gmailId: "demo_alvarez_2",
    threadId: "demo_alvarez",
    fromName: "Elena Voss",
    fromEmail: OFFICE,
    toEmail: "dana.alvarez.parkhill@gmail.com",
    subject: "Re: Dumpster and gate for Forest tomorrow",
    body: "Dana — yes, apron is fine. Crew will knock before tear-off. I’ll text when they’re wrapping the ridge.",
    receivedAt: "2026-08-24T16:02:00.000Z",
    direction: "outbound",
    tagIfMatched: true,
  },
  {
    gmailId: "demo_hart_1",
    threadId: "demo_hart",
    fromName: "Owen Hart",
    fromEmail: "owen.hart.highlands@gmail.com",
    toEmail: OFFICE,
    subject: "Water still coming from the kitchen wall",
    body: "It’s after midnight and water is still running behind the cabinets. Can someone come tonight? Breaker to that wall is already off.",
    receivedAt: "2026-08-18T01:16:00.000Z",
    direction: "inbound",
    tagIfMatched: true,
  },
  {
    gmailId: "demo_blake_1",
    threadId: "demo_blake",
    fromName: "Elena Voss",
    fromEmail: OFFICE,
    toEmail: "nora.blake.congress@gmail.com",
    subject: "Cabinets Thursday — island clear",
    body: "Nora — cabinets land Thursday. We’ll need the island clear and the dog gated. Crew 7:30. Quartz samples can sit on the dining table if you’re out.",
    receivedAt: "2026-08-23T14:20:00.000Z",
    direction: "outbound",
    tagIfMatched: true,
  },
  {
    gmailId: "demo_pell_1",
    threadId: "demo_pell",
    fromName: "Drew Pell",
    fromEmail: "drew.pell.lakewood@gmail.com",
    toEmail: OFFICE,
    subject: "Saturday roof walk",
    body: "Saturday 9 still works. Gate code 4419. Estimate looked good — I had a question on the ice and water shield line.",
    receivedAt: "2026-08-21T17:48:00.000Z",
    direction: "inbound",
    tagIfMatched: false,
  },
  {
    gmailId: "demo_adjuster_1",
    threadId: "demo_adjuster",
    fromName: "Chris Lang",
    fromEmail: "chris.lang@summitadjusting.com",
    toEmail: OFFICE,
    subject: "Alvarez — supplement on ridge and ice barrier",
    body: "Elena, I can meet the supplement on the two ridge caps and ice & water. Send the photos from Friday and I’ll write it up this afternoon.",
    receivedAt: "2026-08-26T18:40:00.000Z",
    direction: "inbound",
    tagIfMatched: false,
  },
];

export function sampleGmailMessages(input: {
  accountId: string;
  contacts: Contact[];
  jobs: Job[];
  opportunities: Opportunity[];
}): GmailMessage[] {
  return SAMPLES.map((sample) => {
    const counterpart = sample.direction === "outbound" ? sample.toEmail : sample.fromEmail;
    const contact = contactForEmail(input.contacts, counterpart);
    const job = contact ? jobForContact(input.jobs, input.opportunities, contact.id) : undefined;
    const tagged = Boolean(sample.tagIfMatched && job);
    return {
      id: crypto.randomUUID(),
      accountId: input.accountId,
      gmailId: sample.gmailId,
      threadId: sample.threadId,
      fromName: sample.fromName,
      fromEmail: sample.fromEmail,
      toEmail: sample.toEmail,
      subject: sample.subject,
      snippet: sample.body.slice(0, 180),
      bodyText: sample.body,
      receivedAt: sample.receivedAt,
      direction: sample.direction,
      jobId: tagged ? job!.id : null,
      contactId: contact?.id ?? null,
    };
  });
}
