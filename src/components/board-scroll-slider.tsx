"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { boardScrollMetrics, scrollLeftFromTrack, type BoardScrollMetrics } from "@/lib/board-scroll";
import { cn } from "@/lib/utils";

function emptyMetrics(): BoardScrollMetrics {
  return { overflowing: false, maxScroll: 0, thumbRatio: 1, thumbStart: 0 };
}

export function KanbanScroller({ children }: { children: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<BoardScrollMetrics>(emptyMetrics);

  function measure() {
    const node = scrollerRef.current;
    if (!node) return;
    setMetrics(boardScrollMetrics(node.scrollLeft, node.clientWidth, node.scrollWidth));
  }

  useEffect(() => {
    measure();
    const node = scrollerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    node.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", measure);
    };
  }, []);

  function scrub(ratio: number) {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollLeft = scrollLeftFromTrack(ratio, node.clientWidth, node.scrollWidth);
  }

  return (
    <div className="relative h-[min(42rem,calc(100dvh-13rem))]">
      <div
        ref={scrollerRef}
        className="h-full w-full overflow-x-auto overflow-y-auto pb-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <BoardScrollSlider metrics={metrics} onScrub={scrub} />
    </div>
  );
}

export function BoardScrollSlider({
  metrics,
  onScrub,
}: {
  metrics: BoardScrollMetrics;
  onScrub: (pointerRatio: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  function ratioFromEvent(event: PointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return (event.clientX - rect.left) / rect.width;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onScrub(ratioFromEvent(event));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    onScrub(ratioFromEvent(event));
  }

  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-20">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Scroll pipeline"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(metrics.thumbStart * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") onScrub(metrics.thumbStart + metrics.thumbRatio / 2 + 0.08);
          if (event.key === "ArrowLeft") onScrub(metrics.thumbStart + metrics.thumbRatio / 2 - 0.08);
        }}
        className={cn(
          "pointer-events-auto relative h-6 w-40 cursor-ew-resize overflow-hidden rounded-md border border-black/10 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.12)]",
        )}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0 6px, #d7dbe2 6px 7px)",
          }}
        />
        <div
          className="absolute top-0.5 bottom-0.5 rounded-sm bg-[#b8c8e4] ring-1 ring-[#8aa0c8]"
          style={{
            left: `${metrics.thumbStart * 100}%`,
            width: `${metrics.thumbRatio * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
