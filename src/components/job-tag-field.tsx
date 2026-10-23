"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { availableJobTags, customJobTag, filterJobTags, normalizeJobTag } from "@/lib/job-tags";
import { uniqueNames } from "@/lib/job-record";

function sameTags(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

export function JobTagField({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => Promise<boolean | void> | boolean | void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  const shown = optimistic ?? tags;
  const savedRef = useRef(tags);
  const tagsRef = useRef(shown);
  const chain = useRef(Promise.resolve());
  if (optimistic && sameTags(optimistic, tags)) setOptimistic(null);

  useEffect(() => {
    savedRef.current = tags;
    if (!optimistic) tagsRef.current = tags;
  }, [optimistic, tags]);

  const available = availableJobTags(suggestions, shown);
  const visible = filterJobTags(available, query);
  const custom = customJobTag(query, [...shown, ...suggestions]);
  const typed = normalizeJobTag(query).toLowerCase();
  const alreadyOnJob = Boolean(
    typed && shown.some((tag) => normalizeJobTag(tag).toLowerCase() === typed),
  );

  function commit(next: string[]) {
    if (sameTags(next, tagsRef.current)) return;
    tagsRef.current = next;
    setOptimistic(next);
    chain.current = chain.current
      .then(async () => {
        const snapshot = tagsRef.current;
        let ok = true;
        try {
          ok = (await onChange(snapshot)) !== false;
        } catch {
          ok = false;
        }
        if (!ok && sameTags(tagsRef.current, snapshot)) {
          tagsRef.current = savedRef.current;
          setOptimistic(null);
        }
      })
      .catch(() => undefined);
  }

  function add(value: string) {
    commit(uniqueNames([...tagsRef.current, value]));
    setQuery("");
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {shown.map((tag) => (
        <Badge
          key={tag}
          className="gap-1 border-transparent bg-emerald-100 pr-1 text-emerald-900 hover:bg-emerald-100"
        >
          {tag}
          <button
            type="button"
            className="rounded-sm p-0.5 hover:bg-foreground/10"
            onClick={() => commit(tagsRef.current.filter((item) => item !== tag))}
            aria-label={`Remove ${tag}`}
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" size="sm" className="h-6 rounded-full px-2 text-xs" />
          }
        >
          <Plus data-icon="inline-start" />
          Tag
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 gap-0 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Choose or type a tag"
              aria-label="Choose or type a tag"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>{alreadyOnJob ? "Already on this job" : "Type a tag"}</CommandEmpty>
              {visible.length > 0 ? (
                <CommandGroup heading="Suggestions">
                  {visible.map((tag) => (
                    <CommandItem key={tag} value={tag} onSelect={() => add(tag)}>
                      {tag}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {custom ? (
                <CommandGroup>
                  <CommandItem value={`add:${custom}`} onSelect={() => add(custom)}>
                    Add “{custom}”
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
