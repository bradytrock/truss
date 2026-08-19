import type { SupabaseClient } from "@supabase/supabase-js";
import { seedState } from "@/lib/seed";
import { insertOperations, wipeOperations } from "@/lib/supabase/ops-seed";
import { TEAM } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

function remap(source: string, map: Map<string, string>) {
  const existing = map.get(source);
  if (existing) return existing;
  const next = crypto.randomUUID();
  map.set(source, next);
  return next;
}

export async function seedCompanyBook(supabase: Client, companyId: string) {
  const ids = new Map<string, string>();
  const seed = structuredClone(seedState);

  await wipeOperations(supabase, companyId);
  const { error: wipeActivities } = await supabase.from("activities").delete().eq("company_id", companyId);
  if (wipeActivities) throw wipeActivities;
  const { error: wipeTasks } = await supabase.from("tasks").delete().eq("company_id", companyId);
  if (wipeTasks) throw wipeTasks;
  const { error: wipeJobs } = await supabase.from("jobs").delete().eq("company_id", companyId);
  if (wipeJobs) throw wipeJobs;
  const { error: wipeOpps } = await supabase.from("opportunities").delete().eq("company_id", companyId);
  if (wipeOpps) throw wipeOpps;
  const { error: wipeContacts } = await supabase.from("contacts").delete().eq("company_id", companyId);
  if (wipeContacts) throw wipeContacts;
  const { error: wipeClients } = await supabase.from("clients").delete().eq("company_id", companyId);
  if (wipeClients) throw wipeClients;
  const { error: wipeTeam } = await supabase.from("team_members").delete().eq("company_id", companyId);
  if (wipeTeam) throw wipeTeam;

  const { error: teamError } = await supabase.from("team_members").insert(
    TEAM.map((name) => ({
      company_id: companyId,
      name,
      title:
        name === "Jordan Hale"
          ? "VP, Preconstruction"
          : name === "Tom Brennan"
            ? "Superintendent"
            : name.includes("Ortega") || name.includes("Voss")
              ? "Project manager"
              : "Estimator",
    }))
  );
  if (teamError) throw teamError;

  const { error: clientError } = await supabase.from("clients").insert(
    seed.clients.map((client) => ({
      id: remap(client.id, ids),
      company_id: companyId,
      name: client.name,
      type: client.type,
      city: client.city,
      state: client.state,
      notes: client.notes,
    }))
  );
  if (clientError) throw clientError;

  const { error: contactError } = await supabase.from("contacts").insert(
    seed.contacts.map((contact) => ({
      id: remap(contact.id, ids),
      company_id: companyId,
      client_id: remap(contact.clientId, ids),
      name: contact.name,
      title: contact.title,
      email: contact.email,
      phone: contact.phone,
    }))
  );
  if (contactError) throw contactError;

  const { error: oppError } = await supabase.from("opportunities").insert(
    seed.opportunities.map((opportunity) => ({
      id: remap(opportunity.id, ids),
      company_id: companyId,
      name: opportunity.name,
      client_id: remap(opportunity.clientId, ids),
      primary_contact_id: opportunity.primaryContactId
        ? remap(opportunity.primaryContactId, ids)
        : null,
      stage: opportunity.stage,
      value: opportunity.value,
      bid_due_at: opportunity.bidDueAt,
      pre_bid_walk_at: opportunity.preBidWalkAt,
      location: opportunity.location,
      project_type: opportunity.projectType,
      delivery_method: opportunity.deliveryMethod,
      estimator: opportunity.estimator,
      win_probability: opportunity.winProbability,
      next_step: opportunity.nextStep,
      lost_reason: opportunity.lostReason ?? null,
      created_at: opportunity.createdAt,
    }))
  );
  if (oppError) throw oppError;

  const { error: jobError } = await supabase.from("jobs").insert(
    seed.jobs.map((job) => ({
      id: remap(job.id, ids),
      company_id: companyId,
      opportunity_id: job.opportunityId ? remap(job.opportunityId, ids) : null,
      name: job.name,
      client_id: remap(job.clientId, ids),
      status: job.status,
      contract_value: job.contractValue,
      start_date: job.startDate,
      substantial_completion: job.substantialCompletion,
      superintendent: job.superintendent,
      project_manager: job.projectManager,
      location: job.location,
    }))
  );
  if (jobError) throw jobError;

  const { error: activityError } = await supabase.from("activities").insert(
    seed.activities.map((activity) => ({
      id: remap(activity.id, ids),
      company_id: companyId,
      entity_type: activity.entityType,
      entity_id: remap(activity.entityId, ids),
      type: activity.type,
      body: activity.body,
      author: activity.author,
      created_at: activity.createdAt,
    }))
  );
  if (activityError) throw activityError;

  const { error: taskError } = await supabase.from("tasks").insert(
    seed.tasks.map((task) => ({
      id: remap(task.id, ids),
      company_id: companyId,
      title: task.title,
      due_at: task.dueAt,
      completed: task.completed,
      related_type: task.relatedType,
      related_id: task.relatedId ? remap(task.relatedId, ids) : null,
      assignee: task.assignee,
    }))
  );
  if (taskError) throw taskError;

  await insertOperations(supabase, companyId, ids);
}
