"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhoneInput } from "@/lib/phone";
import {
  JOB_RADIUS_DEFAULT,
  JOB_RADIUS_MAX,
  JOB_RADIUS_MIN,
  JOB_RADIUS_STEP,
  onboardingStep,
  phoneReady,
  radiusReady,
  timeZoneOptions,
  type OnboardingStep,
} from "@/lib/invite-onboarding";
import { createClient } from "@/lib/supabase/client";

export function InviteWelcome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<OnboardingStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [phone, setPhone] = useState("");
  const [radius, setRadius] = useState(JOB_RADIUS_DEFAULT);
  const [timeZone, setTimeZone] = useState("");
  const [zones, setZones] = useState<string[]>([...timeZoneOptions("")]);
  const [googleReady, setGoogleReady] = useState(false);
  const [calendarLinked, setCalendarLinked] = useState(false);
  const [gmailLinked, setGmailLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        router.replace(`/login?next=${encodeURIComponent("/welcome")}`);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_step, staff_id")
        .eq("id", userId)
        .maybeSingle();
      const nextStep = onboardingStep(profile?.onboarding_step);
      if (!nextStep || nextStep === "done") {
        router.replace("/");
        return;
      }
      const seatId = profile?.staff_id ?? "";
      let seatZone = "";
      if (seatId) {
        const { data: seat } = await supabase
          .from("team_members")
          .select("phone, job_radius_miles, time_zone")
          .eq("id", seatId)
          .maybeSingle();
        if (!cancelled && seat) {
          setPhone(formatPhoneInput(seat.phone ?? ""));
          if (typeof seat.job_radius_miles === "number" && radiusReady(seat.job_radius_miles)) {
            setRadius(seat.job_radius_miles);
          }
          if (seat.time_zone) seatZone = seat.time_zone;
        }
        const [{ data: calendars }, { data: mailboxes }] = await Promise.all([
          supabase.from("calendar_accounts").select("linked, source").eq("staff_id", seatId),
          supabase.from("gmail_accounts").select("linked").eq("staff_id", seatId),
        ]);
        if (!cancelled) {
          setCalendarLinked(Boolean(calendars?.some((row) => row.linked && row.source === "google")));
          setGmailLinked(Boolean(mailboxes?.some((row) => row.linked)));
        }
      }
      const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (!cancelled) {
        setZones(timeZoneOptions(browserZone));
        setTimeZone(seatZone || browserZone || "America/Denver");
        setStaffId(seatId);
        setStep(nextStep);
        setLoading(false);
      }
      const [calendarStatus, gmailStatus] = await Promise.all([
        fetch("/api/google/calendar/status").then((response) => response.json()).catch(() => ({})),
        fetch("/api/google/gmail/status").then((response) => response.json()).catch(() => ({})),
      ]);
      if (!cancelled) {
        setGoogleReady(Boolean(calendarStatus.configured || gmailStatus.configured));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const calendarOn = calendarLinked || searchParams.get("google") === "connected";
  const gmailOn = gmailLinked || searchParams.get("gmail") === "connected";

  useEffect(() => {
    const supabase = createClient();
    if (searchParams.get("google") === "connected") {
      void supabase.rpc("mark_onboarding_task", { p_task: "calendar" });
    }
    if (searchParams.get("gmail") === "connected") {
      void supabase.rpc("mark_onboarding_task", { p_task: "gmail" });
    }
  }, [searchParams]);

  async function onProfile(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!phoneReady(phone)) {
      setError("Enter a mobile phone number.");
      return;
    }
    if (!radiusReady(radius) || !timeZone.trim()) {
      setError("Choose how far you'll travel and a time zone.");
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase.rpc("save_invite_profile", {
        p_phone: phone,
        p_radius: radius,
        p_time_zone: timeZone,
      });
      if (saveError) {
        setError(saveError.message || "Could not save your profile.");
        return;
      }
      setStep("tools");
    } finally {
      setPending(false);
    }
  }

  async function onContinue() {
    setPending(true);
    try {
      const supabase = createClient();
      if (calendarOn) await supabase.rpc("mark_onboarding_task", { p_task: "calendar" });
      if (gmailOn) await supabase.rpc("mark_onboarding_task", { p_task: "gmail" });
      const { error: finishError } = await supabase.rpc("finish_invite_tools");
      if (finishError) {
        toast.error(finishError.message || "Could not finish setup.");
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (loading || !step) {
    return (
      <AuthFrame title="Set up your profile" description="Loading your seat.">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AuthFrame>
    );
  }

  if (step === "profile") {
    return (
      <AuthFrame
        title="Set up your profile"
        description="Phone, how far you'll travel for a job site, and the time zone you work in."
      >
        <form onSubmit={(event) => void onProfile(event)} className="grid gap-4">
          {error ? <p className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="phone">Mobile phone</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
              required
              placeholder="(303) 555-0140"
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="radius">Job site radius</Label>
              <span className="text-sm text-muted-foreground">{radius} miles</span>
            </div>
            <input
              id="radius"
              type="range"
              min={JOB_RADIUS_MIN}
              max={JOB_RADIUS_MAX}
              step={JOB_RADIUS_STEP}
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="zone">Time zone</Label>
            <select
              id="zone"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" nativeButton disabled={pending}>
            {pending ? "Saving…" : "Save and continue"}
          </Button>
        </form>
      </AuthFrame>
    );
  }

  const connect = (path: "calendar" | "gmail") =>
    staffId
      ? `/api/google/${path}/connect?staffId=${encodeURIComponent(staffId)}&next=${encodeURIComponent("/welcome")}`
      : "";

  return (
    <AuthFrame
      title="Connect your tools"
      description="Google Calendar and Gmail are optional. You can connect either one now, or later from the app."
    >
      <div className="grid gap-3">
        <ToolRow
          title="Google Calendar"
          detail={calendarOn ? "Connected" : googleReady ? "Not connected" : "Google isn't set up for this workspace yet."}
          href={googleReady && !calendarOn ? connect("calendar") : ""}
        />
        <ToolRow
          title="Gmail"
          detail={gmailOn ? "Connected" : googleReady ? "Not connected" : "Google isn't set up for this workspace yet."}
          href={googleReady && !gmailOn ? connect("gmail") : ""}
        />
        <Button type="button" nativeButton disabled={pending} onClick={() => void onContinue()}>
          {pending ? "Working…" : "Continue"}
        </Button>
      </div>
    </AuthFrame>
  );
}

function ToolRow({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-border px-3 py-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {href ? (
        <a href={href} className="text-sm font-medium text-primary hover:underline">
          Connect
        </a>
      ) : null}
    </div>
  );
}
