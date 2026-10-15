"use client";

import { useEffect } from "react";
import type { OnboardingTask } from "@/lib/invite-onboarding";
import { createClient } from "@/lib/supabase/client";

export function OnboardingMark({ task }: { task: OnboardingTask }) {
  useEffect(() => {
    const supabase = createClient();
    void supabase.rpc("mark_onboarding_task", { p_task: task });
  }, [task]);
  return null;
}
