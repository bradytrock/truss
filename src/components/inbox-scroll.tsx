"use client";

import { useEffect, useRef, type ReactNode, type UIEvent } from "react";
import { cn } from "@/lib/utils";

/** Scrollport that stays inside a flex column even when the list is taller than the pane. */
export function InboxScroll({
  children,
  className,
  stickToEnd = false,
  stickKey,
}: {
  children: ReactNode;
  className?: string;
  stickToEnd?: boolean;
  stickKey?: number | string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || !stickToEnd || !pinned.current) return;
    node.scrollTop = node.scrollHeight;
  }, [stickKey, stickToEnd]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    if (!stickToEnd) return;
    const node = event.currentTarget;
    pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={onScroll}
        className={cn("absolute inset-0 overflow-y-auto overscroll-contain", className)}
      >
        {children}
      </div>
    </div>
  );
}
