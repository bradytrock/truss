"use client";

import Link from "next/link";
import { Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RoofMeasureEntry({ jobId, disabled }: { jobId: string; disabled?: boolean }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Roof measurement</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Drop a pin on the house, then pull a Google satellite photo and trace the planes. EagleView stays one click away inside the editor.
          </p>
        </div>
        {disabled ? null : (
          <Button nativeButton={false} size="sm" render={<Link href={`/jobs/${jobId}/measure`} />}>
            <Ruler data-icon="inline-start" />
            Measure
          </Button>
        )}
      </div>
    </section>
  );
}
