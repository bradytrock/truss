"use client";

import Link from "next/link";
import { PenLine, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RoofMeasureEntry({
  jobId,
  disabled,
  embedded = false,
}: {
  jobId: string;
  disabled?: boolean;
  embedded?: boolean;
}) {
  const measure = disabled ? null : (
    <Button
      nativeButton={false}
      size="sm"
      variant="outline"
      className="bg-card"
      render={<Link href={`/jobs/${jobId}/measure`} />}
    >
      {embedded ? null : <Ruler data-icon="inline-start" />}
      Measure
    </Button>
  );

  if (embedded) {
    return (
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-primary">
          <PenLine className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Trace it yourself</p>
          <p className="text-sm text-muted-foreground">
            Drop a pin on the house, pull the satellite photo and trace the planes.
          </p>
        </div>
        {measure}
      </div>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Roof measurement</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Drop a pin on the house, then pull a Google satellite photo and trace the planes. EagleView stays one click away inside the editor.
          </p>
        </div>
        {measure}
      </div>
    </section>
  );
}
