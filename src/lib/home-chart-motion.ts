/** Pin the hover readout to the right edge, lined up with the active point. */
export function chartCursorTopPercent(y: number, height: number) {
  if (height <= 0) return 8;
  return Math.min(78, Math.max(8, (y / height) * 100));
}

export function nearestChartIndex(x: number, xs: number[]) {
  if (xs.length === 0) return -1;
  let best = 0;
  let bestDist = Math.abs(xs[0]! - x);
  for (let i = 1; i < xs.length; i += 1) {
    const dist = Math.abs(xs[i]! - x);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

export function pointerInViewBox(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  viewWidth: number,
  viewHeight: number,
) {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: ((clientX - rect.left) / rect.width) * viewWidth,
    y: ((clientY - rect.top) / rect.height) * viewHeight,
  };
}

export function angleInSweep(angle: number, start: number, end: number) {
  let next = angle;
  const tau = Math.PI * 2;
  while (next < start) next += tau;
  while (next >= start + tau) next -= tau;
  return next >= start && next <= end + 1e-9;
}

export function donutIndexAt(
  x: number,
  y: number,
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  slices: Array<{ start: number; end: number }>,
) {
  const dist = Math.hypot(x - cx, y - cy);
  if (dist < inner - 1 || dist > outer + 1) return -1;
  const angle = Math.atan2(y - cy, x - cx);
  return slices.findIndex((slice) => angleInSweep(angle, slice.start, slice.end));
}
