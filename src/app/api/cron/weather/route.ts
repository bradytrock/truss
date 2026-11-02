import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/session-user";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { dispatchCompanyWeather } from "@/lib/weather/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (header === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("secret") === secret;
}

async function staffAuthorized() {
  try {
    const supabase = await createServerClient();
    const user = await readSessionUser(supabase);
    return Boolean(user);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!cronAuthorized(request) && !(await staffAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const url = getSupabaseUrl();
  if (!serviceKey || !url) {
    return NextResponse.json({
      ok: true,
      skipped: "SUPABASE_SERVICE_ROLE_KEY is not set. The map still loads live. Scheduled texts wait for that key.",
      companies: [],
    });
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.from("companies").select("id").limit(40);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const companies = [];
  for (const company of data ?? []) {
    try {
      companies.push(await dispatchCompanyWeather(supabase, company.id));
    } catch (err) {
      companies.push({
        companyId: company.id,
        texts: 0,
        mocked: 0,
        skipped: err instanceof Error ? err.message : "Weather dispatch failed.",
      });
    }
  }
  return NextResponse.json({ ok: true, companies });
}
