export type BoardScrollMetrics = {
  overflowing: boolean;
  maxScroll: number;
  thumbRatio: number;
  thumbStart: number;
};

const MIN_THUMB = 0.18;

export function boardScrollMetrics(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): BoardScrollMetrics {
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  const thumbRatio =
    scrollWidth <= 0 ? 1 : Math.min(1, Math.max(MIN_THUMB, clientWidth / scrollWidth));
  const travel = 1 - thumbRatio;
  const thumbStart = maxScroll <= 0 || travel <= 0 ? 0 : (scrollLeft / maxScroll) * travel;
  return {
    overflowing: maxScroll > 1,
    maxScroll,
    thumbRatio,
    thumbStart,
  };
}

/** Map a pointer position on the track (0–1) to scrollLeft. */
export function scrollLeftFromTrack(
  pointerRatio: number,
  clientWidth: number,
  scrollWidth: number,
) {
  const { maxScroll, thumbRatio } = boardScrollMetrics(0, clientWidth, scrollWidth);
  const travel = 1 - thumbRatio;
  if (travel <= 0 || maxScroll <= 0) return 0;
  const start = Math.min(travel, Math.max(0, pointerRatio - thumbRatio / 2));
  return (start / travel) * maxScroll;
}
