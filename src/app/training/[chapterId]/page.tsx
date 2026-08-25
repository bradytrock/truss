"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { ChapterStatus, LessonNav, ProgressBar } from "@/components/training-ui";
import { useCrm } from "@/lib/crm-store";
import {
  COURSE,
  chapterBest,
  chapterById,
  chapterPassed,
  chapterReading,
  lessonKey,
  lessonsReadCount,
  staffProgress,
} from "@/lib/training/engine";

export default function ChapterPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const crm = useCrm();
  const chapter = chapterById(chapterId);
  const progress = staffProgress(crm.trainingProgress, crm.user.staffId);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!chapter) {
    return (
      <EmptyState
        title="Chapter not in this course"
        description="That chapter id is not part of the roofing certification pack."
        action={
          <Button nativeButton={false} render={<Link href="/training" />}>
            Back to training
          </Button>
        }
      />
    );
  }

  const read = lessonsReadCount(progress, chapter.id);
  const passed = chapterPassed(progress, chapter.id);
  const best = chapterBest(progress, chapter.id);
  const reading = chapterReading(chapter.id);
  const minutes = chapter.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0);

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <LessonNav chapterId={chapter.id} />
      <PageHeader
        eyebrow={`Chapter ${COURSE.chapters.findIndex((item) => item.id === chapter.id) + 1} of ${COURSE.chapters.length}`}
        title={chapter.title}
        description={chapter.tagline}
        actions={
          <Button nativeButton={false} render={<Link href={`/training/quiz/${chapter.id}`} />}>
            {passed ? "Retake chapter test" : best !== null ? "Retake chapter test" : "Take chapter test"}
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <ChapterStatus progress={progress} chapterId={chapter.id} />
        <p className="text-xs text-muted-foreground">
          {read}/{chapter.lessons.length} lessons · about {minutes} min · test is 10 questions, {COURSE.passScore}% to
          pass
        </p>
      </div>
      <ProgressBar value={Math.round((read / chapter.lessons.length) * 100)} />

      {reading ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          See the Atcheson book: {reading}. These lessons are original summaries, not a reprint.
        </p>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Lessons</CardTitle>
          <CardDescription>Open a lesson to mark it read. Then sit the chapter test.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ol className="divide-y">
            {chapter.lessons.map((lesson, index) => {
              const done = Boolean(progress.read[lessonKey(chapter.id, index)]);
              return (
                <li key={`${chapter.id}-${index}`}>
                  <Link
                    href={`/training/${chapter.id}/${index}`}
                    className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                  >
                    <div>
                      <p className="text-sm font-medium">{lesson.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{lesson.minutes} min</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{done ? "Read" : "Unread"}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} variant="outline" render={<Link href="/training" />}>
          All chapters
        </Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/training/quiz/practice" />}>
          Mixed practice
        </Button>
      </div>
    </div>
  );
}
