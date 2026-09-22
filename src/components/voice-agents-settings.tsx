"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/phone-input";
import { copyText } from "@/lib/share";
import { formatPhone } from "@/lib/format";
import { formatPhoneInput } from "@/lib/phone";
import { missingVoiceAgentsMessage } from "@/lib/supabase/schema-errors";
import { voiceToolPaths } from "@/lib/voice-agent";
import type { StaffMember } from "@/lib/types";

type VoiceAgentRow = {
  id: string;
  staffId: string;
  elevenlabsAgentId: string;
  inboundNumber: string;
  webhookToken: string;
  enabled: boolean;
};

export function VoiceAgentsSettings({ staff }: { staff: StaffMember[] }) {
  const [agents, setAgents] = useState<VoiceAgentRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { elevenlabsAgentId: string; inboundNumber: string }>>({});
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const people = useMemo(
    () =>
      staff
        .filter((member) => !member.locked)
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [staff],
  );
  const byStaff = useMemo(() => new Map(agents.map((agent) => [agent.staffId, agent])), [agents]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const paths = voiceToolPaths();

  async function reload() {
    setLoading(true);
    try {
      const response = await fetch("/api/voice/agents");
      const data = (await response.json()) as { agents?: VoiceAgentRow[]; missing?: boolean; error?: string };
      if (!response.ok) {
        setMissing(Boolean(data.missing));
        if (!data.missing) toast.error(data.error || "Could not load voice agents.");
        setAgents([]);
        return;
      }
      setMissing(false);
      const rows = data.agents ?? [];
      setAgents(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((row) => [
            row.staffId,
            { elevenlabsAgentId: row.elevenlabsAgentId, inboundNumber: formatPhoneInput(row.inboundNumber) },
          ]),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function draftFor(staffId: string) {
    return drafts[staffId] ?? { elevenlabsAgentId: "", inboundNumber: "" };
  }

  async function upsert(
    staffId: string,
    patch: Partial<VoiceAgentRow> & { rotateToken?: boolean; elevenlabsAgentId?: string; inboundNumber?: string },
  ) {
    setSavingId(staffId);
    try {
      const existing = byStaff.get(staffId);
      const draft = draftFor(staffId);
      const response = await fetch("/api/voice/agents", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          existing
            ? {
                id: existing.id,
                elevenlabsAgentId: patch.elevenlabsAgentId ?? draft.elevenlabsAgentId,
                inboundNumber: patch.inboundNumber ?? draft.inboundNumber,
                enabled: patch.enabled ?? existing.enabled,
                rotateToken: patch.rotateToken,
              }
            : {
                staffId,
                elevenlabsAgentId: patch.elevenlabsAgentId ?? draft.elevenlabsAgentId,
                inboundNumber: patch.inboundNumber ?? draft.inboundNumber,
                enabled: patch.enabled ?? true,
              },
        ),
      });
      const data = (await response.json()) as { agent?: VoiceAgentRow; error?: string };
      if (!response.ok || !data.agent) {
        toast.error(data.error || "Could not save that voice agent.");
        return;
      }
      setAgents((current) => {
        const without = current.filter((item) => item.staffId !== staffId);
        return [...without, data.agent!];
      });
      setDrafts((current) => ({
        ...current,
        [staffId]: {
          elevenlabsAgentId: data.agent!.elevenlabsAgentId,
          inboundNumber: formatPhoneInput(data.agent!.inboundNumber),
        },
      }));
      toast.success(existing ? "Voice agent saved" : "Voice agent enabled");
    } finally {
      setSavingId(null);
    }
  }

  async function remove(agent: VoiceAgentRow) {
    setSavingId(agent.staffId);
    try {
      const response = await fetch(`/api/voice/agents?id=${encodeURIComponent(agent.id)}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        toast.error(data.error || "Could not remove that voice agent.");
        return;
      }
      setAgents((current) => current.filter((item) => item.id !== agent.id));
      toast.success("Voice agent removed");
    } finally {
      setSavingId(null);
    }
  }

  if (missing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Voice agents</CardTitle>
          <CardDescription>
            {missingVoiceAgentsMessage()}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Voice agents</CardTitle>
          <CardDescription>
            One ElevenLabs agent per project manager. Missed calls on their number log on the matching
            job or open a phone-seed lead. The agent never texts homeowners — only the owning PM.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? <p className="text-sm text-muted-foreground">Loading voice agents…</p> : null}
          {people.map((member) => {
            const agent = byStaff.get(member.id);
            const draft = draftFor(member.id);
            const busy = savingId === member.id;
            return (
              <div key={member.id} className="grid gap-3 border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.title || "Project manager"}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={Boolean(agent?.enabled)}
                      disabled={busy}
                      onCheckedChange={(checked) => {
                        if (!agent && !checked) return;
                        void upsert(member.id, { enabled: Boolean(checked) });
                      }}
                    />
                    Enabled
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`voice-el-${member.id}`}>ElevenLabs agent ID</Label>
                    <Input
                      id={`voice-el-${member.id}`}
                      value={draft.elevenlabsAgentId}
                      placeholder="agent_…"
                      disabled={busy}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [member.id]: { ...draftFor(member.id), elevenlabsAgentId: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`voice-did-${member.id}`}>Inbound number</Label>
                    <PhoneInput
                      id={`voice-did-${member.id}`}
                      value={draft.inboundNumber}
                      placeholder="Forward missed calls here"
                      disabled={busy}
                      onValueChange={(value) =>
                        setDrafts((current) => ({
                          ...current,
                          [member.id]: { ...draftFor(member.id), inboundNumber: value },
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void upsert(member.id, draft)}
                  >
                    {agent ? "Save" : "Enable voice agent"}
                  </Button>
                  {agent ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void copyText(agent.webhookToken)}
                      >
                        Copy token
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void upsert(member.id, { rotateToken: true })}
                      >
                        Rotate token
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void remove(agent)}>
                        Remove
                      </Button>
                    </>
                  ) : null}
                </div>
                {agent ? (
                  <p className="text-xs text-muted-foreground">
                    Token {agent.webhookToken.slice(0, 8)}… ·{" "}
                    {agent.inboundNumber ? formatPhone(agent.inboundNumber) : "No inbound number"}. Use{" "}
                    <code>Authorization: Bearer …</code> on every ElevenLabs tool.
                  </p>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ElevenLabs tools</CardTitle>
          <CardDescription>
            Add these webhook tools on each agent. Use that PM’s token. The agent must not send
            homeowner SMS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(
            [
              ["lookup_caller", paths.lookup, "Look up the caller before writing."],
              ["take_missed_call", paths.intake, "Log the call. Attach or open one phone-seed lead."],
              ["book_appointment", paths.book, "Book on this PM’s calendar and log a meeting."],
              ["log_activity", paths.log, "Add more notes on the same job."],
            ] as const
          ).map(([name, path, help]) => (
            <div key={name} className="flex flex-wrap items-center justify-between gap-2 border p-2">
              <div>
                <p className="font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">{help}</p>
                <p className="font-mono text-xs">
                  {origin}
                  {path}
                </p>
              </div>
              <Button type="button" size="xs" variant="outline" onClick={() => void copyText(`${origin}${path}`)}>
                Copy URL
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
