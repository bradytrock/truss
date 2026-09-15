"use client";

import { useEffect, useRef } from "react";

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

const COLORS = ["#c8102e", "#e23a4a", "#f3d27a", "#f7f1e6", "#3d5a7a", "#ffffff"];

export function ConfettiFall({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    for (let i = 0; i < 150; i += 1) {
      pieces.push({
        x: Math.random() * width,
        y: -24 - Math.random() * height,
        w: 5 + Math.random() * 7,
        h: 8 + Math.random() * 11,
        vx: -1.1 + Math.random() * 2.2,
        vy: 2.1 + Math.random() * 3.4,
        rot: Math.random() * Math.PI,
        vr: -0.14 + Math.random() * 0.28,
        color: COLORS[i % COLORS.length]!,
      });
    }

    const tick = () => {
      const view = size();
      ctx.clearRect(0, 0, view.width, view.height);
      for (const piece of pieces) {
        piece.x += piece.vx + Math.sin(piece.y / 36) * 0.45;
        piece.y += piece.vy;
        piece.rot += piece.vr;
        if (piece.y > view.height + 24) {
          piece.y = -20;
          piece.x = Math.random() * view.width;
        }
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rot);
        ctx.fillStyle = piece.color;
        ctx.globalAlpha = 0.92;
        ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[80]"
    />
  );
}
