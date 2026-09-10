"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateOpportunityDialog } from "@/components/create-records";
import type { SeatRole, StaffMember } from "@/lib/types";

function onboardingCopy(role: SeatRole | undefined) {
  switch (role) {
    case "company_admin":
      return {
        title: "Get started with your first leads",
        description:
          "Your home shows pipeline, quota pacing, and today’s work once records exist. Import a list or create the first lead to populate this page.",
        action: "Import leads" as const,
      };
    case "team_lead":
    case "team_admin":
      return {
        title: "No leads in your team yet",
        description:
          "Team pipeline, quota, and desk lists appear here after the first lead is created. Add one to start tracking the book.",
        action: "Add your first lead" as const,
      };
    case "business_development":
      return {
        title: "No sourced leads yet",
        description:
          "ROI and agent activity need at least one lead in your book. Create the first record to open this dashboard.",
        action: "Add your first lead" as const,
      };
    case "accountant":
      return {
        title: "No jobs to post against yet",
        description:
          "Accounting tiles stay hidden until the field opens work. Ask a project manager to create the first lead.",
        action: null,
      };
    case "superintendent":
      return {
        title: "No production jobs yet",
        description:
          "Field work shows here after a lead is opened and handed to production. Create a lead if you take intake calls.",
        action: "Add your first lead" as const,
      };
    default:
      return {
        title: "No leads to work yet",
        description:
          "Pipeline, proposals, and today’s tasks stay hidden until you have at least one lead. Create the first record to unlock this home.",
        action: "Add your first lead" as const,
      };
  }
}

export function HomeOnboarding({ viewer }: { viewer: StaffMember | undefined }) {
  const [createOpen, setCreateOpen] = useState(false);
  const copy = onboardingCopy(viewer?.role);

  return (
    <>
      <section className="flex flex-col items-start gap-4 rounded-sm border border-[#c9c9c9] bg-white px-5 py-8 shadow-[0_2px_2px_rgba(0,0,0,0.05)] sm:flex-row sm:items-center sm:px-6">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[#0176d3]">
          <UserPlus className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-base font-semibold text-[#181818]">{copy.title}</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-[#706e6b]">{copy.description}</p>
        </div>
        {copy.action ? (
          <Button
            type="button"
            className="h-9 shrink-0 rounded-sm bg-[#0176d3] px-4 text-sm font-semibold text-white hover:bg-[#014486]"
            onClick={() => setCreateOpen(true)}
          >
            {copy.action}
          </Button>
        ) : null}
      </section>
      <CreateOpportunityDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
