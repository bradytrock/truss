export type CallEndpointKind = "softphone" | "cell" | "app";
export type CallLegKind = CallEndpointKind | "pstn" | "transfer";
export type CallDirection = "inbound" | "outbound";
export type CallSessionStatus = "ringing" | "active" | "ended" | "missed" | "failed" | "transferred";
export type CallLegStatus = "ringing" | "answered" | "cancelled" | "missed" | "failed" | "ended";
export type CallQueueFallback = "none" | "missed_log" | "voice_agent";
export type CallRouteTarget = "queue" | "staff";

export type CallRingTarget = {
  staffId: string;
  staffName?: string;
  kind: CallEndpointKind;
  phone: string;
  ringTimeoutSeconds: number;
};

export type CallEndpointRow = {
  id: string;
  staffId: string;
  kind: CallEndpointKind;
  phone: string;
  enabled: boolean;
  priority: number;
  ringTimeoutSeconds: number;
};

export type CallQueueRow = {
  id: string;
  name: string;
  strategy: "simultaneous";
  fallback: CallQueueFallback;
  fallbackVoiceAgentStaffId: string | null;
  ringTimeoutSeconds: number;
  enabled: boolean;
  members: Array<{
    id: string;
    staffId: string;
    useSoftphone: boolean;
    useCell: boolean;
    useApp: boolean;
  }>;
};

export type CallRouteRow = {
  id: string;
  matchNumber: string;
  targetType: CallRouteTarget;
  targetQueueId: string | null;
  targetStaffId: string | null;
  priority: number;
  enabled: boolean;
};

export type CallSessionRow = {
  id: string;
  direction: CallDirection;
  roomName: string;
  fromNumber: string;
  toNumber: string;
  status: CallSessionStatus;
  queueId: string | null;
  answeredStaffId: string | null;
  contactId: string | null;
  jobId: string | null;
  opportunityId: string | null;
  callerParticipantIdentity: string;
  disposition: string;
  durationSeconds: number | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
};

export type IncomingCallLeg = {
  legId: string;
  sessionId: string;
  kind: CallEndpointKind;
  roomName: string;
  fromNumber: string;
  toNumber: string;
  contactName: string | null;
  startedAt: string;
};
