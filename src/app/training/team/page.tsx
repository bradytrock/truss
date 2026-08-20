"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { BulletinList, PostBulletinDialog, ProgressBar } from "@/components/training-ui";
import { useCrm } from "@/lib/crm-store";
import { COURSE, chapterPassed, examUnlocked, overallProgress, staffProgress } from "@/lib/training/engine";
import { accessScope, canPostTrainingBulletin, canViewTeamTraining, teamMemberIds } from "@/lib/visibility";

export default function TeamTrainingPage() {
  const crm = useCrm();
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const viewer = crm.viewer;
  const canPost = Boolean(viewer && canPostTrainingBulletin(viewer.role));

  const rows = useMemo(() => {
    if (!viewer) return [];
    const scope = accessScope(viewer.role);
    const visible =
      scope === "company"
        ? crm.book.staff
        : scope === "team"
          ? crm.book.staff.filter((member) => teamMemberIds(viewer.teamId, crm.book.staff).has(member.id))
          : crm.book.staff.filter((member) => member.id === viewer.id);
    return [...visible]
      .map((member) => {
        const progress = staffProgress(crm.book.trainingProgress, member.id);
        const stats = overallProgress(progress);
        return {
          member,
          progress,
          stats,
          examReady: examUnlocked(progress),
          lagging: COURSE.chapters.filter((chapter) => !chapterPassed(progress, chapter.id)).slice(0, 2),
        };
      })
      .sort((a, b) => b.stats.passedChapters - a.stats.passedChapters);
  }, [crm.book.staff, crm.book.trainingProgress, viewer]);

  if (!crm.hydrated) return <LoadingScreen />;

  if (!viewer || !canViewTeamTraining(viewer.role)) {
    return (
      <EmptyState
        title="Team training is restricted"
        description="Company admin, business development, and team leads can see crew progress. Everyone still has their own Training seat."
        action={
          <Button nativeButton={false} render={<Link href="/training" />}>
            Back to training
          </Button>
        }
      />
    );
  }

  const behind = rows.filter((row) => row.stats.passedChapters < 2 && row.stats.read < 4);

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        eyebrow="Field school"
        title="Team training"
        description="Who has passed chapter tests, who is still on Measuring, and the bulletins you posted for the crew."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} variant="outline" render={<Link href="/training" />}>
              My training
            </Button>
            {canPost ? (
              <Button size="default" onClick={() => setBulletinOpen(true)}>
                Post bulletin
              </Button>
            ) : null}
          </div>
        }
      />

      {behind.length > 0 ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Needs a nudge</CardTitle>
            <CardDescription>
              Fewer than two chapter tests passed and almost no lessons read. Pair them with someone who already
              passed Measuring.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            <ul className="space-y-2">
              {behind.map((row) => (
                <li key={row.member.id} className="text-sm">
                  <span className="font-medium">{row.member.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {row.stats.read} lessons · {row.stats.passedChapters} tests
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Crew progress</CardTitle>
          <CardDescription>
            Chapter tests pass at {COURSE.passScore}%. Certification needs every chapter plus {COURSE.finalPassScore}%
            on the exam.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Lessons</TableHead>
                <TableHead>Chapters</TableHead>
                <TableHead>Exam</TableHead>
                <TableHead>Still open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const lessonPct =
                  row.stats.totalLessons === 0
                    ? 0
                    : Math.round((row.stats.read / row.stats.totalLessons) * 100);
                return (
                  <TableRow key={row.member.id}>
                    <TableCell>
                      <p className="font-medium">{row.member.name}</p>
                      <p className="text-xs text-muted-foreground">{row.member.title}</p>
                    </TableCell>
                    <TableCell className="min-w-36">
                      <p className="text-sm tabular-nums">
                        {row.stats.read}/{row.stats.totalLessons}
                      </p>
                      <ProgressBar value={lessonPct} className="mt-1" />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.stats.passedChapters}/{row.stats.chapterCount}
                    </TableCell>
                    <TableCell>
                      {row.stats.certified
                        ? "Certified"
                        : row.examReady
                          ? "Unlocked"
                          : "Locked"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.lagging.length === 0
                        ? "—"
                        : row.lagging.map((chapter) => chapter.title.split(":")[0]).join(", ")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Bulletins</CardTitle>
          <CardDescription>Everyone on the company sees these on their Training hub.</CardDescription>
        </CardHeader>
        <CardContent>
          <BulletinList
            bulletins={crm.trainingBulletins}
            empty="No bulletins yet. Post one before a hail week so field seats know which chapter to finish."
          />
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
