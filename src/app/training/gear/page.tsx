"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { COURSE } from "@/lib/training/engine";

export default function GearPage() {
  const crm = useCrm();
  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Field school"
        title="Tools, gear, and what to carry"
        description="A field checklist from the course. It is not a purchasing spec — confirm what Northline stocks before you buy."
        actions={
          <Button nativeButton={false} variant="outline" render={<Link href="/training" />}>
            Back to training
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {COURSE.gear.map((group) => (
          <Card key={group.cat}>
            <CardHeader className="border-b">
              <CardTitle>
                <span className="mr-1.5" aria-hidden>
                  {group.icon}
                </span>
                {group.cat}
              </CardTitle>
              <CardDescription>
                {group.items.length} {group.items.length === 1 ? "item" : "items"}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
              <ul className="space-y-2.5">
                {group.items.map((item) => (
                  <li key={item.name}>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{item.note}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
