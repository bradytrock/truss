import {
  BOOK_TITLE_ERROR,
  UPDATE_ERROR,
  appointmentRangeError,
  leadEditSeed,
  type BookAppointmentInput,
  type LeadAlert,
  type LeadEditSeed,
  type LeadSnapshot,
  type UpdateLeadInput,
} from "@/lib/lead-alerts";
import { storedPhone } from "@/lib/phone";
import {
  PROJECT_TYPES,
  type ActivityType,
  type Contact,
  type Job,
  type Opportunity,
  type ProjectType,
  type ScheduleEvent,
} from "@/lib/types";

export type LeadDetailWrite = {
  homeownerName: string;
  street: string;
  city: string;
  serviceType: string;
  phone: string;
};

type OpportunitySlice = {
  clientId: string | null;
  primaryContactId?: string;
  state?: string;
  postalCode?: string;
  projectType?: string;
  nextStep?: string;
  notes?: string;
  street?: string;
  city?: string;
};

type JobSlice = {
  id?: string;
  clientId: string | null;
  primaryContactId: string | null;
  opportunityId?: string | null;
  state?: string;
  postalCode?: string;
  projectType?: string;
  description?: string;
  street?: string;
  city?: string;
};

type ContactSlice = {
  name?: string;
  phone?: string;
  email?: string;
};

export type LeadFollowUpCrm = {
  getOpportunity: (id: string) => OpportunitySlice | undefined;
  getJob: (id: string) => JobSlice | undefined;
  getContact: (id: string | null | undefined) => ContactSlice | undefined;
  addScheduleEvent: (input: Omit<ScheduleEvent, "id">) => Promise<{ id: string }>;
  updateOpportunity: (id: string, patch: Partial<Opportunity>) => Promise<boolean>;
  updateJob: (id: string, patch: Partial<Job>) => Promise<boolean>;
  updateContact: (id: string, patch: Partial<Omit<Contact, "id">>) => Promise<boolean>;
  addActivity: (input: {
    entityType: "opportunity" | "job" | "client";
    entityId: string;
    type: ActivityType;
    body: string;
  }) => Promise<void>;
};

export function editSeedForLead(
  crm: Pick<LeadFollowUpCrm, "getOpportunity" | "getJob" | "getContact">,
  lead: LeadSnapshot,
): LeadEditSeed {
  const opportunity = lead.opportunity_id ? crm.getOpportunity(lead.opportunity_id) : undefined;
  const job = lead.job_id ? crm.getJob(lead.job_id) : undefined;
  const contactId = opportunity?.primaryContactId || job?.primaryContactId || "";
  const contact = contactId ? crm.getContact(contactId) : undefined;
  return leadEditSeed(lead, { contact, opportunity, job });
}

function knownText(current: string | undefined, next: string) {
  const value = next.trim();
  if (value || current !== undefined) return value;
  return undefined;
}

function projectTypeOrUndefined(serviceType: string): ProjectType | undefined {
  return (PROJECT_TYPES as readonly string[]).includes(serviceType) ? (serviceType as ProjectType) : undefined;
}

