import type { SupabaseClient } from "@supabase/supabase-js";
import { seedState } from "@/lib/seed";
import { namesMatch } from "@/lib/seats";
import { insertOperations, wipeOperations } from "@/lib/supabase/ops-seed";
import { initialsFromName, NORTHLINE_STAFF, NORTHLINE_TEAMS, type SeatRole } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type PreserveSignedInStaff = {
  userId: string;
  name: string;
  title: string;
  role: SeatRole;
  initials?: string;
};

function remap(source: string, map: Map<string, string>) {
  const existing = map.get(source);
  if (existing) return existing;
  const next = crypto.randomUUID();
  map.set(source, next);
  return next;
}

export async function seedCompanyBook(
  supabase: Client,
  companyId: string,
  options?: { preserve?: PreserveSignedInStaff | null },
) {
  const ids = new Map<string, string>();
  const seed = structuredClone(seedState);

  await wipeOperations(supabase, companyId);
  const { error: wipeShares } = await supabase.from("calendar_shares").delete().eq("company_id", companyId);
  if (wipeShares && !wipeShares.message.includes("schema cache") && wipeShares.code !== "PGRST205") {
    throw wipeShares;
  }
  const { error: wipeCal } = await supabase.from("calendar_accounts").delete().eq("company_id", companyId);
  if (wipeCal && !wipeCal.message.includes("schema cache") && wipeCal.code !== "PGRST205") {
    throw wipeCal;
  }
  const { error: wipeTraining } = await supabase.from("training_progress").delete().eq("company_id", companyId);
  if (wipeTraining && !wipeTraining.message.includes("schema cache") && wipeTraining.code !== "PGRST205") {
    throw wipeTraining;
  }
  const { error: wipeBulletins } = await supabase.from("training_bulletins").delete().eq("company_id", companyId);
  if (wipeBulletins && !wipeBulletins.message.includes("schema cache") && wipeBulletins.code !== "PGRST205") {
    throw wipeBulletins;
  }
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

  const preserve = options?.preserve;
  if (preserve?.name.trim() && !NORTHLINE_STAFF.some((member) => namesMatch(member.name, preserve.name))) {
    const { data: preserved, error: preserveError } = await supabase
      .from("team_members")
      .insert({
        company_id: companyId,
        name: preserve.name.trim(),
        title: preserve.title.trim() || "Company admin",
        role: preserve.role || "company_admin",
        team_id: null,
        initials: preserve.initials || initialsFromName(preserve.name),
      })
      .select("id")
      .single();
    if (preserveError) throw preserveError;
    if (preserved && preserve.userId) {
      const { error: linkError } = await supabase
        .from("profiles")
        .update({ staff_id: preserved.id })
        .eq("id", preserve.userId);
      if (
        linkError &&
        linkError.code !== "PGRST204" &&
        !linkError.message.includes("staff_id") &&
        !linkError.message.includes("schema cache") &&
        !linkError.message.includes("Could not find the")
      ) {
        throw linkError;
      }
    }
  }

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
      lead_source: opportunity.leadSource ?? "",
      referral_contact_id: opportunity.referralContactId
        ? remap(opportunity.referralContactId, ids)
        : null,
      street: opportunity.street ?? "",
      city: opportunity.city ?? "",
      state: opportunity.state ?? "",
      postal_code: opportunity.postalCode ?? "",
      notes: opportunity.notes ?? "",
    }))
  );
  if (oppError) {
    const missing =
      oppError.message.includes("schema cache") ||
      oppError.code === "PGRST204" ||
      oppError.message.includes("lead_source") ||
      oppError.message.includes("Could not find the");
    if (!missing) throw oppError;
    const { error: retryError } = await supabase.from("opportunities").insert(
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
      })),
    );
    if (retryError) throw retryError;
  }

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

  const { error: calendarError } = await supabase.from("calendar_accounts").insert(
    seed.calendarAccounts.map((account) => ({
      company_id: companyId,
      staff_id: remap(account.staffId, ids),
      google_email: account.googleEmail,
      google_calendar_id: account.calendarId,
      linked: account.linked,
      linked_at: account.linkedAt,
      share_with_team: account.shareWithTeam,
      source: account.source,
    }))
  );
  if (calendarError && !calendarError.message.includes("schema cache") && calendarError.code !== "PGRST205") {
    throw calendarError;
  }

  const { error: shareError } = await supabase.from("calendar_shares").insert(
    seed.calendarShares.map((share) => ({
      company_id: companyId,
      owner_staff_id: remap(share.ownerStaffId, ids),
      viewer_staff_id: remap(share.viewerStaffId, ids),
    }))
  );
  if (shareError && !shareError.message.includes("schema cache") && shareError.code !== "PGRST205") {
    throw shareError;
  }

  const { error: trainingError } = await supabase.from("training_progress").insert(
    seed.trainingProgress.map((progress) => ({
      company_id: companyId,
      staff_id: remap(progress.staffId, ids),
      read: progress.read,
      badges: progress.badges,
      attempts: progress.attempts.map((attempt) => ({
        ...attempt,
        staffId: remap(attempt.staffId, ids),
      })),
    })),
  );
  if (trainingError && !trainingError.message.includes("schema cache") && trainingError.code !== "PGRST205") {
    throw trainingError;
  }

  const { error: bulletinError } = await supabase.from("training_bulletins").insert(
    seed.trainingBulletins.map((bulletin) => ({
      id: remap(bulletin.id, ids),
      company_id: companyId,
      title: bulletin.title,
      body: bulletin.body,
      author: bulletin.author,
      created_at: bulletin.createdAt,
    })),
  );
  if (bulletinError && !bulletinError.message.includes("schema cache") && bulletinError.code !== "PGRST205") {
    throw bulletinError;
  }

  await insertOperations(supabase, companyId, ids);
}
