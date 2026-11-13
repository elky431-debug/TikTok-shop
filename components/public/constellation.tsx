'use client';

import { useEffect, useRef } from 'react';

/**
 * Fond « constellation » du héros, recréé d'après EtSmart : fines lignes obliques, points, losanges,
 * cercles creux, « + » et petits triangles, en blanc à 6–15 % d'opacité, plus deux halos flous
 * (cyan à gauche, rose à droite) derrière le titre.
 *
 * - Dérive lente : chaque forme se déplace de quelques pixels sur 20 à 40 s, en boucle.
 * - Parallaxe légère au mouvement de la souris (desktop, pointeur précis).
 * - Pause quand l'onglet est caché ou que le héros sort de l'écran.
 * - Avec « réduire les animations » : dessin fixe, aucune boucle.
 */

type Shape =
  | { kind: 'line'; x: number; y: number; len: number; angle: number; alpha: number }
  | { kind: 'dot'; x: number; y: number; r: number; alpha: number }
  | { kind: 'ring'; x: number; y: number; r: number; alpha: number }
  | { kind: 'diamond'; x: number; y: number; s: number; alpha: number }
  | { kind: 'cross'; x: number; y: number; s: number; alpha: number }
  | { kind: 'triangle'; x: number; y: number; s: number; angle: number; alpha: number };

// Positions en % (reprises de la composition d'EtSmart), tailles en px.
const SHAPES: Shape[] = [
  { kind: 'line', x: 6, y: 12, len: 144, angle: 25, alpha: 0.13 },
  { kind: 'line', x: 82, y: 22, len: 112, angle: -15, alpha: 0.13 },
  { kind: 'line', x: 4, y: 38, len: 96, angle: 45, alpha: 0.11 },
  { kind: 'line', x: 86, y: 55, len: 128, angle: 20, alpha: 0.1 },
  { kind: 'line', x: 12, y: 68, len: 80, angle: -30, alpha: 0.09 },
  { kind: 'line', x: 89, y: 28, len: 96, angle: 35, alpha: 0.1 },
  { kind: 'line', x: 22, y: 78, len: 72, angle: -20, alpha: 0.09 },
  { kind: 'line', x: 8, y: 45, len: 64, angle: 55, alpha: 0.11 },
  { kind: 'line', x: 76, y: 85, len: 88, angle: -40, alpha: 0.08 },
  { kind: 'line', x: 30, y: 16, len: 48, angle: 10, alpha: 0.09 },
  { kind: 'line', x: 70, y: 62, len: 56, angle: -50, alpha: 0.08 },
  { kind: 'dot', x: 78, y: 18, r: 5, alpha: 0.14 },
  { kind: 'dot', x: 8, y: 48, r: 4, alpha: 0.15 },
  { kind: 'dot', x: 88, y: 72, r: 4, alpha: 0.1 },
  { kind: 'dot', x: 18, y: 32, r: 3, alpha: 0.12 },
  { kind: 'dot', x: 28, y: 60, r: 2, alpha: 0.12 },
  { kind: 'dot', x: 40, y: 15, r: 3, alpha: 0.08 },
  { kind: 'dot', x: 72, y: 82, r: 3, alpha: 0.12 },
  { kind: 'dot', x: 92, y: 42, r: 2, alpha: 0.1 },
  { kind: 'dot', x: 10, y: 88, r: 4, alpha: 0.07 },
  { kind: 'dot', x: 50, y: 25, r: 2, alpha: 0.1 },
  { kind: 'dot', x: 65, y: 52, r: 3, alpha: 0.08 },
  { kind: 'cross', x: 84, y: 20, s: 7, alpha: 0.1 },
  { kind: 'cross', x: 6, y: 50, s: 8, alpha: 0.12 },
  { kind: 'cross', x: 80, y: 75, s: 7, alpha: 0.08 },
  { kind: 'cross', x: 25, y: 38, s: 6, alpha: 0.07 },
  { kind: 'cross', x: 5, y: 65, s: 6, alpha: 0.08 },
  { kind: 'cross', x: 70, y: 30, s: 7, alpha: 0.07 },
  { kind: 'cross', x: 35, y: 85, s: 6, alpha: 0.07 },
  { kind: 'diamond', x: 10, y: 26, s: 8, alpha: 0.13 },
  { kind: 'diamond', x: 92, y: 65, s: 10, alpha: 0.1 },
  { kind: 'diamond', x: 75, y: 42, s: 6, alpha: 0.08 },
  { kind: 'diamond', x: 18, y: 80, s: 6, alpha: 0.08 },
  { kind: 'diamond', x: 92, y: 14, s: 8, alpha: 0.07 },
  { kind: 'ring', x: 94, y: 35, r: 6, alpha: 0.1 },
  { kind: 'ring', x: 15, y: 58, r: 8, alpha: 0.07 },
  { kind: 'ring', x: 5, y: 20, r: 7, alpha: 0.08 },
  { kind: 'ring', x: 68, y: 75, r: 5, alpha: 0.07 },
  { kind: 'triangle', x: 3, y: 45, s: 7, angle: 15, alpha: 0.1 },
  { kind: 'triangle', x: 95, y: 70, s: 6, angle: -20, alpha: 0.08 },
  { kind: 'triangle', x: 97, y: 25, s: 6, angle: 40, alpha: 0.07 },
];

