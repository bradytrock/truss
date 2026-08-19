import type { TrainingBulletin, TrainingProgress } from "@/lib/types";

export const TRAINING_STORAGE_KEY = "truss.training";

export function readLocalTraining(seed: {
  trainingProgress: TrainingProgress[];
  trainingBulletins: TrainingBulletin[];
}) {
  try {
    const raw = window.localStorage.getItem(TRAINING_STORAGE_KEY);
    if (!raw) return seed;
    const parsed = JSON.parse(raw) as {
      trainingProgress?: TrainingProgress[];
      trainingBulletins?: TrainingBulletin[];
    };
    const byStaff = new Map((parsed.trainingProgress ?? []).map((item) => [item.staffId, item]));
    return {
      trainingProgress: seed.trainingProgress
        .map((item) => byStaff.get(item.staffId) ?? item)
        .concat(
          (parsed.trainingProgress ?? []).filter(
            (item) => !seed.trainingProgress.some((seedItem) => seedItem.staffId === item.staffId),
          ),
        ),
      trainingBulletins: parsed.trainingBulletins ?? seed.trainingBulletins,
    };
  } catch {
    return seed;
  }
}

export function writeLocalTraining(value: {
  trainingProgress: TrainingProgress[];
  trainingBulletins: TrainingBulletin[];
}) {
  try {
    window.localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

export function clearLocalTraining() {
  try {
    window.localStorage.removeItem(TRAINING_STORAGE_KEY);
  } catch {
    // ignore
  }
}
