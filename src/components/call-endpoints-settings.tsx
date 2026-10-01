"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CallEndpointRow } from "@/lib/calls/types";
import type { StaffMember } from "@/lib/types";
import { formatPhoneInput } from "@/lib/phone";

export function CallEndpointsSettings({
  staff,
  currentStaffId,
  admin,
}: {
  staff: StaffMember[];
  currentStaffId: string;
  admin: boolean;
}) {
  const people = useMemo(
    () => staff.filter((member) => !member.locked).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [staff],
  );
  const [staffId, setStaffId] = useState(currentStaffId);
  const [endpoints, setEndpoints] = useState<CallEndpointRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload(id: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/calls/endpoints?staffId=${encodeURIComponent(id)}`);
      const data = (await response.json()) as { endpoints?: CallEndpointRow[]; error?: string };
      if (!response.ok) {
        toast.error(data.error || "Could not load endpoints.");
        setEndpoints([]);
        return;
      }
      setEndpoints(data.endpoints ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload(staffId);
  }, [staffId]);

  async function save(endpoint: CallEndpointRow, patch: Partial<CallEndpointRow>) {
    const response = await fetch("/api/calls/endpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffId,
        kind: endpoint.kind,
        phone: patch.phone ?? endpoint.phone,
        enabled: patch.enabled ?? endpoint.enabled,
        priority: patch.priority ?? endpoint.priority,
        ringTimeoutSeconds: patch.ringTimeoutSeconds ?? endpoint.ringTimeoutSeconds,
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(data.error || "Could not save endpoint.");
      return;
    }
    toast.success("Endpoint saved.");
    await reload(staffId);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ring endpoints</CardTitle>
        <CardDescription>
          Choose whether this seat rings on the web softphone, their cell via Photon SIP, and/or the
          mobile app (later). Queues use these flags when multi-ringing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {admin ? (
          <div className="space-y-2">
            <Label>Seat</Label>
            <Select value={staffId} onValueChange={(value) => setStaffId(value ?? currentStaffId)}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {people.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading endpoints…</p>
        ) : (
          <ul className="space-y-3">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="rounded-md border px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium capitalize">{endpoint.kind}</p>
                    <p className="text-xs text-muted-foreground">
                      {endpoint.kind === "cell"
                        ? "Outbound SIP through Photon to this cell"
                        : endpoint.kind === "app"
                          ? "Native app (uses the same control plane later)"
                          : "Browser softphone in Truss"}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={endpoint.enabled}
                      onCheckedChange={(value) => void save(endpoint, { enabled: Boolean(value) })}
                    />
                    Enabled
                  </label>
                </div>
                {endpoint.kind === "cell" ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div className="min-w-[12rem] flex-1 space-y-1">
                      <Label>Cell number</Label>
                      <PhoneInput
                        value={formatPhoneInput(endpoint.phone)}
                        onValueChange={(phone) =>
                          setEndpoints((rows) =>
                            rows.map((row) => (row.id === endpoint.id ? { ...row, phone } : row)),
                          )
                        }
                      />
                    </div>
                    <Button size="sm" onClick={() => void save(endpoint, { phone: endpoint.phone })}>
                      Save number
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
