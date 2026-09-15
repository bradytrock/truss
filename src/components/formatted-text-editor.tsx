"use client";

import { useEffect, useRef } from "react";
import { Bold, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { editorHtmlToStorage, storageToEditorHtml } from "@/lib/line-format";
import { cn } from "@/lib/utils";

export function FormattedTextEditor({
  value,
  onCommit,
  disabled,
  placeholder,
  className,
}: {
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!ref.current || focused.current) return;
    const html = storageToEditorHtml(value);
    if (ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
  }, [value]);

  function commit() {
    if (!ref.current) return;
    const next = editorHtmlToStorage(ref.current.innerHTML);
    if (next !== value) onCommit(next);
  }

  function run(command: string) {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command, false);
  }

  return (
    <div className="space-y-1">
      {disabled ? null : (
        <div className="flex gap-0.5">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Bold"
            onMouseDown={(event) => {
              event.preventDefault();
              run("bold");
            }}
          >
            <Bold />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Bulleted list"
            onMouseDown={(event) => {
              event.preventDefault();
              run("insertUnorderedList");
            }}
          >
            <List />
          </Button>
        </div>
      )}
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label={placeholder}
        aria-disabled={disabled || undefined}
        data-placeholder={placeholder}
        className={cn(
          "formatted-line-editor flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30",
          disabled && "cursor-not-allowed bg-input/50 opacity-50",
          className,
        )}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
            event.preventDefault();
            run("bold");
          }
        }}
      />
    </div>
  );
}
