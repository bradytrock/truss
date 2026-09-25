import { applyAutomationMerge, type Automation, type AutomationAction, type AutomationMergeContext } from "@/lib/automations";
import { sendResendEmail } from "@/lib/resend-mail";
import { sendText } from "@/lib/text-provider";

export type ExecuteActionResult = {
  ok: boolean;
  delivery: string;
  error: string;
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
  dryRun?: boolean;
}): Promise<ExecuteActionResult> {
  const notes: string[] = [];
  for (const action of input.automation.actions) {
    if (input.dryRun) {
      notes.push(`Would ${action.kind}`);
      continue;
    }
    const result = await runAction(action, input);
    if (!result.ok) return result;
    if (result.delivery) notes.push(result.delivery);
  }
  return { ok: true, delivery: notes.join(" · "), error: "" };
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
  },
): Promise<ExecuteActionResult> {
  const body = applyAutomationMerge(action.body ?? "", input.merge);
  const subject = applyAutomationMerge(action.subject ?? "", input.merge);
  const title = applyAutomationMerge(action.title ?? "Follow up", input.merge);
  const to = action.to ?? (action.kind === "notify_staff" ? "rep" : "customer");
  const staff = action.staffId ? input.staffById(action.staffId) : undefined;

  if (action.kind === "create_task") {
    if (!input.createTask) return { ok: false, delivery: "", error: "Could not create the task." };
    await input.createTask(title);
    return { ok: true, delivery: "Task created", error: "" };
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
      to === "customer" ? input.customerEmail : to === "staff" ? staff?.email : input.ownerEmail;
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
    to === "customer" ? input.customerPhone : to === "staff" ? staff?.phone : input.ownerPhone;
  if (!phone) return { ok: false, delivery: "", error: "No mobile number for that recipient." };
  const result = await sendText({ to: phone, content: body });
  if (!result.ok) return { ok: false, delivery: "", error: result.error };
  return { ok: true, delivery: result.mocked ? "Text mocked" : "Text sent", error: "" };
}
