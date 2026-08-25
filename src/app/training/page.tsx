"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBanner, LoadingScreen, Metric, MetricStrip, PageHeader } from "@/components/page-chrome";
import {
  BadgeShelf,
  BulletinList,
  ChapterStatus,
  PostBulletinDialog,
  ProgressBar,
} from "@/components/training-ui";
import { useCrm } from "@/lib/crm-store";
import { COURSE, examUnlocked, overallProgress, staffProgress } from "@/lib/training/engine";
import { recommendedChapterIds } from "@/lib/training/recommend";
import { canPostTrainingBulletin, canViewTeamTraining } from "@/lib/visibility";

export default function TrainingHubPage() {
  const crm = useCrm();
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const staffId = crm.user.staffId;
  const progress = staffProgress(crm.trainingProgress, staffId);
  const stats = overallProgress(progress);
  const canTeam = Boolean(crm.viewer && canViewTeamTraining(crm.viewer.role));
  const canPost = Boolean(crm.viewer && canPostTrainingBulletin(crm.viewer.role));

  const recommended = useMemo(() => {
    const openJobs = crm.jobs.filter(
      (job) => job.status !== "complete" && job.status !== "on_hold" && !job.deletedAt,
    );
    const types = [
      ...openJobs.map((job) => {
        const opportunity = job.opportunityId ? crm.opportunities.find((item) => item.id === job.opportunityId) : undefined;
        return opportunity?.projectType;
      }),
      ...crm.opportunities
        .filter((opportunity) => opportunity.stage !== "awarded" && opportunity.stage !== "lost")
        .map((opportunity) => opportunity.projectType),
    ];
    const ids = [...new Set(types.flatMap((type) => recommendedChapterIds(type)))];
    return COURSE.chapters.filter((chapter) => ids.includes(chapter.id)).slice(0, 4);
  }, [crm.jobs, crm.opportunities]);

  if (!crm.hydrated) return <LoadingScreen />;

  const lessonPct = stats.totalLessons === 0 ? 0 : Math.round((stats.read / stats.totalLessons) * 100);
  const chapterPct = Math.round((stats.passedChapters / stats.chapterCount) * 100);
  const examReady = examUnlocked(progress);

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Field school"
        title="Training"
        description={`${COURSE.subtitle}. ${COURSE.companion} Chapter tests pass at ${COURSE.passScore}%. The certification exam is ${COURSE.finalSize} questions and needs ${COURSE.finalPassScore}%.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canTeam ? (
              <Button nativeButton={false} variant="outline" render={<Link href="/training/team" />}>
                Team progress
              </Button>
            ) : null}
            <Button nativeButton={false} variant="outline" render={<Link href="/training/gear" />}>
              Gear list
            </Button>
            <Button nativeButton={false} render={<Link href="/training/quiz/practice" />}>
              Practice test
            </Button>
          </div>
        }
      />

      <MetricStrip className="sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Lessons read"
          value={`${stats.read}/${stats.totalLessons}`}
          hint={`${lessonPct}% of the course`}
        />
        <Metric
          label="Chapter tests passed"
          value={`${stats.passedChapters}/${stats.chapterCount}`}
          hint="70% to pass each chapter"
        />
        <Metric
          label="Badges"
          value={String(stats.badgeCount)}
          hint={`${COURSE.badges.length} to collect`}
        />
        <Metric
          label="Certification"
          value={stats.certified ? "Certified" : examReady ? "Unlocked" : "Locked"}
          hint={
            stats.certified
              ? "You passed the 60-question exam"
              : examReady
                ? "All chapter tests are in. Sit the exam."
                : "Pass every chapter test to unlock"
          }
        />
      </MetricStrip>

      <ProgressBar value={chapterPct} />

      {crm.trainingBulletins.length > 0 || canPost ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b">
            <div>
              <CardTitle>Company notes</CardTitle>
              <CardDescription>What leadership wants the crew studying this week.</CardDescription>
            </div>
            {canPost ? (
              <Button size="sm" variant="outline" onClick={() => setBulletinOpen(true)}>
                Post bulletin
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <BulletinList
              bulletins={crm.trainingBulletins}
              empty="No training notes yet. Team leads can post a bulletin when a storm week is coming."
            />
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Chapters</CardTitle>
            <CardDescription>
              Fifteen chapters, {COURSE.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0)}{" "}
              lessons. Read the summaries, then take the ten-question chapter test.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ol className="divide-y">
              {COURSE.chapters.map((chapter, index) => {
                const read = chapter.lessons.filter((_, lessonIndex) =>
                  progress.read[`${chapter.id}|${lessonIndex}`],
                ).length;
                const pct = Math.round((read / chapter.lessons.length) * 100);
                return (
                  <li key={chapter.id}>
                    <Link
                      href={`/training/${chapter.id}`}
                      className="flex flex-col gap-2 px-4 py-3 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          <span className="mr-2 font-mono text-xs text-muted-foreground">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {chapter.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{chapter.tagline}</p>
                      </div>
                      <div className="flex w-full items-center gap-3 sm:w-44">
                        <ProgressBar value={pct} className="flex-1" />
                        <ChapterStatus progress={progress} chapterId={chapter.id} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>From your open jobs</CardTitle>
              <CardDescription>
                Chapters that match the work currently in precon, production, or punch.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recommended.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No open jobs in this seat. Start with Measuring, then Estimating.
                </p>
              ) : (
                <ul className="space-y-2">
                  {recommended.map((chapter) => (
                    <li key={chapter.id}>
                      <Link href={`/training/${chapter.id}`} className="text-sm font-medium hover:underline">
                        {chapter.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{chapter.tagline}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Certification exam</CardTitle>
              <CardDescription>
                {COURSE.finalSize} questions, {COURSE.finalPassScore}% to pass. Locked until every chapter test is
                passed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.certified ? (
                <p className="text-sm">You are certified on this seat. Retake anytime to stay sharp.</p>
              ) : examReady ? (
                <p className="text-sm">All fifteen chapter tests are in. Sit the exam when you have a quiet hour.</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {stats.chapterCount - stats.passedChapters} chapter{" "}
                  {stats.chapterCount - stats.passedChapters === 1 ? "test remains" : "tests remain"}.
                </p>
              )}
              <Button
                nativeButton={false}
                className="mt-3"
                variant={examReady ? "default" : "outline"}
                disabled={!examReady}
                render={<Link href="/training/quiz/exam" />}
              >
                {stats.certified ? "Retake exam" : "Start exam"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Badges</CardTitle>
          <CardDescription>Milestones for tests, streaks, and the certification exam.</CardDescription>
        </CardHeader>
        <CardContent>
          <BadgeShelf earned={progress.badges} />
        </CardContent>
      </Card>

      <PostBulletinDialog
        open={bulletinOpen}
        onOpenChange={setBulletinOpen}
        onSubmit={crm.addTrainingBulletin}
      />
    </div>
  );
}
