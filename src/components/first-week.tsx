"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useCrm } from "@/lib/crm-store";
import {
  ONBOARDING_TASK_LABELS,
  onboardingStep,
  onboardingTasksFromJson,
  openOnboardingTasks,
  type OnboardingTask,
} from "@/lib/invite-onboarding";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function FirstWeek() {
  const crm = useCrm();
  const [tasks, setTasks] = useState<Partial<Record<OnboardingTask, string>> | null>(null);
  const [show, setShow] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);

  const staffId = crm.user.staffId;
  const calendarLinked = crm.calendarAccounts.some(
    (account) => account.staffId === staffId && account.linked && account.source === "google",
  );
  const gmailLinked = crm.gmailAccounts.some((account) => account.staffId === staffId && account.linked);

  useEffect(() => {
    if (!crm.user.id) return;
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from("profiles")
      .select("onboarding_step, onboarding_tasks")
      .eq("id", crm.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (onboardingStep(data.onboarding_step) !== "done") return;
        setTasks(onboardingTasksFromJson(data.onboarding_tasks));
        setShow(true);
      });
    void fetch("/api/google/calendar/status")
      .then((response) => response.json())
      .then((body: { configured?: boolean }) => {
        if (!cancelled) setGoogleReady(Boolean(body.configured));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [crm.user.id]);

  useEffect(() => {
    if (!show) return;
    const supabase = createClient();
    if (calendarLinked && !tasks?.calendar) void supabase.rpc("mark_onboarding_task", { p_task: "calendar" });
    if (gmailLinked && !tasks?.gmail) void supabase.rpc("mark_onboarding_task", { p_task: "gmail" });
  }, [calendarLinked, gmailLinked, show, tasks?.calendar, tasks?.gmail]);

  if (!show || !tasks) return null;
  const merged = {
    ...tasks,
    ...(calendarLinked ? { calendar: tasks.calendar || "connected" } : {}),
    ...(gmailLinked ? { gmail: tasks.gmail || "connected" } : {}),
  };
  const open = openOnboardingTasks(merged, { calendar: googleReady, gmail: googleReady });
  if (open.length === 0) return null;

  const firstName = crm.user.name.split(/\s+/)[0] || "there";
  const lead = crm.opportunities[0];
  const job = crm.jobs[0];
  const hrefs: Partial<Record<OnboardingTask, string>> = {
    calendar: staffId ? `/api/google/calendar/connect?staffId=${encodeURIComponent(staffId)}&next=%2F` : "",
    gmail: staffId ? `/api/google/gmail/connect?staffId=${encodeURIComponent(staffId)}&next=%2F` : "",
    lead: lead ? `/opportunities/${lead.id}` : "",
    photo: job ? `/jobs/${job.id}` : "",
  };

  const visible = (["profile", "calendar", "gmail", "lead", "photo"] as const).filter((task) => {
    if (task === "calendar" || task === "gmail") return googleReady;
    return true;
  });

  return (
    <section className="rounded-sm border border-[#c9c9c9] bg-white px-5 py-6 shadow-[0_2px_2px_rgba(0,0,0,0.05)] sm:px-6">
      <h2 className="text-base font-semibold text-[#181818]">You&apos;re in, {firstName}.</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#706e6b]">
        Your first week is tracked here. Finish the open items when you have them.
      </p>
      <ul className="mt-4 grid gap-2">
        {visible.map((task) => {
          const done = Boolean(merged[task]);
          const href = hrefs[task];
          return (
            <li key={task} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  done ? "border-primary bg-primary text-primary-foreground" : "border-[#c9c9c9] text-transparent",
                )}
                aria-hidden
              >
                <Check className="size-3" />
              </span>
              {done || !href ? (
                <span className={cn(done ? "text-[#706e6b] line-through" : "text-[#181818]")}>
                  {ONBOARDING_TASK_LABELS[task]}
                </span>
              ) : (
                <a href={href} className="font-medium text-primary hover:underline">
                  {ONBOARDING_TASK_LABELS[task]}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
