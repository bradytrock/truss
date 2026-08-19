import { NORTHLINE_STAFF, type TrainingBulletin, type TrainingProgress } from "@/lib/types";
import { awardBadges, emptyProgress, lessonKey } from "@/lib/training/engine";

function progressFor(
  staffId: string,
  patch: Partial<Pick<TrainingProgress, "read" | "attempts">>,
): TrainingProgress {
  const base = emptyProgress(staffId);
  const next: TrainingProgress = {
    ...base,
    read: patch.read ?? {},
    attempts: (patch.attempts ?? []).map((attempt) => ({ ...attempt, staffId })),
  };
  next.badges = awardBadges(next);
  return next;
}

export const seedTrainingProgress: TrainingProgress[] = NORTHLINE_STAFF.map((member) => {
  if (member.id === "staff_elena") {
    return progressFor("staff_elena", {
      read: {
        [lessonKey("measuring", 0)]: "2026-08-04T15:00:00.000Z",
        [lessonKey("measuring", 1)]: "2026-08-04T15:20:00.000Z",
        [lessonKey("measuring", 2)]: "2026-08-05T14:10:00.000Z",
        [lessonKey("asphalt", 0)]: "2026-08-11T16:00:00.000Z",
        [lessonKey("asphalt", 1)]: "2026-08-12T15:40:00.000Z",
        [lessonKey("asphalt", 2)]: "2026-08-12T16:10:00.000Z",
        [lessonKey("repair", 0)]: "2026-08-18T14:00:00.000Z",
      },
      attempts: [
        {
          id: "att_elena_measuring",
          staffId: "staff_elena",
          kind: "chapter",
          chapterId: "measuring",
          score: 100,
          correct: 10,
          total: 10,
          passed: true,
          createdAt: "2026-08-05T16:00:00.000Z",
        },
        {
          id: "att_elena_asphalt",
          staffId: "staff_elena",
          kind: "chapter",
          chapterId: "asphalt",
          score: 90,
          correct: 9,
          total: 10,
          passed: true,
          createdAt: "2026-08-12T17:20:00.000Z",
        },
      ],
    });
  }
  if (member.id === "staff_tom") {
    return progressFor("staff_tom", {
      read: {
        [lessonKey("measuring", 0)]: "2026-08-17T13:00:00.000Z",
        [lessonKey("measuring", 1)]: "2026-08-18T12:40:00.000Z",
      },
      attempts: [
        {
          id: "att_tom_measuring",
          staffId: "staff_tom",
          kind: "chapter",
          chapterId: "measuring",
          score: 50,
          correct: 5,
          total: 10,
          passed: false,
          createdAt: "2026-08-18T18:00:00.000Z",
        },
      ],
    });
  }
  if (member.id === "staff_maya") {
    return progressFor("staff_maya", {
      read: {
        [lessonKey("estimating", 0)]: "2026-08-10T15:00:00.000Z",
        [lessonKey("estimating", 1)]: "2026-08-10T15:30:00.000Z",
        [lessonKey("estimating", 2)]: "2026-08-11T14:10:00.000Z",
        [lessonKey("estimating", 3)]: "2026-08-11T14:40:00.000Z",
      },
      attempts: [
        {
          id: "att_maya_est",
          staffId: "staff_maya",
          kind: "chapter",
          chapterId: "estimating",
          score: 80,
          correct: 8,
          total: 10,
          passed: true,
          createdAt: "2026-08-11T16:00:00.000Z",
        },
        {
          id: "att_maya_practice",
          staffId: "staff_maya",
          kind: "practice",
          chapterId: null,
          score: 73,
          correct: 22,
          total: 30,
          passed: true,
          createdAt: "2026-08-14T19:10:00.000Z",
        },
      ],
    });
  }
  if (member.id === "staff_luis") {
    return progressFor("staff_luis", {
      read: {
        [lessonKey("repair", 0)]: "2026-08-08T15:00:00.000Z",
        [lessonKey("asphalt", 0)]: "2026-08-09T14:20:00.000Z",
      },
      attempts: [],
    });
  }
  return emptyProgress(member.id);
});

export const seedTrainingBulletins: TrainingBulletin[] = [
  {
    id: "tb_hail",
    title: "Hail season: finish Repair before you walk claims",
    body: "If you are on field ops, complete the Roof Repair chapter this week. Elena already passed Measuring and Asphalt — use her as the check-ride before a homeowner meeting.",
    author: "Jordan Hale",
    createdAt: "2026-08-18T14:00:00.000Z",
  },
];
