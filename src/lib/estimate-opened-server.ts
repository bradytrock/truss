import {
  estimateOpenedEmailSubject,
  estimateOpenedEmailText,
  estimateOpenedSms,
  parseEstimateOpenedNotify,
} from "@/lib/estimate-opened";
import { looksLikePhone } from "@/lib/phone";
import { formatResendFrom, isResendConfigured, sendResendEmail } from "@/lib/resend-mail";
import { sendOfficeText } from "@/lib/photon-server";
import { looksLikeEmail } from "@/lib/share-text";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import { isMissingEstimateOpenedNotify } from "@/lib/supabase/schema-errors";

export async function isSignedInOfficeSession() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

/** Log the open on the job and text/email the project manager. */
export async function notifyProjectManagerEstimateOpened(token: string) {
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("log_estimate_opened", { p_token: token });
    if (error) {
      if (!isMissingEstimateOpenedNotify(error)) {
        console.error("[share] log_estimate_opened", error.code, error.message);
      }
      return;
    }
    const notify = parseEstimateOpenedNotify(data);
    if (!notify) return;

    const sms = estimateOpenedSms(notify);
    if (looksLikePhone(notify.phone) && sms) {
      const sent = await sendOfficeText({ to: notify.phone, content: sms });
      if (!sent.ok) {
        console.error("[share] estimate opened text", sent.error);
      }
    }

    if (isResendConfigured() && looksLikeEmail(notify.email)) {
      const from = formatResendFrom({
        senderName: "Office",
        companyName: notify.companyName || "Truss",
      });
      const text = estimateOpenedEmailText(notify);
      const replyTo = looksLikeEmail(notify.companyEmail) ? notify.companyEmail : notify.email;
      const result = await sendResendEmail({
        to: notify.email,
        from,
        replyTo,
        subject: estimateOpenedEmailSubject(notify),
        text,
        html: `<p>${text
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll("\n", "<br/>")}</p>`,
      });
      if (!result.ok) {
        console.error("[share] estimate opened email", result.error);
      }
    }
  } catch (error) {
    console.error("[share] estimate opened notify threw", error);
  }
}
