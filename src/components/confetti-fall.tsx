"use client";

import { useEffect, useMemo, useRef } from "react";

type Piece = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
};

const COLORS = ["#c8102e", "#e23a4a", "#f3d27a", "#f7f1e6", "#3d5a7a", "#ffffff", "#ff6b6b"];

const CSS_PIECES = Array.from({ length: 48 }, (_, index) => ({
  left: `${(index * 17 + 3) % 100}%`,
  delay: `${(index % 12) * 0.18}s`,
  duration: `${2.6 + (index % 7) * 0.28}s`,
  color: COLORS[index % COLORS.length]!,
  width: 6 + (index % 5),
  height: 10 + (index % 6),
  drift: index % 2 === 0 ? -18 : 22,
}));

export function ConfettiFall({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cssPieces = useMemo(() => CSS_PIECES, []);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const pieces: Piece[] = [];
    const size = () => ({ width: window.innerWidth, height: window.innerHeight });

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = size();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const { width, height } = size();
    for (let i = 0; i < 120; i += 1) {
      pieces.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.85 - 40,
        w: 7 + Math.random() * 8,
        h: 10 + Math.random() * 12,
        vx: -1.1 + Math.random() * 2.2,
        vy: 2.4 + Math.random() * 3.6,
        rot: Math.random() * Math.PI,
        vr: -0.16 + Math.random() * 0.32,
        color: COLORS[i % COLORS.length]!,
      });
    }

    const draw = () => {
      const view = size();
      ctx.clearRect(0, 0, view.width, view.height);
      for (const piece of pieces) {
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rot);
        ctx.fillStyle = piece.color;
        ctx.globalAlpha = 0.95;
        ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        ctx.restore();
      }
    };

    const tick = () => {
      const view = size();
      for (const piece of pieces) {
        piece.x += piece.vx + Math.sin(piece.y / 36) * 0.45;
        piece.y += piece.vy;
        piece.rot += piece.vr;
        if (piece.y > view.height + 24) {
          piece.y = -20;
          piece.x = Math.random() * view.width;
        }
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    draw();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      <div className="absolute inset-0">
        {cssPieces.map((piece, index) => (
          <span
            key={index}
            className="confetti-piece absolute top-[-12px] rounded-[1px]"
            style={{
              left: piece.left,
              width: piece.width,
              height: piece.height,
              background: piece.color,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
              ["--confetti-drift" as string]: `${piece.drift}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
