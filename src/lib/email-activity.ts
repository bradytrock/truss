import type { SupabaseClient } from "@supabase/supabase-js";
import { outboundEmailActivityBody } from "@/lib/email-status";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type LoggedJobEmail = {
  to: string;
  name: string;
  subject: string;
  resendId: string;
  emailStatus: string;
  error: string;
};

/** Write a job email activity from a server path that may not have a user session. */
export async function logJobEmailActivity(
  supabase: Client,
  input: {
    jobId: string;
    body: string;
    author: string;
    resendId?: string;
    emailStatus?: string;
  },
) {
  const jobId = input.jobId.trim();
  const body = input.body.trim();
  if (!jobId || !body) return;
  await supabase.rpc("log_job_email_activity", {
    p_job_id: jobId,
    p_body: body,
    p_author: input.author.trim() || "Truss",
    p_resend_id: input.resendId?.trim() ?? "",
    p_email_status: input.emailStatus?.trim() ?? "",
  });
}

export async function logAutomationEmail(
  supabase: Client,
  jobId: string,
  sent: LoggedJobEmail,
) {
  await logJobEmailActivity(supabase, {
    jobId,
    author: "Automation",
    resendId: sent.resendId,
    emailStatus: sent.emailStatus,
    body: outboundEmailActivityBody({
      name: sent.name || sent.to,
      to: sent.to,
      subject: sent.subject,
      error: sent.error,
      failed: sent.emailStatus === "failed",
    }),
  });
}
