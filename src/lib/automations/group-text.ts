import { homeownersOnJob } from "@/lib/parties";
import { toE164 } from "@/lib/phone";
import type { Database } from "@/lib/supabase/database.types";
import type { Automation, AutomationAction } from "@/lib/automations/types";
import { workflowActionList, workflowOf } from "@/lib/automations/workflow";
import type { Contact, Job } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type JobPeople = Pick<Job, "primaryContactId" | "relatedContactIds" | "subcontractorIds">;

/** Distinct mobiles for the homeowners on a job. Trades and adjusters stay out. */
export function groupMessagePhones(job: JobPeople | null | undefined, contacts: Contact[]) {
  if (!job) return [];
  return distinctPhones(homeownersOnJob(job, contacts).map((contact) => contact.phone || ""));
}

export function distinctPhones(values: string[]) {
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const value of values) {
    const phone = toE164(value);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    phones.push(phone);
  }
  return phones;
}

export function automationSendsGroup(automation: Pick<Automation, "actions" | "triggerConfig">) {
  return groupActions(automation).length > 0;
}

export function sliceSendsGroup(actions: AutomationAction[]) {
  return actions.some((action) => action.kind === "send_sms" && action.to === "group");
}

function groupActions(automation: Pick<Automation, "actions" | "triggerConfig">) {
  const workflow = workflowOf(automation.triggerConfig);
  const actions = workflow ? workflowActionList(workflow, automation.actions) : automation.actions;
  return actions.filter((action) => action.kind === "send_sms" && action.to === "group");
}

export async function fetchAutomationGroupPhones(supabase: SupabaseClient<Database>, jobId: string) {
  if (!jobId) return { phones: [] as string[], error: "" };
  const { data, error } = await supabase.rpc("automation_job_phones", { p_job_id: jobId });
  if (error) {
    const missing =
      error.code === "PGRST202" ||
      error.code === "PGRST204" ||
      (error.message ?? "").includes("Could not find the function");
    return {
      phones: [] as string[],
      error: missing
        ? "Apply the latest automations migration before a group message can send."
        : error.message,
    };
  }
  const raw = Array.isArray(data) ? data : [];
  return {
    phones: distinctPhones(raw.flatMap((item) => (typeof item === "string" ? [item] : []))),
    error: "",
  };
}
