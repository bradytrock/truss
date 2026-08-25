"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { LessonNav } from "@/components/training-ui";
import { useCrm } from "@/lib/crm-store";
import { chapterById, lessonRecap } from "@/lib/training/engine";

export default function LessonPage() {
  const { chapterId, lesson } = useParams<{ chapterId: string; lesson: string }>();
  const crm = useCrm();
  const chapter = chapterById(chapterId);
  const index = Number.parseInt(lesson, 10);
  const item = chapter && Number.isInteger(index) ? chapter.lessons[index] : undefined;

  useEffect(() => {
    if (!crm.hydrated || !chapter || !item || Number.isNaN(index)) return;
    void crm.markLessonRead(chapter.id, index);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mark once per lesson
  }, [chapter?.id, index, crm.hydrated]);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!chapter || !item) {
    return (
      <EmptyState
        title="Lesson not found"
        description="That lesson is not in this chapter."
        action={
          <Button nativeButton={false} render={<Link href="/training" />}>
            Back to training
          </Button>
        }
      />
    );
  }

  const prev = index > 0 ? index - 1 : null;
  const next = index < chapter.lessons.length - 1 ? index + 1 : null;
  const recap = lessonRecap(chapter.id, index);

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <LessonNav chapterId={chapter.id} lessonIndex={index}>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{item.title}</span>
      </LessonNav>

      <div>
        <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Lesson {index + 1} of {chapter.lessons.length} · {item.minutes} min
        </p>
        <h1 className="font-heading mt-1.5 text-[1.85rem] leading-[1.1] font-medium text-balance">
          {item.title}
        </h1>
      </div>

      <article className="lesson-body max-w-3xl">
        <div dangerouslySetInnerHTML={{ __html: item.html }} />
      </article>

      {recap ? (
        <Card>
          <CardContent className="pt-4">
            <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Recap</p>
            <p className="mt-2 text-sm leading-relaxed">{recap.sum}</p>
            {recap.points.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                {recap.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {prev !== null ? (
          <Button nativeButton={false} variant="outline" render={<Link href={`/training/${chapter.id}/${prev}`} />}>
            Previous lesson
          </Button>
        ) : null}
        {next !== null ? (
          <Button nativeButton={false} render={<Link href={`/training/${chapter.id}/${next}`} />}>
            Next lesson
          </Button>
        ) : (
          <Button nativeButton={false} render={<Link href={`/training/quiz/${chapter.id}`} />}>
            Take chapter test
          </Button>
        )}
        <Button nativeButton={false} variant="ghost" render={<Link href={`/training/${chapter.id}`} />}>
          Chapter overview
        </Button>
      </div>
    </div>
  );
}
