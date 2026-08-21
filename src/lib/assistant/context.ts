import { isDeletedJob } from "@/lib/job-record";
import { formatCurrency } from "@/lib/format";
import type { AssistantContext, AssistantIndexItem } from "@/lib/assistant/types";
import type { Contact, Estimate, Invoice, Job, SeatRole } from "@/lib/types";

function item(id: string, label: string, detail?: string): AssistantIndexItem {
  return { id, label, detail };
}

export function buildAssistantContext(input: {
  companyName: string;
  seatName: string;
  seatRole: SeatRole;
  path: string;
  hasAttachment: boolean;
  jobs: Job[];
  contacts: Contact[];
  estimates: Estimate[];
  invoices: Invoice[];
}): AssistantContext {
  const jobs = input.jobs
    .filter((job) => !isDeletedJob(job))
    .slice(0, 40)
    .map((job) =>
      item(job.id, job.code ? `${job.code} ${job.name}` : job.name, job.location),
    );
  const contacts = [...input.contacts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 30)
    .map((contact) => item(contact.id, contact.name, contact.title || contact.phone || contact.email));
  const estimates = [...input.estimates]
    .slice(0, 15)
    .map((estimate) => item(estimate.id, `${estimate.number} ${estimate.name}`, estimate.status));
  const invoices = [...input.invoices]
    .slice(0, 15)
    .map((invoice) => item(invoice.id, `${invoice.number} ${invoice.name}`, invoice.status));

  return {
    companyName: input.companyName,
    seatName: input.seatName,
    seatRole: input.seatRole,
    path: input.path,
    today: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    hasAttachment: input.hasAttachment,
    jobs,
    contacts,
    estimates,
    invoices,
  };
}

export function money(value: number) {
  return formatCurrency(value);
}
