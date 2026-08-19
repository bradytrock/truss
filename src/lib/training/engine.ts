import curriculum from "./curriculum.json";
import { GENERATORS } from "./generators";
import type {
  BadgeDef,
  BankQuestion,
  Chapter,
  GearGroup,
  GeneratedQuestion,
  Lesson,
  QuizItem,
  QuizKind,
  Rand,
  TrainingAttempt,
  TrainingProgress,
} from "./types";

type CurriculumFile = {
  title: string;
  subtitle: string;
  companion: string;
  passScore: number;
  finalPassScore: number;
  practiceSize: number;
  finalSize: number;
  masteryLevels: { min: number; label: string }[];
  badges: BadgeDef[];
  gear: GearGroup[];
  chapters: (Chapter & { bank: BankQuestion[] })[];
  recaps: Record<string, string | { sum: string; points?: string[]; remember?: string[]; tips?: string[] }>;
  reading: Record<string, { ref: string }>;
  explain: Record<string, string[]>;
};

const data = curriculum as unknown as CurriculumFile;

export const COURSE = data;

export function makeRand(): Rand {
  return {
    int(min, max) {
      return min + Math.floor(Math.random() * (max - min + 1));
    },
    pick(items) {
      return items[Math.floor(Math.random() * items.length)] as (typeof items)[number];
    },
  };
}

export function shuffle<T>(items: T[]): T[] {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = next[i];
    next[i] = next[j] as T;
    next[j] = tmp as T;
  }
  return next;
}

export function chapterById(id: string) {
  return COURSE.chapters.find((chapter) => chapter.id === id);
}

export function lessonKey(chapterId: string, index: number) {
  return `${chapterId}|${index}`;
}

function materializeBank(chapter: Chapter, question: BankQuestion, bankIndex: number): QuizItem {
  const order = shuffle(question.a.map((_, index) => index));
  return {
    id: crypto.randomUUID(),
    chapterId: chapter.id,
    cat: question.cat,
    prompt: question.q,
    choices: order.map((index) => question.a[index] ?? ""),
    correct: order.indexOf(question.correct),
    explain: COURSE.explain[chapter.id]?.[bankIndex],
    bankIndex,
  };
}

function materializeGen(chapter: Chapter, generated: GeneratedQuestion, cat: string): QuizItem {
  const order = shuffle(generated.a.map((_, index) => index));
  return {
    id: crypto.randomUUID(),
    chapterId: chapter.id,
    cat,
    prompt: generated.q,
    choices: order.map((index) => generated.a[index] ?? ""),
    correct: order.indexOf(generated.correct),
    explain: generated.x,
  };
}

export function buildChapterTest(chapterId: string, rand = makeRand()): QuizItem[] {
  const chapter = chapterById(chapterId);
  if (!chapter) return [];
  const gens = GENERATORS[chapterId] ?? [];
  const gensUsed = Math.min(gens.length, 2);
  const staticCount = Math.min(chapter.bank.length, 10 - gensUsed);
  const bankPicks = shuffle(chapter.bank.map((question, index) => ({ question, index }))).slice(
    0,
    staticCount,
  );
  const items = bankPicks.map(({ question, index }) => materializeBank(chapter, question, index));
  const genPool = shuffle(gens).slice(0, 10 - items.length);
  for (const generator of genPool) {
    items.push(materializeGen(chapter, generator.gen(rand), generator.cat));
  }
  return shuffle(items);
}

export function buildPractice(rand = makeRand()): QuizItem[] {
  const items: QuizItem[] = [];
  for (const chapter of COURSE.chapters) {
    const gens = GENERATORS[chapter.id] ?? [];
    const bankPicks = shuffle(chapter.bank.map((question, index) => ({ question, index }))).slice(0, 2);
    if (gens.length > 0 && Math.random() < 0.5) {
      const generator = rand.pick(gens);
      items.push(materializeGen(chapter, generator.gen(rand), generator.cat));
      const extra = bankPicks[1];
      if (extra) items.push(materializeBank(chapter, extra.question, extra.index));
    } else {
      for (const pick of bankPicks) {
        items.push(materializeBank(chapter, pick.question, pick.index));
      }
    }
  }
  return shuffle(items);
}

export function buildExam(rand = makeRand()): QuizItem[] {
  const items: QuizItem[] = [];
  for (const chapter of COURSE.chapters) {
    const gens = GENERATORS[chapter.id] ?? [];
    const statics = shuffle(chapter.bank.map((question, index) => ({ question, index }))).slice(
      0,
      gens.length ? 3 : 4,
    );
    for (const pick of statics) {
      items.push(materializeBank(chapter, pick.question, pick.index));
    }
    if (gens.length) {
      const generator = rand.pick(gens);
      items.push(materializeGen(chapter, generator.gen(rand), generator.cat));
    }
  }
  return shuffle(items);
}

export function passMark(kind: QuizKind) {
  return kind === "exam" ? COURSE.finalPassScore : COURSE.passScore;
}

export function emptyProgress(staffId: string): TrainingProgress {
  return { staffId, read: {}, badges: {}, attempts: [] };
}

export function chapterPassed(progress: TrainingProgress, chapterId: string) {
  return progress.attempts.some(
    (attempt) => attempt.kind === "chapter" && attempt.chapterId === chapterId && attempt.passed,
  );
}

