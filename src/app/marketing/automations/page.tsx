"use client";

import { useState } from "react";
import { SuiteCard, SuitePage, SuiteTitle } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { saveFlows, useFlows, type MarketingFlow } from "@/lib/marketing/suite-prefs";
import { cn } from "@/lib/utils";

export default function AutomationsPage() {
  const crm = useCrm();
  const companyId = crm.user.companyId || "local";
  const flows = useFlows(companyId);
  const [activeId, setActiveId] = useState("");
  const flow = flows.find((item) => item.id === activeId) ?? flows[0];

  function update(next: MarketingFlow[]) {
    saveFlows(companyId, next);
  }

  return (
    <SuitePage className="max-w-[1240px]">
      <SuiteTitle
        title="Automations"
        description="Emails, texts, and rep tasks that run when something happens in the CRM. Turning a flow on saves it here. Delivery still goes through Quick send until the flow is connected to a trigger."
        action={
          <Button
            type="button"
            onClick={() => {
              const created: MarketingFlow = {
                id: crypto.randomUUID(),
                name: "New automation",
                summary: "Describe when it should start",
                active: false,
                steps: [{ id: crypto.randomUUID(), kind: "trigger", title: "Choose a trigger", detail: "Job, inspection, or estimate" }],
              };
              update([created, ...flows]);
              setActiveId(created.id);
            }}
          >
            New automation
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2">
          {flows.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className={cn("w-full rounded-xl border px-3 py-3 text-left", item.id === flow?.id ? "border-[#1c1b1a] bg-white" : "border-[#e7e4df] bg-white/70")}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.name}</span>
                <span className={cn("text-[10px] tracking-wide uppercase", item.active ? "text-emerald-700" : "text-[#8a8680]")}>{item.active ? "On" : "Off"}</span>
              </span>
              <span className="mt-1 block text-xs text-[#6f6a64]">{item.summary}</span>
            </button>
          ))}
        </div>
        {flow ? (
          <SuiteCard className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-2xl font-medium">{flow.name}</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={flow.active}
                  onChange={(event) => update(flows.map((item) => (item.id === flow.id ? { ...item, active: event.target.checked } : item)))}
                />
                Active
              </label>
            </div>
            <div className="mx-auto flex max-w-md flex-col items-stretch gap-3">
              {flow.steps.map((step) => (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-lg border px-3 py-3 text-sm",
                    step.kind === "trigger" && "border-[#1c1b1a] bg-[#1c1b1a] text-white",
                    step.kind === "exit" && "border-emerald-200 bg-emerald-50",
                    step.kind === "wait" && "border-dashed text-center text-[#6f6a64]",
                  )}
                >
                  <p className="text-[10px] tracking-[0.14em] uppercase opacity-70">{step.kind}</p>
                  <p className="font-medium">{"title" in step ? step.title : `Wait ${step.kind === "wait" ? step.days : ""} days`}</p>
                  {"detail" in step ? <p className="mt-1 text-xs opacity-80">{step.detail}</p> : null}
                </div>
              ))}
            </div>
          </SuiteCard>
        ) : null}
      </div>
    </SuitePage>
  );
}
