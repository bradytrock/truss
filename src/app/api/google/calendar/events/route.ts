import { NextResponse } from "next/server";
import { listGoogleEvents } from "@/lib/google-calendar";
import { accessTokenFor, credentialsForStaff } from "@/lib/google-calendar-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const staffId = url.searchParams.get("staffId");
  const timeMin = url.searchParams.get("timeMin");
  const timeMax = url.searchParams.get("timeMax");
  if (!staffId || !timeMin || !timeMax) {
    return NextResponse.json({ error: "staffId, timeMin, and timeMax are required." }, { status: 400 });
  }

  try {
    const tokens = await credentialsForStaff(staffId);
    if (!tokens) {
      return NextResponse.json({ events: [] });
    }
    const token = await accessTokenFor(tokens);
    const events = await listGoogleEvents({
      accessToken: token,
      calendarId: tokens.calendarId,
      timeMin,
      timeMax,
    });
    return NextResponse.json({
      events: events.map((event) => ({
        ...event,
        staffId,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load Google events." },
      { status: 400 },
    );
  }
}
