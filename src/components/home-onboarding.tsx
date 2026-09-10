"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateOpportunityDialog } from "@/components/create-records";
import type { SeatRole, StaffMember } from "@/lib/types";

function onboardingCopy(role: SeatRole | undefined) {
  switch (role) {
    case "company_admin":
      return {
        title: "Bring in your book of work",
        description:
          "This home fills in once the company has leads. Start the first one — sold dollars, pipeline, and the desk list all follow from there.",
        action: "Import leads" as const,
      };
    case "team_lead":
    case "team_admin":
      return {
        title: "Your team’s book is empty",
        description:
          "When someone on the team opens a lead, pipeline and pacing show up here. Start the first one so the desk has something to chase.",
        action: "Add your first lead" as const,
      };
    case "business_development":
      return {
        title: "No sourced leads yet",
        description:
          "Your home tracks the agents you brought in and the jobs that followed. Open the first lead so ROI and pipeline have a place to land.",
        action: "Add your first lead" as const,
      };
    case "accountant":
      return {
        title: "Nothing to post yet",
        description:
          "Invoices and expenses show up after the field opens jobs. Ask a project manager to add the first lead, or wait for work to land in Accounting.",
        action: null,
      };
    case "superintendent":
      return {
        title: "No jobs on your board",
        description:
          "Field work appears here once a lead is opened and handed to production. Add the first lead if you take calls, or wait for the office to assign you.",
        action: "Add your first lead" as const,
      };
    default:
      return {
        title: "Your book is empty",
        description:
          "Pipeline, proposals, and today's desk all stay quiet until you have at least one lead. Open the first one and this page starts working.",
        action: "Add your first lead" as const,
      };
  }
}

export function HomeOnboarding({ viewer }: { viewer: StaffMember | undefined }) {
  const [createOpen, setCreateOpen] = useState(false);
  const copy = onboardingCopy(viewer?.role);

  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.05] via-background to-background">
        <CardHeader className="border-b">
          <CardTitle className="font-heading text-xl">{copy.title}</CardTitle>
          <CardDescription className="max-w-xl text-sm leading-relaxed">
            {copy.description}
          </CardDescription>
        </CardHeader>
        {copy.action ? (
          <CardContent className="pt-4">
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {copy.action}
            </Button>
          </CardContent>
        ) : null}
      </Card>
      <CreateOpportunityDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
