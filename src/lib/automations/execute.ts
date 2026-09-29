import { applyAutomationMerge, type Automation, type AutomationAction, type AutomationMergeContext } from "@/lib/automations";
import { resolveJobValue } from "@/lib/automations/job-effects";
import { sendResendEmail } from "@/lib/resend-mail";
import { sendblueText } from "@/lib/sendblue";
import type { WorkColumn } from "@/lib/work-board";

export type ExecuteActionResult = {
  ok: boolean;
  delivery: string;
  error: string;
  stageChanged?: WorkColumn | null;
};

export async function executeAutomationActions(input: {
  automation: Automation;
  merge: AutomationMergeContext;
  customerPhone?: string;
  customerEmail?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  staffById: (id: string) => { phone?: string; email?: string; name?: string } | undefined;
  createTask?: (title: string) => Promise<void>;
  setJobValue?: (amount: number) => Promise<void>;
  setJobStage?: (stage: WorkColumn) => Promise<boolean | void>;
  addNote?: (body: string) => Promise<void>;
  estimateTotal?: number | null;
  dryRun?: boolean;
}): Promise<ExecuteActionResult> {
  const notes: string[] = [];
  let stageChanged: WorkColumn | null = null;
  for (const action of input.automation.actions) {
    if (input.dryRun) {
      notes.push(`Would ${action.kind}`);
      continue;
    }
    const result = await runAction(action, input);
    if (!result.ok) return result;
    if (result.stageChanged) stageChanged = result.stageChanged;
    if (result.delivery) notes.push(result.delivery);
  }
  return { ok: true, delivery: notes.join(" · "), error: "", stageChanged };
}

async function runAction(
  action: AutomationAction,
  input: {
    merge: AutomationMergeContext;
    customerPhone?: string;
    customerEmail?: string;
    ownerPhone?: string;
    ownerEmail?: string;
    staffById: (id: string) => { phone?: string; email?: string; name?: string } | undefined;
    createTask?: (title: string) => Promise<void>;
    setJobValue?: (amount: number) => Promise<void>;
    setJobStage?: (stage: WorkColumn) => Promise<boolean | void>;
    addNote?: (body: string) => Promise<void>;
    estimateTotal?: number | null;
  },
): Promise<ExecuteActionResult> {
  const body = applyAutomationMerge(action.body ?? "", input.merge);
  const subject = applyAutomationMerge(action.subject ?? "", input.merge);
  const title = applyAutomationMerge(action.title ?? "Follow up", input.merge);
  const to = action.to ?? (action.kind === "notify_staff" ? "rep" : "customer");
  const staff = action.staffId ? input.staffById(action.staffId) : undefined;

  if (action.kind === "create_task") {
    if (!input.createTask) return { ok: false, delivery: "", error: "Could not create the task." };
    try {
      await input.createTask(title);
    } catch (error) {
      return { ok: false, delivery: "", error: error instanceof Error ? error.message : "Could not create the task." };
    }
    return { ok: true, delivery: "Task created", error: "" };
  }

  if (action.kind === "add_note") {
    if (!input.addNote) return { ok: false, delivery: "", error: "Could not add the note." };
    try {
      await input.addNote(body);
    } catch (error) {
      return { ok: false, delivery: "", error: error instanceof Error ? error.message : "Could not add the note." };
    }
    return { ok: true, delivery: "Note added", error: "" };
  }

  if (action.kind === "set_job_value") {
    const resolved = resolveJobValue(action, input.estimateTotal ?? null);
    if (!resolved.ok) return { ok: false, delivery: "", error: resolved.error };
    if (!input.setJobValue) return { ok: false, delivery: "", error: "Could not update the job value." };
    try {
      await input.setJobValue(resolved.amount);
    } catch (error) {
      return { ok: false, delivery: "", error: error instanceof Error ? error.message : "Could not update the job value." };
    }
    return { ok: true, delivery: `Job value set to ${resolved.amount}`, error: "" };
  }

  if (action.kind === "set_job_stage") {
    const stage = action.stage;
    if (!stage) return { ok: false, delivery: "", error: "Pick a stage." };
    if (!input.setJobStage) return { ok: false, delivery: "", error: "Could not move the job." };
    try {
      const moved = await input.setJobStage(stage);
      if (moved === false) return { ok: true, delivery: `Job is already in ${stage}`, error: "", stageChanged: null };
    } catch (error) {
      return { ok: false, delivery: "", error: error instanceof Error ? error.message : "Could not move the job." };
    }
    return { ok: true, delivery: `Job moved to ${stage}`, error: "", stageChanged: stage };
  }

  if (action.kind === "webhook") {
    const url = action.url?.trim() ?? "";
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body, merge: input.merge }),
      });
      if (!response.ok) {
        return { ok: false, delivery: "", error: `Webhook returned ${response.status}.` };
      }
      return { ok: true, delivery: "Webhook sent", error: "" };
    } catch (error) {
      return { ok: false, delivery: "", error: error instanceof Error ? error.message : "Webhook failed." };
    }
  }

  if (action.kind === "send_email") {
    const email =
      to === "email"
        ? action.email
        : to === "customer"
          ? input.customerEmail
          : to === "staff"
            ? staff?.email
            : input.ownerEmail;
    if (!email) return { ok: false, delivery: "", error: "No email address for that recipient." };
    const result = await sendResendEmail({
      to: email,
      subject: subject || "A note from your contractor",
      text: body,
      html: `<p>${body.replace(/\n/g, "<br/>")}</p>`,
      replyTo: input.ownerEmail,
    });
    if (!result.ok) return { ok: false, delivery: "", error: result.error };
    return { ok: true, delivery: result.mocked ? "Email mocked" : "Email sent", error: "" };
  }

  const phone =
    to === "phone"
      ? action.phone
      : to === "customer"
        ? input.customerPhone
        : to === "staff"
          ? staff?.phone
          : input.ownerPhone;
  if (!phone) return { ok: false, delivery: "", error: "No mobile number for that recipient." };
  const result = await sendblueText({ to: phone, content: body });
  if (!result.ok) return { ok: false, delivery: "", error: result.error };
  return { ok: true, delivery: result.mocked ? "Text mocked" : "Text sent", error: "" };
}
