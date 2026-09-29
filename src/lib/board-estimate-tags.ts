/** Estimate milestones shown on a job board card. Draft and declined stay off the card. */
export const BOARD_ESTIMATE_TAGS = ["signed", "viewed", "sent"] as const;

export type BoardEstimateTag = (typeof BOARD_ESTIMATE_TAGS)[number];

export const BOARD_ESTIMATE_TAG_LABELS: Record<BoardEstimateTag, string> = {
  signed: "Estimate Signed",
  viewed: "Estimate Viewed",
  sent: "Estimate Sent",
};
