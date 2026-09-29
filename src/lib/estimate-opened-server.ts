import {
  estimateOpenedEmailSubject,
  estimateOpenedEmailText,
  estimateOpenedSms,
  estimateOpenedWho,
  parseEstimateOpenedNotify,
} from "@/lib/estimate-opened";
import {
  emailTemplateHasOverride,
  resolveSystemEmail,
  systemEmailHtml,
  systemEmailText,
} from "@/lib/email-templates";
import { loadCompanyEmailTemplates } from "@/lib/email-templates-server";
import { firstName } from "@/lib/phone";
import { looksLikePhone } from "@/lib/phone";
import { formatResendFrom, isResendConfigured, sendResendEmail } from "@/lib/resend-mail";
import { sendblueText } from "@/lib/sendblue";
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
      const sent = await sendblueText({ to: notify.phone, content: sms });
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
      const subject = estimateOpenedEmailSubject(notify);
      const templates = await loadCompanyEmailTemplates(supabase, notify.companyId);
      const custom = emailTemplateHasOverride(templates, "estimate_opened")
        ? resolveSystemEmail("estimate_opened", templates, {
            name: firstName(notify.name),
            company: notify.companyName,
            who: estimateOpenedWho(notify.contactName),
            label: notify.estimateNumber || notify.estimateName || "the proposal",
            address: notify.address,
            number: notify.estimateNumber,
            subject,
            message: text,
          })
        : null;
      const replyTo = looksLikeEmail(notify.companyEmail) ? notify.companyEmail : notify.email;
      const result = await sendResendEmail({
        to: notify.email,
        from,
        replyTo,
        subject: custom?.subject || subject,
        text: custom
          ? systemEmailText({ headline: custom.headline, message: custom.message })
          : text,
        html: custom
          ? systemEmailHtml({ headline: custom.headline, message: custom.message, button: custom.button })
          : `<p>${text
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
