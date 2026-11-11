import { appOrigin } from "@/lib/app-origin";
import {
  estimateOpenedAddress,
  estimateOpenedEmailSubject,
  estimateOpenedEmailText,
  estimateOpenedSms,
  estimateOpenedWho,
  parseEstimateOpenedNotify,
} from "@/lib/estimate-opened";
import {
  estimateOpenedAmountLabel,
  estimateOpenedEmailLinks,
  formatEstimateOpenedAt,
  renderEstimateOpenedEmailHtml,
} from "@/lib/estimate-opened-email";
import { resolveSystemEmail, systemEmailText } from "@/lib/email-templates";
import { loadCompanyEmailTemplates } from "@/lib/email-templates-server";
import { resolveStoredFileUrl } from "@/lib/storage/urls";
import { firstName, looksLikePhone } from "@/lib/phone";
import { formatResendFrom, isResendConfigured, sendResendEmail } from "@/lib/resend-mail";
import { sendOfficeText } from "@/lib/photon-server";
import { looksLikeEmail } from "@/lib/share-text";
import { createAnonClient } from "@/lib/supabase/anon";
import { readSessionUser } from "@/lib/session-user";
import { createClient } from "@/lib/supabase/server";
import { isMissingEstimateOpenedNotify } from "@/lib/supabase/schema-errors";

export async function isSignedInOfficeSession() {
  try {
    const supabase = await createClient();
    const user = await readSessionUser(supabase);
    return Boolean(user);
  } catch {
    return false;
  }
}

function openedLogoUrl(notify: {
  cardLogoUrl?: string;
  cardLogoStoragePath?: string;
  companyLogoUrl?: string;
  companyLogoStoragePath?: string;
}) {
  const candidates = [
    { storagePath: notify.cardLogoStoragePath, url: notify.cardLogoUrl },
    { storagePath: notify.companyLogoStoragePath, url: notify.companyLogoUrl },
  ];
  for (const candidate of candidates) {
    if (!candidate.storagePath?.trim() && !candidate.url?.trim()) continue;
    const resolved = resolveStoredFileUrl({
      storagePath: candidate.storagePath,
      url: candidate.url,
      kind: "company-assets",
    });
    if (resolved.trim()) return resolved;
  }
  return "";
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
      const now = new Date();
      const origin = await appOrigin();
      const links = estimateOpenedEmailLinks(notify, origin);
      const amount = estimateOpenedAmountLabel(notify);
      const openedAt = formatEstimateOpenedAt(
        notify.openedAt,
        notify.staffTimeZone || notify.viewerTimeZone,
        now,
      );
      const text = estimateOpenedEmailText(notify, {
        amount,
        openCount: Math.max(1, notify.openCount || 0),
        proposalUrl: links.proposalUrl,
        jobUrl: links.jobUrl,
      });
      const subject = estimateOpenedEmailSubject(notify);
      const templates = await loadCompanyEmailTemplates(supabase, notify.companyId);
      const stored = templates?.estimate_opened ?? {};
      const custom = resolveSystemEmail("estimate_opened", templates, {
        name: firstName(notify.name),
        company: notify.companyName,
        who: estimateOpenedWho(notify.contactName),
        label: notify.estimateNumber || notify.estimateName || "the proposal",
        address: estimateOpenedAddress(notify).full || notify.address,
        number: notify.estimateNumber,
        subject,
        message: text,
        openedAt,
        job: notify.jobCode,
        amount,
      });
      const replyTo = looksLikeEmail(notify.companyEmail) ? notify.companyEmail : notify.email;
      const plain = stored.message?.trim()
        ? [
            systemEmailText({
              headline: stored.headline?.trim() ? custom.headline : "",
              message: custom.message,
            }),
            links.proposalUrl,
            links.jobUrl,
          ]
            .filter(Boolean)
            .join("\n\n")
        : text;
      const result = await sendResendEmail({
        to: notify.email,
        from,
        replyTo,
        subject: stored.subject?.trim() ? custom.subject : subject,
        text: plain,
        html: renderEstimateOpenedEmailHtml({
          notify,
          origin,
          logoUrl: openedLogoUrl(notify),
          headline: stored.headline?.trim() ? custom.headline : undefined,
          message: stored.message?.trim() ? custom.message : undefined,
          button: stored.button?.trim() ? custom.button : undefined,
          now,
        }),
      });
      if (!result.ok) {
        console.error("[share] estimate opened email", result.error);
      }
    }
  } catch (error) {
    console.error("[share] estimate opened notify threw", error);
  }
}
