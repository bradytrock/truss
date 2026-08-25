"use client";

import { useEffect, useState } from "react";
import {
  normalizeShareToken,
  parseShareSender,
  type ShareSender,
} from "@/lib/share";

const SHARE_FETCH: RequestInit = {
  cache: "no-store",
  credentials: "omit",
};

export async function readShareResponse<T>(
  response: Response,
  parse: (data: unknown) => T | null,
): Promise<{ payload: T | null; sender: ShareSender | null }> {
  const data: unknown = await response.json().catch(() => null);
  const payload = response.ok ? parse(data) : null;
  return {
    payload,
    sender: payload ? null : parseShareSender(data),
  };
}

export function useRemoteShare<T>({
  token,
  hasLocal,
  path,
  parse,
  initial,
  initialSender,
}: {
  token: string;
  hasLocal: boolean;
  path: string;
  parse: (data: unknown) => T | null;
  initial?: T | null;
  initialSender?: ShareSender | null;
}) {
  const served = initial !== undefined;
  const [remote, setRemote] = useState<T | null>(() => initial ?? null);
  const [sender, setSender] = useState<ShareSender | null>(() => initialSender ?? null);
  const [remoteState, setRemoteState] = useState<"loading" | "ready" | "missing">(() => {
    if (initial) return "ready";
    if (served) return "missing";
    return "loading";
  });

  useEffect(() => {
    const trimmed = normalizeShareToken(token);
    if (hasLocal) {
      setRemote(null);
      setSender(null);
      setRemoteState("ready");
      return;
    }
    if (served) {
      if (initial) {
        setRemote(initial);
        setSender(null);
        setRemoteState("ready");
        return;
      }
      setRemote(null);
      setSender(initialSender ?? null);
      setRemoteState("missing");
      return;
    }
    if (!trimmed) {
      setRemote(null);
      setSender(null);
      setRemoteState("missing");
      return;
    }
    let cancelled = false;
    setRemoteState("loading");
    void fetch(`${path}${encodeURIComponent(trimmed)}`, SHARE_FETCH)
      .then((response) => readShareResponse(response, parse))
      .then((result) => {
        if (cancelled) return;
        if (result.payload) {
          setRemote(result.payload);
          setSender(null);
          setRemoteState("ready");
          return;
        }
        setRemote(null);
        setSender(result.sender);
        setRemoteState("missing");
      })
      .catch(() => {
        if (!cancelled) {
          setRemote(null);
          setSender(null);
          setRemoteState("missing");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hasLocal, initial, initialSender, parse, path, served, token]);

  return { remote, remoteState, sender, setRemote };
}

export { SHARE_FETCH };
