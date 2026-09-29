import { NextResponse } from "next/server";
import { partitionGuestEmails } from "@/lib/calendar-invite";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  GoogleCalendarScopeError,
  updateGoogleCalendarEvent,
} from "@/lib/google-calendar";
import { accessTokenFor, credentialsForStaff } from "@/lib/google-calendar-server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

const CONNECT_WARNING =
  "Connect Google Calendar on this seat to email people outside the company. Open Calendar → Calendars & sharing.";

const RECONNECT_WARNING =
  "Reconnect Google Calendar so Truss can send invites. Disconnect, then Connect again and approve calendar access.";

type InviteBody = {
  staffId?: string;
  googleEventId?: string;
  cancel?: boolean;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  location?: string;
  notes?: string;
  guestEmails?: string[];
  sendUpdates?: "all" | "none";
};

function inviteResponse(input: {
  googleEventId: string;
  organizerStaffId: string | null;
  sent: string[];
  cancelled: boolean;
  truncated?: number;
  warning?: string;
}) {
  return NextResponse.json({
    googleEventId: input.googleEventId,
    organizerStaffId: input.organizerStaffId,
    sent: input.sent,
    cancelled: input.cancelled,
    truncated: input.truncated ?? 0,
    ...(input.warning ? { warning: input.warning } : {}),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as InviteBody | null;
  const staffId = body?.staffId?.trim() || "";
  if (!staffId) return NextResponse.json({ error: "Missing staffId." }, { status: 400 });

  const googleEventId = body?.googleEventId?.trim() || "";
  const guestEmails = Array.isArray(body?.guestEmails) ? body.guestEmails : [];
  let roster = { staffEmails: [] as string[], companyEmail: "" };

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401 });
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role, staff_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.company_id) {
      return NextResponse.json({ error: "No company on this seat." }, { status: 403 });
    }
    const signedInStaffId = (profile.staff_id as string | null)?.trim() ?? "";
    if (staffId !== signedInStaffId && profile.role !== "company_admin") {
      return NextResponse.json(
        { error: "This Google Calendar invite belongs to another seat." },
        { status: 403 },
      );
    }
    const [{ data: people, error: peopleError }, { data: company, error: companyError }] = await Promise.all([
      supabase.from("team_members").select("email").eq("company_id", profile.company_id),
      supabase.from("companies").select("email").eq("id", profile.company_id).maybeSingle(),
    ]);
    if (peopleError || companyError) {
      return inviteResponse({
        googleEventId,
        organizerStaffId: staffId,
        sent: [],
        cancelled: false,
        warning: "Could not check who is outside the company, so no Google invite was sent.",
      });
    }
    roster = {
      staffEmails: (people ?? []).map((person) => person.email),
      companyEmail: company?.email ?? "",
    };
  }

  const partition = partitionGuestEmails(guestEmails, roster);
  const outside = partition.outside;
  const shouldCancel = Boolean(body?.cancel) || outside.length === 0;

  if (shouldCancel && !googleEventId) {
    return inviteResponse({
      googleEventId: "",
      organizerStaffId: null,
      sent: [],
      cancelled: false,
    });
  }

  const tokens = await credentialsForStaff(staffId);
  if (!tokens?.accessToken && !tokens?.refreshToken) {
    return inviteResponse({
      googleEventId,
      organizerStaffId: googleEventId ? staffId : null,
      sent: [],
      cancelled: false,
      warning: outside.length || googleEventId ? CONNECT_WARNING : undefined,
    });
  }

  try {
    const token = await accessTokenFor(tokens);
    if (!token) {
      return inviteResponse({
        googleEventId,
        organizerStaffId: staffId,
        sent: [],
        cancelled: false,
        warning: CONNECT_WARNING,
      });
    }
    const sendUpdates: "all" | "none" = body?.sendUpdates === "none" ? "none" : "all";
    const event = {
      accessToken: token,
      calendarId: tokens.calendarId,
      title: body?.title?.trim() || "Event",
      startsAt: body?.startsAt || "",
      endsAt: body?.endsAt || "",
      location: body?.location || "",
      notes: body?.notes || "",
      attendeeEmails: outside,
      sendUpdates,
    };

    if (shouldCancel) {
      await deleteGoogleCalendarEvent({
        accessToken: token,
        calendarId: tokens.calendarId,
        googleEventId,
      });
      return inviteResponse({
        googleEventId: "",
        organizerStaffId: null,
        sent: [],
        cancelled: true,
      });
    }

    const existingId = googleEventId
      ? await updateGoogleCalendarEvent({ ...event, googleEventId })
      : null;
    const nextId =
      existingId ||
      (await createGoogleCalendarEvent(event));
    return inviteResponse({
      googleEventId: nextId,
      organizerStaffId: staffId,
      sent: outside,
      cancelled: false,
      truncated: partition.truncated,
    });
  } catch (error) {
    const warning =
      error instanceof GoogleCalendarScopeError
        ? RECONNECT_WARNING
        : error instanceof Error
          ? error.message
          : "Could not send the Google Calendar invite.";
    return inviteResponse({
      googleEventId,
      organizerStaffId: googleEventId ? staffId : null,
      sent: [],
      cancelled: false,
      warning,
    });
  }
}
