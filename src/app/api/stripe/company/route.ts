import { NextResponse } from "next/server";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { requestOrigin } from "@/lib/share-text";
import { emailCompanyAdminsStripeRevoke } from "@/lib/stripe-admin-email";
import {
  looksLikeStripeSecretKey,
  looksLikeStripeWebhookSecret,
  parseStripeStatus,
} from "@/lib/stripe-company";
import { createClient } from "@/lib/supabase/server";
import { isMissingCompanyStripe, missingCompanyStripeMessage } from "@/lib/supabase/schema-errors";
import { canManageSettings } from "@/lib/visibility";
import type { SeatRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await companyAdmin();
  if (!auth.ok) return auth.response;

  const status = await auth.supabase.rpc("stripe_company_status");
  if (status.error) {
    if (isMissingCompanyStripe(status.error)) {
      return NextResponse.json({ error: missingCompanyStripeMessage() }, { status: 400 });
    }
    return NextResponse.json({ error: status.error.message }, { status: 400 });
  }
  const parsed = parseStripeStatus(status.data);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 403 });
  }
  return NextResponse.json({
    ...parsed,
    webhookUrl: `${requestOrigin(request)}/api/stripe/webhook`,
  });
}

export async function POST(request: Request) {
  const auth = await companyAdmin();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | { action?: string; secretKey?: string; webhookSecret?: string }
    | null;
  const action = body?.action === "revoke" ? "revoke" : "save";

  if (action === "save") {
    const secretKey = typeof body?.secretKey === "string" ? body.secretKey.trim() : "";
    const webhookSecret = typeof body?.webhookSecret === "string" ? body.webhookSecret.trim() : "";
    if (!looksLikeStripeSecretKey(secretKey)) {
      return NextResponse.json(
        { error: "Paste a Stripe secret key that starts with sk_test_ or sk_live_." },
        { status: 400 },
      );
    }
    if (!looksLikeStripeWebhookSecret(webhookSecret)) {
      return NextResponse.json(
        { error: "Paste the webhook signing secret that starts with whsec_." },
        { status: 400 },
      );
    }
    const saved = await auth.supabase.rpc("stripe_company_set_keys", {
      p_secret_key: secretKey,
      p_webhook_secret: webhookSecret,
    });
    if (saved.error) {
      if (isMissingCompanyStripe(saved.error)) {
        return NextResponse.json({ error: missingCompanyStripeMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: saved.error.message }, { status: 400 });
    }
    const parsed = parseStripeStatus(saved.data);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    return NextResponse.json({
      ...parsed,
      webhookUrl: `${requestOrigin(request)}/api/stripe/webhook`,
    });
  }

  const requestedBy = auth.profile.full_name?.trim() || "A company admin";
  const revoked = await auth.supabase.rpc("stripe_company_request_revoke", {
    p_requested_by: requestedBy,
  });
  if (revoked.error) {
    if (isMissingCompanyStripe(revoked.error)) {
      return NextResponse.json({ error: missingCompanyStripeMessage() }, { status: 400 });
    }
    return NextResponse.json({ error: revoked.error.message }, { status: 400 });
  }
  const parsed = parseStripeStatus({ ...(asRecord(revoked.data) ?? {}), ok: true, connected: true });
  const row = asRecord(revoked.data);
  if (row?.ok === false) {
    return NextResponse.json(
      { error: typeof row.error === "string" ? row.error : "Could not start removal." },
      { status: 400 },
    );
  }

  const revokeAt = parsed.revokeAt;
  const revokeAtLabel = revokeAt
    ? new Date(revokeAt).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "in 24 hours";

  if (!row?.alreadyPending) {
    const [{ data: company }, { data: admins }] = await Promise.all([
      auth.supabase.from("companies").select("name, email").eq("id", auth.profile.company_id).maybeSingle(),
      auth.supabase
        .from("team_members")
        .select("name, email")
        .eq("company_id", auth.profile.company_id)
        .eq("role", "company_admin")
        .eq("locked", false),
    ]);
    const replyTo =
      auth.user.email?.trim() ||
      (typeof company?.email === "string" ? company.email.trim() : "") ||
      "";
    const recipients = (admins ?? []).filter((admin) => admin.email?.trim());
    const mailed = replyTo
      ? await emailCompanyAdminsStripeRevoke({
          company: company?.name?.trim() || "the company",
          requestedBy,
          revokeAtLabel,
          replyTo,
          admins: recipients,
        })
      : { sent: 0, failed: recipients.length, configured: false };
    return NextResponse.json({
      ...parsed,
      connected: true,
      emailed: mailed.sent,
      emailConfigured: mailed.configured,
      webhookUrl: `${requestOrigin(request)}/api/stripe/webhook`,
    });
  }

  return NextResponse.json({
    ...parsed,
    connected: true,
    webhookUrl: `${requestOrigin(request)}/api/stripe/webhook`,
  });
}

async function companyAdmin() {
  const supabase = await createClient();
  const { user, profile, error } = await loadProfileCompany(supabase);
  if (!user || !profile) {
    return { ok: false as const, response: NextResponse.json({ error: error || "Sign in to continue." }, { status: 401 }) };
  }
  const role = (profile.role as SeatRole | undefined) ?? "project_manager";
  if (!canManageSettings(role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Only a company admin can manage Stripe keys." }, { status: 403 }),
    };
  }
  return { ok: true as const, supabase, user, profile };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
