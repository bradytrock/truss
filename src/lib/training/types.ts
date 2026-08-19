export type Rand = {
  int: (min: number, max: number) => number;
  pick: <T>(items: T[]) => T;
};

export type BankQuestion = {
  cat: string;
  q: string;
  a: string[];
  correct: number;
};

export type GeneratedQuestion = {
  q: string;
  a: string[];
  correct: number;
  x?: string;
};

export type Lesson = {
  title: string;
  minutes: number;
  html: string;
};

export type Chapter = {
  id: string;
  title: string;
  tagline: string;
  cats: string[];
  lessons: Lesson[];
  bank: BankQuestion[];
};

export type BadgeDef = {
  id: string;
  icon: string;
  name: string;
  desc: string;
};

export type GearGroup = {
  icon: string;
  cat: string;
  items: { name: string; note: string }[];
};

export type QuizKind = "chapter" | "practice" | "exam";

export type QuizItem = {
  id: string;
  chapterId: string;
  cat: string;
  prompt: string;
  choices: string[];
  correct: number;
  explain?: string;
  bankIndex?: number;
};

export type TrainingAttempt = {
  id: string;
  staffId: string;
  kind: QuizKind;
  chapterId: string | null;
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  createdAt: string;
};

export type TrainingProgress = {
  staffId: string;
  read: Record<string, string>;
  badges: Record<string, string>;
  attempts: TrainingAttempt[];
};

export type TrainingBulletin = {
  id: string;
  title: string;
  body: string;
  author: string;
  createdAt: string;
};
