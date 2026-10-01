"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CallQueueRow, CallRouteRow } from "@/lib/calls/types";
import type { StaffMember } from "@/lib/types";
import { formatPhoneInput } from "@/lib/phone";

export function CallingRoutingSettings({ staff }: { staff: StaffMember[] }) {
  const people = useMemo(
    () => staff.filter((member) => !member.locked).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [staff],
  );
  const [queues, setQueues] = useState<CallQueueRow[]>([]);
  const [routes, setRoutes] = useState<CallRouteRow[]>([]);
  const [queueName, setQueueName] = useState("Front desk");
  const [queueFallback, setQueueFallback] = useState<"none" | "missed_log" | "voice_agent">("missed_log");
  const [fallbackStaffId, setFallbackStaffId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [routeMatch, setRouteMatch] = useState("");
  const [routeTargetType, setRouteTargetType] = useState<"queue" | "staff">("queue");
  const [routeQueueId, setRouteQueueId] = useState("");
  const [routeStaffId, setRouteStaffId] = useState("");

  async function reload() {
    const [queueRes, routeRes] = await Promise.all([
      fetch("/api/calls/queues"),
      fetch("/api/calls/routes"),
    ]);
    const queueData = (await queueRes.json()) as { queues?: CallQueueRow[]; error?: string };
    const routeData = (await routeRes.json()) as { routes?: CallRouteRow[]; error?: string };
    if (!queueRes.ok) toast.error(queueData.error || "Could not load queues.");
    if (!routeRes.ok) toast.error(routeData.error || "Could not load routes.");
    setQueues(queueData.queues ?? []);
    setRoutes(routeData.routes ?? []);
    if (!routeQueueId && queueData.queues?.[0]?.id) setRouteQueueId(queueData.queues[0].id);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function saveQueue() {
    const response = await fetch("/api/calls/queues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: queueName,
        fallback: queueFallback,
        fallbackVoiceAgentStaffId: queueFallback === "voice_agent" ? fallbackStaffId || null : null,
        members: memberIds.map((staffId) => ({
          staffId,
          useSoftphone: true,
          useCell: true,
          useApp: true,
        })),
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(data.error || "Could not save queue.");
      return;
    }
    toast.success("Queue saved.");
    await reload();
  }

  async function saveRoute() {
    const response = await fetch("/api/calls/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchNumber: routeMatch,
        targetType: routeTargetType,
        targetQueueId: routeTargetType === "queue" ? routeQueueId : null,
        targetStaffId: routeTargetType === "staff" ? routeStaffId : null,
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      toast.error(data.error || "Could not save route.");
      return;
    }
    toast.success("Route saved.");
    setRouteMatch("");
    await reload();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ring queues</CardTitle>
          <CardDescription>
            Simultaneous ring across each member&apos;s enabled softphone, cell, and app endpoints.
            First answer cancels the rest.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="queue-name">Queue name</Label>
            <Input id="queue-name" value={queueName} onChange={(e) => setQueueName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Members</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {people.map((member) => {
                const checked = memberIds.includes(member.id);
                return (
                  <label key={member.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        setMemberIds((ids) =>
                          value ? [...ids, member.id] : ids.filter((id) => id !== member.id),
                        );
                      }}
                    />
                    {member.name}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>If nobody answers</Label>
              <Select
                value={queueFallback}
                onValueChange={(value) =>
                  setQueueFallback((value as typeof queueFallback) || "missed_log")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="missed_log">Log missed call</SelectItem>
                  <SelectItem value="voice_agent">Forward to ElevenLabs voice agent</SelectItem>
                  <SelectItem value="none">Do nothing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {queueFallback === "voice_agent" ? (
              <div className="space-y-2">
                <Label>Voice agent seat</Label>
                <Select
                  value={fallbackStaffId}
                  onValueChange={(value) => setFallbackStaffId(value ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick a PM agent" />
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
          </div>
          <Button onClick={() => void saveQueue()}>Save queue</Button>

          <ul className="divide-y rounded-md border">
            {queues.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">No queues yet.</li>
            ) : (
              queues.map((queue) => (
                <li key={queue.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{queue.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {queue.members.length} members · fallback {queue.fallback}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void fetch("/api/calls/queues", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: queue.id, delete: true }),
                      }).then(() => reload());
                    }}
                  >
                    Delete
                  </Button>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inbound routes</CardTitle>
          <CardDescription>
            Match the dialed Photon line (or leave blank for a default) to a queue or seat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Match number (blank = default)</Label>
            <PhoneInput value={routeMatch} onValueChange={setRouteMatch} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Target</Label>
              <Select
                value={routeTargetType}
                onValueChange={(value) => setRouteTargetType((value as "queue" | "staff") || "queue")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="queue">Queue</SelectItem>
                  <SelectItem value="staff">Seat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {routeTargetType === "queue" ? (
              <div className="space-y-2">
                <Label>Queue</Label>
                <Select value={routeQueueId} onValueChange={(value) => setRouteQueueId(value ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick a queue" />
                  </SelectTrigger>
                  <SelectContent>
                    {queues.map((queue) => (
                      <SelectItem key={queue.id} value={queue.id}>
                        {queue.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Seat</Label>
                <Select value={routeStaffId} onValueChange={(value) => setRouteStaffId(value ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick a seat" />
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
            )}
          </div>
          <Button onClick={() => void saveRoute()}>Save route</Button>

          <ul className="divide-y rounded-md border">
            {routes.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">No routes yet.</li>
            ) : (
              routes.map((route) => (
                <li key={route.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">
                      {route.matchNumber ? formatPhoneInput(route.matchNumber) : "Default"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      → {route.targetType}
                      {route.targetType === "queue"
                        ? ` ${queues.find((queue) => queue.id === route.targetQueueId)?.name || ""}`
                        : ` ${people.find((member) => member.id === route.targetStaffId)?.name || ""}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void fetch("/api/calls/routes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: route.id, delete: true }),
                      }).then(() => reload());
                    }}
                  >
                    Delete
                  </Button>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