export async function bookLeadAppointment(
  crm: Pick<LeadFollowUpCrm, "getOpportunity" | "getJob" | "addScheduleEvent" | "addActivity">,
  alert: LeadAlert,
  input: BookAppointmentInput,
  assignee: string,
) {
  const title = input.title.trim();
  if (!title) throw new Error(BOOK_TITLE_ERROR);
  const problem = appointmentRangeError(input.date, input.startTime, input.endTime);
  if (problem) throw new Error(problem);
  const startsAt = new Date(`${input.date}T${input.startTime}:00`).toISOString();
  const endsAt = new Date(`${input.date}T${input.endTime}:00`).toISOString();
  const lead = alert.lead;
  const opportunity = lead.opportunity_id ? crm.getOpportunity(lead.opportunity_id) : undefined;
  const job = lead.job_id ? crm.getJob(lead.job_id) : undefined;
  await crm.addScheduleEvent({
    title,
    kind: input.kind,
    startsAt,
    endsAt,
    location: input.location.trim(),
    assignee: assignee.trim() || "You",
    opportunityId: lead.opportunity_id,
    jobId: lead.job_id,
    clientId: job?.clientId ?? opportunity?.clientId ?? null,
    notes: input.notes.trim(),
    guestEmails: [],
  });
  const entityId = lead.job_id || lead.opportunity_id;
  if (!entityId) return;
  const where = input.location.trim();
  try {
    await crm.addActivity({
      entityType: lead.job_id ? "job" : "opportunity",
      entityId,
      type: input.kind === "site_walk" ? "site_walk" : "meeting",
      body: `Booked ${title} on ${input.date} at ${input.startTime}${where ? ` · ${where}` : ""}.`,
    });
  } catch {
    // The appointment is already on the calendar.
  }
}

export async function saveLeadUpdate(
  crm: Pick<LeadFollowUpCrm, "getOpportunity" | "getJob" | "updateOpportunity" | "updateJob" | "updateContact" | "addActivity">,
  alert: LeadAlert,
  input: UpdateLeadInput,
  writeLead: (leadId: string, details: LeadDetailWrite) => Promise<LeadSnapshot>,
) {
  const lead = alert.lead;
  const opportunity = lead.opportunity_id ? crm.getOpportunity(lead.opportunity_id) : undefined;
  const job = lead.job_id ? crm.getJob(lead.job_id) : undefined;
  const contactId = opportunity?.primaryContactId || job?.primaryContactId || "";
  const homeowner = input.homeownerName.trim();
  const phone = storedPhone(input.phone);
  const email = input.email.trim();
  const street = input.street.trim();
  const city = input.city.trim();
  const state = knownText(opportunity?.state ?? job?.state, input.state);
  const postalCode = knownText(opportunity?.postalCode ?? job?.postalCode, input.postalCode);
  const serviceType = input.serviceType.trim();
  const projectType = projectTypeOrUndefined(serviceType);
  const nextStep = input.nextStep.trim();
  const notes = input.notes.trim();
  const place = {
    street,
    city,
    ...(state !== undefined ? { state } : {}),
    ...(postalCode !== undefined ? { postalCode } : {}),
    ...(projectType ? { projectType } : {}),
  };

  if (contactId) {
    const ok = await crm.updateContact(contactId, {
      ...(homeowner ? { name: homeowner } : {}),
      phone,
      ...(email ? { email } : {}),
    });
    if (!ok) throw new Error(UPDATE_ERROR);
  }

  if (lead.opportunity_id) {
    const ok = await crm.updateOpportunity(lead.opportunity_id, {
      ...place,
      ...(contactId || !homeowner ? {} : { name: homeowner }),
      ...(opportunity || nextStep ? { nextStep } : {}),
      ...(opportunity || notes ? { notes } : {}),
    });
    if (!ok) throw new Error(UPDATE_ERROR);
  }

  if (lead.job_id) {
    const ok = await crm.updateJob(lead.job_id, {
      ...place,
      ...(contactId || !homeowner ? {} : { name: homeowner }),
      ...(job || notes ? { description: notes } : {}),
    });
    if (!ok) throw new Error(UPDATE_ERROR);
  }

  const saved = await writeLead(lead.id, {
    homeownerName: homeowner,
    street,
    city,
    serviceType,
    phone,
  });

  const entityId = lead.job_id || lead.opportunity_id;
  if (entityId) {
    try {
      await crm.addActivity({
        entityType: lead.job_id ? "job" : "opportunity",
        entityId,
        type: "note",
        body: nextStep ? `Updated the lead. Next step: ${nextStep}.` : "Updated the lead.",
      });
    } catch {
      // The lead record already saved.
    }
  }
  return saved;
}
