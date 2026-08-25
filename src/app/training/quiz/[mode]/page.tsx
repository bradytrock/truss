"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import {
  COURSE,
  buildChapterTest,
  buildExam,
  buildPractice,
  chapterById,
  examUnlocked,
  passMark,
  staffProgress,
  type QuizItem,
  type QuizKind,
} from "@/lib/training/engine";
import { cn } from "@/lib/utils";

type Meta = {
  kind: QuizKind;
  chapterId: string | null;
  title: string;
  description: string;
  valid: boolean;
};

function quizMeta(mode: string): Meta {
  if (mode === "practice") {
    return {
      kind: "practice",
      chapterId: null,
      title: "Practice test",
      description: `${COURSE.practiceSize} mixed questions — two per chapter. ${COURSE.passScore}% to pass. This does not unlock the certification exam.`,
      valid: true,
    };
  }
  if (mode === "exam") {
    return {
      kind: "exam",
      chapterId: null,
      title: "Certification exam",
      description: `${COURSE.finalSize} questions covering the whole course. ${COURSE.finalPassScore}% to pass.`,
      valid: true,
    };
  }
  const chapter = chapterById(mode);
  if (!chapter) {
    return {
      kind: "chapter",
      chapterId: mode,
      title: "Unknown chapter",
      description: "",
      valid: false,
    };
  }
  return {
    kind: "chapter",
    chapterId: chapter.id,
    title: `${chapter.title} — chapter test`,
    description: `Ten questions. ${COURSE.passScore}% to pass. Generated takeoff problems may appear when this chapter has them.`,
    valid: true,
  };
}

function buildItems(meta: Meta, mode: string) {
  if (!meta.valid) return [];
  if (meta.kind === "practice") return buildPractice();
  if (meta.kind === "exam") return buildExam();
  return buildChapterTest(meta.chapterId ?? mode);
}

export default function QuizPage() {
  const { mode } = useParams<{ mode: string }>();
  const crm = useCrm();
  const meta = quizMeta(mode);
  const progress = staffProgress(crm.trainingProgress, crm.user.staffId);
  const lockedExam = meta.kind === "exam" && !examUnlocked(progress);
  const [round, setRound] = useState(0);

  if (!crm.hydrated) return <LoadingScreen />;

  if (!meta.valid) {
    return (
      <EmptyState
        title="No such test"
        description="Use a chapter from the course, or open Practice / Exam from Training."
        action={
          <Button nativeButton={false} render={<Link href="/training" />}>
            Back to training
          </Button>
        }
      />
    );
  }

  if (lockedExam) {
    return (
      <EmptyState
        title="Certification exam is locked"
        description="Pass every chapter test at 70% or better. The exam is 60 questions and needs 80%."
        action={
          <Button nativeButton={false} render={<Link href="/training" />}>
            Back to training
          </Button>
        }
      />
    );
  }

  return (
    <QuizRunner
      key={`${mode}-${round}`}
      mode={mode}
      meta={meta}
      hydrateError={crm.hydrateError}
      onRetry={() => void crm.reload()}
      onRetake={() => setRound((value) => value + 1)}
    />
  );
}

function QuizRunner({
  mode,
  meta,
  hydrateError,
  onRetry,
  onRetake,
}: {
  mode: string;
  meta: Meta;
  hydrateError: string | null;
  onRetry: () => void;
  onRetake: () => void;
}) {
  const crm = useCrm();
  const [items] = useState<QuizItem[]>(() => buildItems(meta, mode));
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ score: number; correct: number; total: number; passed: boolean } | null>(
    null,
  );

  const current = items[index];
  const answered = current ? picks[current.id] !== undefined : false;
  const allAnswered = items.length > 0 && items.every((item) => picks[item.id] !== undefined);
  const backHref = meta.chapterId ? `/training/${meta.chapterId}` : "/training";

  const missed = useMemo(() => {
    if (!done) return [];
    return items.filter((item) => picks[item.id] !== item.correct);
  }, [done, items, picks]);

  async function finish() {
    if (!allAnswered || saving) return;
    const correct = items.filter((item) => picks[item.id] === item.correct).length;
    const score = Math.round((correct / items.length) * 100);
    const passed = score >= passMark(meta.kind);
    setSaving(true);
    try {
      await crm.submitQuiz({
        kind: meta.kind,
        chapterId: meta.chapterId,
        score,
        correct,
        total: items.length,
      });
      setResult({ score, correct, total: items.length, passed });
      setDone(true);
    } finally {
      setSaving(false);
    }
  }

  if (done && result) {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Field school"
          title={result.passed ? "Passed" : "Not yet"}
          description={`${result.correct} of ${result.total} correct · ${result.score}% · ${passMark(meta.kind)}% to pass.`}
        />
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{result.passed ? "That score counts" : "Review the misses, then retake"}</CardTitle>
            <CardDescription>
              {result.passed
                ? "This attempt is on your seat. Badges update when you hit a milestone."
                : "The attempt is saved. Comeback Kid unlocks if you pass a chapter you previously failed."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {missed.length === 0 ? (
              <p className="text-sm">Clean sheet. Every answer was right.</p>
            ) : (
              <ol className="space-y-4">
                {missed.map((item) => (
                  <li key={item.id}>
                    <p className="text-sm font-medium">{item.prompt}</p>
                    <p className="mt-1 text-xs text-destructive">
                      You picked {item.choices[picks[item.id] ?? -1] ?? "nothing"}
                    </p>
                    <p className="text-xs text-muted-foreground">Correct: {item.choices[item.correct]}</p>
                    {item.explain ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.explain}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={onRetake}>Retake</Button>
              <Button nativeButton={false} variant="outline" render={<Link href={backHref} />}>
                {meta.chapterId ? "Back to chapter" : "Back to training"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {hydrateError ? <ErrorBanner message={hydrateError} onRetry={onRetry} /> : null}
      <PageHeader
        eyebrow="Field school"
        title={meta.title}
        description={meta.description}
        actions={
          <Button nativeButton={false} variant="outline" render={<Link href={backHref} />}>
            Exit
          </Button>
        }
      />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">This test has no questions.</p>
      ) : (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>
              Question {index + 1} of {items.length}
            </CardTitle>
            <CardDescription>
              {current?.cat}
              {current?.chapterId
                ? ` · ${COURSE.chapters.find((chapter) => chapter.id === current.chapterId)?.title ?? current.chapterId}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <p className="text-sm leading-relaxed">{current?.prompt}</p>
            <div className="grid gap-2">
              {current?.choices.map((choice, choiceIndex) => {
                const selected = picks[current.id] === choiceIndex;
                return (
                  <button
                    key={`${current.id}-${choiceIndex}`}
                    type="button"
                    onClick={() => setPicks((prev) => ({ ...prev, [current.id]: choiceIndex }))}
                    className={cn(
                      "border px-3 py-2.5 text-left text-sm leading-snug transition-colors",
                      selected ? "border-primary bg-primary/8" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {String.fromCharCode(65 + choiceIndex)}
                    </span>
                    {choice}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={index === 0}
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
              >
                Previous
              </Button>
              {index < items.length - 1 ? (
                <Button type="button" disabled={!answered} onClick={() => setIndex((value) => value + 1)}>
                  Next
                </Button>
              ) : (
                <Button type="button" disabled={!allAnswered || saving} onClick={() => void finish()}>
                  {saving ? "Saving…" : "Submit test"}
                </Button>
              )}
            </div>
            {!allAnswered && index === items.length - 1 ? (
              <p className="text-xs text-muted-foreground">
                Answer every question before you submit. Use Previous to fill any blanks.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