// Mouvement propre à chaque forme (déterministe pour éviter les écarts serveur / client).
const MOTION = SHAPES.map((_, i) => ({
  ampX: 3 + ((i * 7) % 6),
  ampY: 3 + ((i * 5) % 6),
  period: 20_000 + ((i * 3_700) % 20_000),
  phase: (i * 1.7) % (Math.PI * 2),
  depth: 0.3 + ((i * 13) % 10) / 10,
}));

function draw(ctx: CanvasRenderingContext2D, width: number, height: number, t: number, mouse: { x: number; y: number }, ink = '255,255,255') {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;
  SHAPES.forEach((shape, i) => {
    const m = MOTION[i];
    const drift = (Math.PI * 2 * t) / m.period + m.phase;
    const x = (shape.x / 100) * width + Math.sin(drift) * m.ampX + mouse.x * 18 * m.depth;
    const y = (shape.y / 100) * height + Math.cos(drift) * m.ampY + mouse.y * 12 * m.depth;
    const color = `rgba(${ink},${shape.alpha})`;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    switch (shape.kind) {
      case 'line': {
        const rad = (shape.angle * Math.PI) / 180;
        const x2 = x + Math.cos(rad) * shape.len;
        const y2 = y + Math.sin(rad) * shape.len;
        const gradient = ctx.createLinearGradient(x, y, x2, y2);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, `rgba(${ink},0)`);
        ctx.strokeStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        break;
      }
      case 'dot':
        ctx.beginPath();
        ctx.arc(x, y, shape.r / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ring':
        ctx.beginPath();
        ctx.arc(x, y, shape.r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'diamond':
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-shape.s / 2, -shape.s / 2, shape.s, shape.s);
        ctx.restore();
        break;
      case 'cross':
        ctx.beginPath();
        ctx.moveTo(x - shape.s / 2, y);
        ctx.lineTo(x + shape.s / 2, y);
        ctx.moveTo(x, y - shape.s / 2);
        ctx.lineTo(x, y + shape.s / 2);
        ctx.stroke();
        break;
      case 'triangle':
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((shape.angle * Math.PI) / 180);
        ctx.beginPath();
        ctx.moveTo(0, -shape.s / 2);
        ctx.lineTo(shape.s / 2, shape.s / 2);
        ctx.lineTo(-shape.s / 2, shape.s / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
    }
  });
}

export function Constellation() {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const box = wrapper.current;
    if (!el || !box) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Couleur d'encre du thème (triplet RVB de --fg) : traits foncés sur fond blanc, clairs sur fond noir.
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim().split(/\s+/).join(',') || '22,24,35';
    const finePointer = window.matchMedia('(pointer: fine) and (min-width: 1024px)').matches;
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = false;
    let onScreen = true;
    const target = { x: 0, y: 0 };
    const mouse = { x: 0, y: 0 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = box.clientWidth;
      height = box.clientHeight;
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, width, height, reduced ? 0 : performance.now(), mouse, ink);
    };

    const loop = (now: number) => {
      mouse.x += (target.x - mouse.x) * 0.06;
      mouse.y += (target.y - mouse.y) * 0.06;
      draw(ctx, width, height, now, mouse, ink);
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduced || running || document.hidden || !onScreen) return;
      running = true;
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX / window.innerWidth - 0.5;
      target.y = event.clientY / window.innerHeight - 0.5;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(box);
    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    intersection.observe(box);
    document.addEventListener('visibilitychange', onVisibility);
    if (finePointer && !reduced) window.addEventListener('pointermove', onMove, { passive: true });

    resize();
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <div ref={wrapper} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Halos flous derrière le titre : cyan à gauche, rose à droite */}
      <div
        className="absolute left-[8%] top-[14%] h-[34rem] w-[34rem] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgb(var(--cyan) / 0.13) 0%, transparent 65%)' }}
      />
      <div
        className="absolute right-[6%] top-[22%] h-[34rem] w-[34rem] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgb(var(--rose) / 0.12) 0%, transparent 65%)' }}
      />
      <canvas ref={canvas} className="absolute inset-0" />
      {/* Ligne de séparation basse, comme EtSmart */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-fg/[0.06] to-transparent" />
    </div>
  );
}
