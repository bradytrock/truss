"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

function dragHasFiles(event: DragEvent<HTMLElement>) {
  const types = event.dataTransfer?.types;
  // Safari often withholds the type list until drop. An empty list can still be files.
  if (!types || types.length === 0) return true;
  return Array.from(types).includes("Files");
}

/** Dashed target for dropping files. Ignores text and in-app drags. */
export function FileDropZone({
  disabled,
  onFiles,
  className,
  children,
}: {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
  children: (dragOver: boolean) => ReactNode;
}) {
  const [dragOver, setDragOver] = useState(false);
  const depth = useRef(0);
  const frame = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  function clearDragSoon() {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (!alive.current) return;
      if (depth.current === 0) setDragOver(false);
    });
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (disabled || !dragHasFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setDragOver(true);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (disabled || !dragHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (depth.current === 0) return;
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) clearDragSoon();
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    depth.current = 0;
    setDragOver(false);
    if (disabled || !dragHasFiles(event)) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div
      data-file-drop-zone=""
      data-drag-over={dragOver && !disabled ? "true" : "false"}
      className={cn(className)}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children(dragOver && !disabled)}
    </div>
  );
}
