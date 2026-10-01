"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { toast } from "sonner";
import type { IncomingCallLeg } from "@/lib/calls/types";
import { useCrm } from "@/lib/crm-store";

type ActiveCall = {
  sessionId: string;
  roomName: string;
  fromNumber: string;
  toNumber: string;
  direction: "inbound" | "outbound";
  startedAt: number;
};

type SoftphoneContextValue = {
  ready: boolean;
  muted: boolean;
  active: ActiveCall | null;
  incoming: IncomingCallLeg[];
  dialing: boolean;
  dial: (to: string) => Promise<void>;
  answer: (legId: string) => Promise<void>;
  decline: (legId: string) => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => void;
  coldTransfer: (opts: { targetStaffId?: string; targetNumber?: string }) => Promise<void>;
  warmTransfer: (targetStaffId: string) => Promise<void>;
  completeWarmTransfer: (targetStaffId: string) => Promise<void>;
};

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null);

export function useSoftphone() {
  const value = useContext(SoftphoneContext);
  if (!value) throw new Error("useSoftphone requires SoftphoneProvider");
  return value;
}

export function SoftphoneProvider({ children }: { children: ReactNode }) {
  const crm = useCrm();
  const [room, setRoom] = useState<Room | null>(null);
  const [muted, setMuted] = useState(false);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<IncomingCallLeg[]>([]);
  const [dialing, setDialing] = useState(false);
  const [ready, setReady] = useState(false);

  const disconnectRoom = useCallback(async () => {
    if (room) {
      room.disconnect();
      setRoom(null);
    }
    setMuted(false);
  }, [room]);

  const connectWithToken = useCallback(
    async (payload: {
      url: string;
      token: string;
      sessionId: string;
      roomName: string;
      fromNumber?: string;
      toNumber?: string;
      direction: "inbound" | "outbound";
    }) => {
      await disconnectRoom();
      const next = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      next.on(RoomEvent.Disconnected, () => {
        setRoom(null);
        setActive(null);
      });
      await next.connect(payload.url, payload.token);
      await next.localParticipant.setMicrophoneEnabled(true);
      setRoom(next);
      setActive({
        sessionId: payload.sessionId,
        roomName: payload.roomName,
        fromNumber: payload.fromNumber || "",
        toNumber: payload.toNumber || "",
        direction: payload.direction,
        startedAt: Date.now(),
      });
    },
    [disconnectRoom],
  );

  const staffId = crm.effectiveStaff?.id || crm.user.staffId || "";

  const refreshIncoming = useEffectEvent(async () => {
    if (!staffId) {
      setIncoming([]);
      setReady(false);
      return;
    }
    try {
      const response = await fetch("/api/calls/incoming");
      const data = (await response.json()) as { incoming?: IncomingCallLeg[]; missing?: boolean };
      setIncoming(data.incoming ?? []);
      setReady(!data.missing);
    } catch {
      setIncoming([]);
    }
  });

  useEffect(() => {
    if (!crm.hydrated || !staffId) return;
    void refreshIncoming();
    const timer = window.setInterval(() => {
      void refreshIncoming();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [crm.hydrated, staffId]);

  const dial = useCallback(
    async (to: string) => {
      setDialing(true);
      try {
        const response = await fetch("/api/calls/dial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to }),
        });
        const data = (await response.json()) as {
          error?: string;
          sessionId?: string;
          roomName?: string;
          token?: string;
          url?: string;
          toNumber?: string;
        };
        if (!response.ok || !data.token || !data.url || !data.sessionId || !data.roomName) {
          throw new Error(data.error || "Could not dial.");
        }
        await connectWithToken({
          url: data.url,
          token: data.token,
          sessionId: data.sessionId,
          roomName: data.roomName,
          toNumber: to,
          direction: "outbound",
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not dial.");
        throw error;
      } finally {
        setDialing(false);
      }
    },
    [connectWithToken],
  );

  const answer = useCallback(
    async (legId: string) => {
      try {
        const response = await fetch("/api/calls/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ legId }),
        });
        const data = (await response.json()) as {
          error?: string;
          sessionId?: string;
          roomName?: string;
          token?: string;
          url?: string;
          fromNumber?: string;
          toNumber?: string;
        };
        if (!response.ok || !data.token || !data.url || !data.sessionId || !data.roomName) {
          throw new Error(data.error || "Could not answer.");
        }
        await connectWithToken({
          url: data.url,
          token: data.token,
          sessionId: data.sessionId,
          roomName: data.roomName,
          fromNumber: data.fromNumber,
          toNumber: data.toNumber,
          direction: "inbound",
        });
        setIncoming((rows) => rows.filter((row) => row.legId !== legId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not answer.");
      }
    },
    [connectWithToken],
  );

  const decline = useCallback(async (legId: string) => {
    setIncoming((rows) => rows.filter((row) => row.legId !== legId));
    // Declining a softphone leg leaves cells ringing until timeout / another answer.
    void legId;
  }, []);

  const hangup = useCallback(async () => {
    if (!active) return;
    const sessionId = active.sessionId;
    await disconnectRoom();
    setActive(null);
    try {
      await fetch("/api/calls/hangup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      toast.error("Call ended locally, but the server hangup failed.");
    }
  }, [active, disconnectRoom]);

  const toggleMute = useCallback(() => {
    if (!room) return;
    const next = !muted;
    void room.localParticipant.setMicrophoneEnabled(!next);
    for (const pub of room.localParticipant.audioTrackPublications.values()) {
      if (pub.track && pub.source === Track.Source.Microphone) {
        if (next) pub.track.mute();
        else pub.track.unmute();
      }
    }
    setMuted(next);
  }, [muted, room]);

  const coldTransfer = useCallback(
    async (opts: { targetStaffId?: string; targetNumber?: string }) => {
      if (!active) return;
      const response = await fetch("/api/calls/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: active.sessionId,
          mode: "cold",
          ...opts,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Transfer failed.");
      await disconnectRoom();
      setActive(null);
      toast.success("Call transferred.");
    },
    [active, disconnectRoom],
  );

  const warmTransfer = useCallback(
    async (targetStaffId: string) => {
      if (!active) return;
      const response = await fetch("/api/calls/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: active.sessionId,
          mode: "warm",
          targetStaffId,
        }),
      });
      const data = (await response.json()) as { error?: string; note?: string };
      if (!response.ok) throw new Error(data.error || "Warm transfer failed.");
      toast.message(data.note || "Consult started. Complete when ready.");
    },
    [active],
  );

  const completeWarmTransfer = useCallback(
    async (targetStaffId: string) => {
      if (!active) return;
      const response = await fetch("/api/calls/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: active.sessionId,
          mode: "complete-warm",
          targetStaffId,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not complete transfer.");
      await disconnectRoom();
      setActive(null);
      toast.success("Warm transfer completed.");
    },
    [active, disconnectRoom],
  );

  const value = useMemo<SoftphoneContextValue>(
    () => ({
      ready,
      muted,
      active,
      incoming,
      dialing,
      dial,
      answer,
      decline,
      hangup,
      toggleMute,
      coldTransfer,
      warmTransfer,
      completeWarmTransfer,
    }),
    [
      ready,
      muted,
      active,
      incoming,
      dialing,
      dial,
      answer,
      decline,
      hangup,
      toggleMute,
      coldTransfer,
      warmTransfer,
      completeWarmTransfer,
    ],
  );

  return <SoftphoneContext.Provider value={value}>{children}</SoftphoneContext.Provider>;
}
