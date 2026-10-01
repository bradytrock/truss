"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneIncoming, PhoneOff, Mic, MicOff, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrm } from "@/lib/crm-store";
import { openDialerPopup } from "@/lib/calls/popup";
import { useSoftphone } from "@/lib/calls/softphone";
import { formatPhoneInput } from "@/lib/phone";
import { cn } from "@/lib/utils";

function elapsed(startedAt: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function SoftphoneBar() {
  const crm = useCrm();
  const phone = useSoftphone();
  const [tick, setTick] = useState(0);
  const [transferStaffId, setTransferStaffId] = useState("");
  const [transferNumber, setTransferNumber] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    if (!phone.active) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phone.active]);

  const staffId = crm.effectiveStaff?.id || crm.user.staffId || "";
  if (!crm.hydrated || !staffId) return null;
  if (!phone.ready && !phone.active && phone.incoming.length === 0) return null;

  const staff = crm.book.staff.filter((member) => !member.locked && member.id !== staffId);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 sm:p-4">
      <div
        className={cn(
          "pointer-events-auto w-full max-w-xl rounded-xl border bg-background/95 shadow-lg backdrop-blur",
          "px-3 py-2.5 sm:px-4",
        )}
      >
        {phone.incoming.length > 0 && !phone.active ? (
          <div className="space-y-2">
            {phone.incoming.slice(0, 2).map((call) => (
              <div key={call.legId} className="flex items-center gap-2">
                <PhoneIncoming className="size-4 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {call.contactName || formatPhoneInput(call.fromNumber) || "Incoming call"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatPhoneInput(call.fromNumber)} · softphone
                  </p>
                </div>
                <Button size="sm" onClick={() => void phone.answer(call.legId)}>
                  Answer
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void phone.decline(call.legId)}>
                  Decline
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {phone.active ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Phone className="size-4 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {phone.active.direction === "inbound"
                    ? formatPhoneInput(phone.active.fromNumber) || "Inbound call"
                    : formatPhoneInput(phone.active.toNumber) || "Outbound call"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {/* tick forces re-render each second */}
                  {elapsed(phone.active.startedAt + (tick >= 0 ? 0 : 0))} ·{" "}
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => {
                      if (!openDialerPopup()) {
                        toast.error("Allow pop-ups to open the dialer window.");
                      }
                    }}
                  >
                    Dialer
                  </button>
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => phone.toggleMute()} aria-label="Mute">
                {phone.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setTransferOpen((open) => !open)}
                aria-label="Transfer"
              >
                <ArrowRightLeft className="size-4" />
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void phone.hangup()}>
                <PhoneOff className="size-4" />
                End
              </Button>
            </div>

            {transferOpen ? (
              <div className="grid gap-2 border-t pt-2 sm:grid-cols-[1fr_auto_auto]">
                <Select
                  value={transferStaffId}
                  onValueChange={(value) => setTransferStaffId(value ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Transfer to teammate" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!transferStaffId}
                  onClick={() => {
                    void phone
                      .warmTransfer(transferStaffId)
                      .then(() => toast.message("Consult ringing. Complete when ready."))
                      .catch((error: Error) => toast.error(error.message));
                  }}
                >
                  Warm
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    void phone
                      .coldTransfer({
                        targetStaffId: transferStaffId || undefined,
                        targetNumber: transferNumber || undefined,
                      })
                      .catch((error: Error) => toast.error(error.message));
                  }}
                >
                  Cold
                </Button>
                <Input
                  className="sm:col-span-2"
                  placeholder="Or number for cold transfer"
                  value={transferNumber}
                  onChange={(event) => setTransferNumber(formatPhoneInput(event.target.value))}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!transferStaffId}
                  onClick={() => {
                    void phone
                      .completeWarmTransfer(transferStaffId)
                      .catch((error: Error) => toast.error(error.message));
                  }}
                >
                  Complete warm
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!phone.active && phone.incoming.length === 0 && phone.ready ? (
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-3.5" /> Softphone ready
            </span>
            <button
              type="button"
              className="text-foreground underline-offset-2 hover:underline"
              onClick={() => {
                if (!openDialerPopup()) {
                  toast.error("Allow pop-ups to open the dialer window.");
                }
              }}
            >
              Open dialer
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
