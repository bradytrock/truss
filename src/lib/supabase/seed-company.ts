import type { SupabaseClient } from "@supabase/supabase-js";
import { seedState } from "@/lib/seed";
import { insertOperations, wipeOperations } from "@/lib/supabase/ops-seed";
import { NORTHLINE_STAFF, NORTHLINE_TEAMS } from "@/lib/types";
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
  await supabase.from("teams").delete().eq("company_id", companyId);

  const { error: teamTableError } = await supabase.from("teams").insert(
    NORTHLINE_TEAMS.map((team) => ({
      id: remap(team.id, ids),
      company_id: companyId,
      name: team.name,
      lead_staff_id: null,
    }))
  );
  if (teamTableError) throw teamTableError;

  const { error: teamError } = await supabase.from("team_members").insert(
    NORTHLINE_STAFF.map((member) => ({
      id: remap(member.id, ids),
      company_id: companyId,
      name: member.name,
      title: member.title,
      role: member.role,
      team_id: member.teamId ? remap(member.teamId, ids) : null,
      initials: member.initials,
    }))
  );
  if (teamError) throw teamError;

  for (const team of NORTHLINE_TEAMS) {
    const { error: leadError } = await supabase
      .from("teams")
      .update({ lead_staff_id: remap(team.leadStaffId, ids) })
      .eq("id", remap(team.id, ids));
    if (leadError) throw leadError;
  }

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
      client_id: contact.clientId ? remap(contact.clientId, ids) : null,
      name: contact.name,
      title: contact.title,
      email: contact.email,
      phone: contact.phone,
      owner_staff_id: contact.ownerStaffId ? remap(contact.ownerStaffId, ids) : null,
      is_referral_partner: contact.isReferralPartner,
    }))
  );
  if (contactError) throw contactError;

  const { error: oppError } = await supabase.from("opportunities").insert(
    seed.opportunities.map((opportunity) => ({
      id: remap(opportunity.id, ids),
      company_id: companyId,
      name: opportunity.name,
      client_id: opportunity.clientId ? remap(opportunity.clientId, ids) : null,
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
      owner_staff_id: opportunity.ownerStaffId ? remap(opportunity.ownerStaffId, ids) : null,
      win_probability: opportunity.winProbability,
      next_step: opportunity.nextStep,
      lost_reason: opportunity.lostReason ?? null,
      created_at: opportunity.createdAt,
      code: opportunity.code,
    }))
  );
  if (oppError) throw oppError;

  const { error: jobError } = await supabase.from("jobs").insert(
    seed.jobs.map((job) => ({
      id: remap(job.id, ids),
      company_id: companyId,
      opportunity_id: job.opportunityId ? remap(job.opportunityId, ids) : null,
      name: job.name,
      client_id: job.clientId ? remap(job.clientId, ids) : null,
      primary_contact_id: job.primaryContactId ? remap(job.primaryContactId, ids) : null,
      status: job.status,
      contract_value: job.contractValue,
      start_date: job.startDate,
      substantial_completion: job.substantialCompletion,
      superintendent: job.superintendent,
      project_manager: job.projectManager,
      location: job.location,
      owner_staff_id: job.ownerStaffId ? remap(job.ownerStaffId, ids) : null,
      code: job.code,
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