export function chapterBest(progress: TrainingProgress, chapterId: string) {
  const scores = progress.attempts
    .filter((attempt) => attempt.kind === "chapter" && attempt.chapterId === chapterId)
    .map((attempt) => attempt.score);
  return scores.length ? Math.max(...scores) : null;
}

export function lessonsReadCount(progress: TrainingProgress, chapterId: string) {
  const chapter = chapterById(chapterId);
  if (!chapter) return 0;
  return chapter.lessons.filter((_, index) => progress.read[lessonKey(chapterId, index)]).length;
}

export function overallProgress(progress: TrainingProgress) {
  const totalLessons = COURSE.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);
  const read = Object.keys(progress.read).length;
  const passedChapters = COURSE.chapters.filter((chapter) => chapterPassed(progress, chapter.id)).length;
  const certified = progress.attempts.some((attempt) => attempt.kind === "exam" && attempt.passed);
  return {
    totalLessons,
    read,
    passedChapters,
    chapterCount: COURSE.chapters.length,
    certified,
    badgeCount: Object.keys(progress.badges).length,
  };
}

export function awardBadges(progress: TrainingProgress): Record<string, string> {
  const badges = { ...progress.badges };
  const now = new Date().toISOString();
  const earn = (id: string) => {
    if (!badges[id]) badges[id] = now;
  };

  if (progress.attempts.length > 0) earn("first-nail");
  if (progress.attempts.some((attempt) => attempt.score === 100 && attempt.total > 0)) earn("perfect-square");

  const recent = [...progress.attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let streak = 0;
  for (const attempt of recent) {
    streak = attempt.passed ? streak + 1 : 0;
    if (streak >= 3) earn("hot-streak");
  }

  for (const chapter of COURSE.chapters) {
    const attempts = progress.attempts.filter(
      (attempt) => attempt.kind === "chapter" && attempt.chapterId === chapter.id,
    );
    const failedThenPassed =
      attempts.some((attempt) => !attempt.passed) && attempts.some((attempt) => attempt.passed);
    if (failedThenPassed) earn("comeback-kid");
  }

  if (progress.attempts.some((attempt) => attempt.kind === "practice" && attempt.passed)) {
    earn("practice-pro");
  }
  if (progress.attempts.length >= 10) earn("iron-roofer");

  const chapterScores = COURSE.chapters
    .map((chapter) => chapterBest(progress, chapter.id))
    .filter((score): score is number => score !== null);
  const attemptedTwice = COURSE.chapters.filter((chapter) => {
    return (
      progress.attempts.filter((attempt) => attempt.kind === "chapter" && attempt.chapterId === chapter.id)
        .length >= 2
    );
  }).length;
  if (chapterScores.length >= 2 && attemptedTwice >= 2) {
    const avg = chapterScores.reduce((sum, score) => sum + score, 0) / chapterScores.length;
    if (avg >= 90) earn("dialed-in");
  }

  if (COURSE.chapters.every((chapter) => chapterPassed(progress, chapter.id))) earn("chapter-boss");

  const estimating = progress.attempts.find(
    (attempt) => attempt.kind === "chapter" && attempt.chapterId === "estimating" && attempt.score >= 90,
  );
  if (estimating) earn("master-estimator");
  if (progress.attempts.some((attempt) => attempt.kind === "exam" && attempt.passed)) earn("certified");

  return badges;
}

export function recordAttempt(
  progress: TrainingProgress,
  input: Omit<TrainingAttempt, "id" | "staffId" | "passed"> & { id?: string },
): TrainingProgress {
  const passed = input.score >= passMark(input.kind);
  const attempt: TrainingAttempt = {
    id: input.id ?? crypto.randomUUID(),
    staffId: progress.staffId,
    kind: input.kind,
    chapterId: input.chapterId,
    score: input.score,
    correct: input.correct,
    total: input.total,
    passed,
    createdAt: input.createdAt,
  };
  const next: TrainingProgress = {
    ...progress,
    attempts: [attempt, ...progress.attempts],
  };
  next.badges = awardBadges(next);
  return next;
}

export function examUnlocked(progress: TrainingProgress) {
  return COURSE.chapters.every((chapter) => chapterPassed(progress, chapter.id));
}

export function masteryLabel(score: number | null) {
  if (score === null) return "Not started";
  const level = [...COURSE.masteryLevels].sort((a, b) => b.min - a.min).find((item) => score >= item.min);
  return level?.label ?? "On the punch list";
}

export function chapterReading(chapterId: string) {
  return COURSE.reading[chapterId]?.ref;
}

export function lessonRecap(chapterId: string, index: number) {
  const recap = COURSE.recaps[lessonKey(chapterId, index)];
  if (!recap) return null;
  if (typeof recap === "string") return { sum: recap, points: [] as string[], remember: [] as string[], tips: [] as string[] };
  return {
    sum: recap.sum,
    points: recap.points ?? [],
    remember: recap.remember ?? [],
    tips: recap.tips ?? [],
  };
}

export function staffProgress(list: TrainingProgress[], staffId: string) {
  return list.find((item) => item.staffId === staffId) ?? emptyProgress(staffId);
}

export type { Chapter, Lesson, QuizItem, QuizKind };
