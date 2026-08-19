"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { COURSE, chapterBest, chapterPassed, lessonsReadCount } from "@/lib/training/engine";
import type { TrainingBulletin, TrainingProgress } from "@/lib/types";
import { formatRelative } from "@/lib/format";

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const width = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("h-1.5 w-full bg-muted", className)}>
      <div className="h-full bg-primary transition-[width]" style={{ width: `${width}%` }} />
    </div>
  );
}

export function ChapterStatus({
  progress,
  chapterId,
}: {
  progress: TrainingProgress;
  chapterId: string;
}) {
  const chapter = COURSE.chapters.find((item) => item.id === chapterId);
  if (!chapter) return null;
  const passed = chapterPassed(progress, chapterId);
  const best = chapterBest(progress, chapterId);
  const read = lessonsReadCount(progress, chapterId);
  if (passed) return <span className="text-xs font-medium text-primary">Passed · {best}%</span>;
  if (best !== null) return <span className="text-xs text-destructive">Retake · best {best}%</span>;
  if (read > 0) {
    return (
      <span className="text-xs text-muted-foreground">
        {read}/{chapter.lessons.length} lessons
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Not started</span>;
}

export function BadgeShelf({
  earned,
  compact,
}: {
  earned: Record<string, string>;
  compact?: boolean;
}) {
  return (
    <ul className={cn("grid gap-2", compact ? "grid-cols-2 sm:grid-cols-5" : "sm:grid-cols-2")}>
      {COURSE.badges.map((badge) => {
        const unlocked = Boolean(earned[badge.id]);
        return (
          <li
            key={badge.id}
            className={cn(
              "border px-3 py-2.5",
              unlocked ? "bg-card" : "bg-muted/40 text-muted-foreground",
            )}
          >
            <p className="text-sm font-medium">
              <span className="mr-1.5" aria-hidden>
                {badge.icon}
              </span>
              {badge.name}
            </p>
            {compact ? null : <p className="mt-1 text-xs leading-snug">{badge.desc}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function BulletinList({
  bulletins,
  empty,
}: {
  bulletins: TrainingBulletin[];
  empty: string;
}) {
  if (bulletins.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y">
      {bulletins.map((bulletin) => (
        <li key={bulletin.id} className="py-3 first:pt-0 last:pb-0">
          <p className="text-sm font-medium">{bulletin.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{bulletin.body}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {bulletin.author} · {formatRelative(bulletin.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function PostBulletinDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string, body: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(title, body);
      setTitle("");
      setBody("");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>Training bulletin</DialogTitle>
            <DialogDescription>
              Posts to every seat. Use this for hail-season notes, check-rides, or a chapter due this week.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bulletin-title">Title</Label>
              <Input
                id="bulletin-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Hail season: finish Repair before claims walks"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bulletin-body">Note</Label>
              <Textarea
                id="bulletin-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={4}
                placeholder="Who should complete which chapter, and by when."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Posting…" : "Post bulletin"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LessonNav({
  chapterId,
  lessonIndex,
  children,
}: {
  chapterId: string;
  lessonIndex?: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <Link href="/training" className="text-muted-foreground hover:text-foreground hover:underline">
        Training
      </Link>
      <span className="text-muted-foreground">/</span>
      <Link
        href={`/training/${chapterId}`}
        className={cn(
          lessonIndex === undefined
            ? "font-medium"
            : "text-muted-foreground hover:text-foreground hover:underline",
        )}
      >
        {COURSE.chapters.find((chapter) => chapter.id === chapterId)?.title ?? "Chapter"}
      </Link>
      {children}
    </div>
  );
}
