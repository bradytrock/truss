"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { CommitInput } from "@/components/estimate-writer";
import { MaterialOrderItems } from "@/components/material-order-items";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VendorPicker } from "@/components/vendor-picker";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import { jobAddress } from "@/lib/job-record";
import type { MaterialOrderTemplate } from "@/lib/types";
import {
  materialOrderTemplateLinesFor,
  materialOrderTemplateTotal,
} from "@/lib/material-order-templates";
import { vendorChoices } from "@/lib/qb-vendors";
import { useStartMaterialOrder } from "@/lib/start-material-order";
import { isDeletedJob } from "@/lib/job-record";

export function MaterialOrderTemplateWriter({ template }: { template: MaterialOrderTemplate }) {
  const crm = useCrm();
  const router = useRouter();
  const { start, pending } = useStartMaterialOrder();
  const [jobOpen, setJobOpen] = useState(false);
  const [jobId, setJobId] = useState("");
  const lines = materialOrderTemplateLinesFor(template.id, crm.materialOrderTemplateLines ?? []);
  const total = materialOrderTemplateTotal(lines);
  const vendors = vendorChoices(crm.qbVendors ?? [], crm.expenses);
  const vendorNames = [...vendors.fromQb.map((item) => item.name), ...vendors.extras];
  const extraVendors = [
    ...(crm.materialOrders ?? []).map((item) => item.vendor.trim()),
    ...(crm.materialOrderTemplates ?? []).map((item) => item.vendor.trim()),
  ].filter(Boolean);
  const jobs = crm.jobs.filter((job) => !isDeletedJob(job));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Company template
          </p>
          <CommitInput
            className="font-heading h-auto border-0 bg-transparent px-0 text-[1.85rem] leading-[1.1] font-medium shadow-none focus-visible:ring-0"
            value={template.name}
            onCommit={(value) => {
              if (value.trim()) void crm.updateMaterialOrderTemplate(template.id, { name: value.trim() });
            }}
          />
          <CommitInput
            className="mt-1"
            value={template.description}
            placeholder="When the crew uses this — hail roof, kitchen water, bath remodel"
            onCommit={(value) => void crm.updateMaterialOrderTemplate(template.id, { description: value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/material-orders/templates" />}
          >
            All templates
          </Button>
          <Button type="button" disabled={pending} onClick={() => setJobOpen(true)}>
            New order
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void crm.removeMaterialOrderTemplate(template.id).then(() => {
                toast.success("Template removed.");
                router.push("/material-orders/templates");
              });
            }}
          >
            <Trash2 />
            Delete
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Starting an order copies these items, quantities, and unit costs onto that job. Changing the
        catalog later does not rewrite this template or orders already started from it.
      </p>

      <div className="rounded-md border bg-muted/40 px-4 py-3 sm:flex sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {lines.length} {lines.length === 1 ? "item" : "items"}
        </p>
        <p className="font-heading text-xl font-medium tabular-nums">{formatMoney(total)}</p>
      </div>

      <section className="grid gap-1.5">
        <Label>Default supplier</Label>
        <VendorPicker
          value={template.vendor}
          onChange={(value) => void crm.updateMaterialOrderTemplate(template.id, { vendor: value })}
          names={vendorNames}
          extraNames={extraVendors}
          emptyHint="Optional. Copied onto each new order."
        />
      </section>

      <MaterialOrderItems
        lines={lines}
        emptyHint="No items yet. Pull from the price book so estimated cost copies onto new orders, or add a custom line."
        onAddFromCatalog={(catalogItemId) =>
          crm.addMaterialOrderTemplateLineFromCatalog(template.id, catalogItemId)
        }
        onAddCustom={() => void crm.addCustomMaterialOrderTemplateLine(template.id)}
        onUpdate={(id, patch) => void crm.updateMaterialOrderTemplateLine(id, patch)}
        onRemove={(id) => void crm.removeMaterialOrderTemplateLine(id)}
      />

      <section className="grid gap-1.5">
        <Label htmlFor="mot-notes">Notes for the supplier</Label>
        <Textarea
          id="mot-notes"
          rows={3}
          value={template.notes}
          onChange={(event) => void crm.updateMaterialOrderTemplate(template.id, { notes: event.target.value })}
          placeholder="Will-call vs delivery, color, staging notes…"
        />
      </section>

      <Dialog open={jobOpen} onOpenChange={setJobOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start an order from this template</DialogTitle>
            <DialogDescription>
              The list copies onto that job. You can still add, drop, or change quantities after it
              opens.
            </DialogDescription>
          </DialogHeader>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No jobs in this seat’s book. Open a job from the board, then start a material order from
              the template there.
            </p>
          ) : (
            <div className="grid gap-1.5">
              <Label>Job</Label>
              <Select
                value={jobId || "none"}
                onValueChange={(value) => setJobId(value === "none" ? "" : String(value ?? ""))}
                items={[
                  { value: "none", label: "Select a job" },
                  ...jobs.map((job) => ({
                    value: job.id,
                    label: `${job.code ? `${job.code} · ` : ""}${job.name}`,
                  })),
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a job" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a job</SelectItem>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.code ? `${job.code} · ` : ""}
                      {job.name}
                      {jobAddress(job) ? ` · ${jobAddress(job)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setJobOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !jobId}
              onClick={() => {
                void start(jobId, template.id).then(() => setJobOpen(false));
              }}
            >
              {pending ? "Opening…" : "Start order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
