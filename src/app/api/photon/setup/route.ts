import { NextResponse } from "next/server";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { syncOfficePhotonLine, verifyPhotonProject } from "@/lib/photon-server";
import { photonNotSetupMessage, photonWebhookUrl } from "@/lib/photon";
import { requestOrigin } from "@/lib/share-text";
import { createClient } from "@/lib/supabase/server";
import { isMissingPhoton, missingPhotonMessage, PHOTON_WEBHOOK_SQL } from "@/lib/supabase/schema-errors";
import type { SeatRole } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusPayload = {
  ok?: boolean;
  linked?: boolean;
  companyName?: string;
  projectId?: string;
  projectName?: string;
  secretHint?: string;
  linkedAt?: string | null;
  webhookToken?: string;
  error?: string;
};

function schemaResponse(error: { message?: string; code?: string } | null | undefined) {
  if (!isMissingPhoton(error)) return null;
  return NextResponse.json({ linked: false, sql: missingPhotonMessage() });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });

  const role = (profile.role as SeatRole | undefined) ?? "project_manager";
  if (!canManageSettings(role)) {
    return NextResponse.json({ error: "Only a company admin can view Photon settings." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("photon_company_status");
  const missing = schemaResponse(error);
  if (missing) return missing;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const status = (data ?? {}) as StatusPayload;
  if (status.ok === false) {
    return NextResponse.json({ error: status.error || "Could not load Photon." }, { status: 400 });
  }
  if (status.linked) await syncOfficePhotonLine().catch(() => undefined);
  const webhookToken = status.webhookToken ?? "";
  return NextResponse.json({
    linked: Boolean(status.linked),
    companyName: status.companyName ?? "",
    projectId: status.projectId ?? "",
    projectName: status.projectName ?? "",
    secretHint: status.secretHint ?? "",
    linkedAt: status.linkedAt ?? null,
    webhookUrl: photonWebhookUrl(requestOrigin(request), webhookToken),
    sql: webhookToken
      ? null
      : `Run ${PHOTON_WEBHOOK_SQL} in the SQL editor so this office gets its own inbound webhook.`,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });

  const role = (profile.role as SeatRole | undefined) ?? "project_manager";
  if (!canManageSettings(role)) {
    return NextResponse.json({ error: "Only a company admin can change Photon settings." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { projectId?: string; projectSecret?: string; disconnect?: boolean }
    | null;

  if (body?.disconnect) {
    const { data, error } = await supabase.rpc("photon_company_disconnect");
    if (error) {
      if (isMissingPhoton(error)) {
        return NextResponse.json({ error: missingPhotonMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const status = (data ?? {}) as StatusPayload;
    if (status.ok === false) {
      return NextResponse.json({ error: status.error || "Could not disconnect Photon." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, linked: false, companyName: status.companyName ?? "" });
  }

  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  const projectSecret = typeof body?.projectSecret === "string" ? body.projectSecret.trim() : "";
  if (projectSecret) {
    const verified = await verifyPhotonProject(projectId, projectSecret);
    if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: 400 });
    const { data, error } = await supabase.rpc("photon_company_save", {
      p_project_id: verified.projectId,
      p_project_secret: projectSecret,
      p_project_name: verified.projectName,
      p_secret_hint: verified.secretHint,
    });
    if (error) {
      if (isMissingPhoton(error)) {
        return NextResponse.json({ error: missingPhotonMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const status = (data ?? {}) as StatusPayload;
    if (status.ok === false) {
      return NextResponse.json({ error: status.error || "Could not save Photon." }, { status: 400 });
    }
    await syncOfficePhotonLine().catch(() => undefined);
    return NextResponse.json({
      ok: true,
      linked: true,
      companyName: status.companyName ?? "",
      projectId: status.projectId ?? verified.projectId,
      projectName: status.projectName ?? verified.projectName,
      secretHint: status.secretHint ?? verified.secretHint,
    });
  }

  const { data, error } = await supabase.rpc("photon_company_save", {
    p_project_id: projectId,
    p_project_secret: "",
    p_project_name: "",
    p_secret_hint: "",
  });
  if (error) {
    if (isMissingPhoton(error)) {
      return NextResponse.json({ error: missingPhotonMessage() }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const status = (data ?? {}) as StatusPayload;
  if (status.ok === false) {
    return NextResponse.json({ error: status.error || photonNotSetupMessage(status.companyName ?? "") }, { status: 400 });
  }
  if (status.linked) await syncOfficePhotonLine().catch(() => undefined);
  return NextResponse.json({
    ok: true,
    linked: Boolean(status.linked),
    companyName: status.companyName ?? "",
    projectId: status.projectId ?? projectId,
    projectName: status.projectName ?? "",
    secretHint: status.secretHint ?? "",
  });
}
