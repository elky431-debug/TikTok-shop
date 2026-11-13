'use client';

import { ChevronLeft, ChevronRight, Minus, MonitorPlay, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buttonClasses, type ButtonVariant } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SIZE_INDEX,
  DEFAULT_SPEED,
  initialMode,
  lineDuration,
  MAX_SPEED,
  MIN_SPEED,
  scrollSpeed,
  SIZES,
  type PrompterMode,
} from './teleprompter-model';

/**
 * Téléprompteur plein écran pour tourner sans apprendre son texte : gros texte blanc sur noir, défilement réglable,
 * pause et reprise (bouton, toucher ou barre d'espace), compte à rebours de 3 s, écran maintenu allumé.
 * Avec « animations réduites » (prefers-reduced-motion), pas de défilement continu : une phrase à la fois, qui change
 * d'un coup (à la main, ou au rythme choisi).
 */

type WakeLockSentinelLike = { release(): Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } };

/** Hauteur du repère de lecture depuis le haut de la zone de texte (même unité pour le repère et la marge). */
const GUIDE_TOP = '20vh';

export function Teleprompter({
  title,
  lines,
  label = 'Téléprompteur',
  variant = 'primary',
  className,
}: {
  title: string;
  lines: string[];
  label?: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  function start() {
    // Plein écran demandé pendant le geste (obligatoire pour les navigateurs) ; sans effet sur iPhone, où le
    // téléprompteur occupe quand même tout l'écran.
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    setOpen(true);
  }

  const close = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    setOpen(false);
    window.setTimeout(() => trigger.current?.focus(), 0);
  }, []);

  return (
    <>
      <button ref={trigger} type="button" onClick={start} className={buttonClasses(variant, 'sm', className)}>
        <MonitorPlay className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
      {open ? createPortal(<PrompterScreen title={title} lines={lines} onClose={close} />, document.body) : null}
    </>
  );
}

function PrompterScreen({ title, lines, onClose }: { title: string; lines: string[]; onClose: () => void }) {
  const [reduced, setReduced] = useState(false);
  const [mode, setMode] = useState<PrompterMode>('scroll');
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE_INDEX);
  const [line, setLine] = useState(0);
  const [finished, setFinished] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Animations réduites : une phrase à la fois par défaut.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    setMode(initialMode(query.matches));
  }, []);

  // Défilement de la page bloqué, focus sur « Fermer », écran maintenu allumé si possible.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    let lock: WakeLockSentinelLike | null = null;
    const nav = navigator as WakeLockNavigator;
    const acquire = () => {
      if (document.visibilityState === 'visible') nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => undefined);
    };
  }, []);

  // Compte à rebours avant de lancer.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      setPlaying(true);
      return;
    }
    const t = window.setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  // Défilement continu.
  useEffect(() => {
    const el = scroller.current;
    if (!playing || mode !== 'scroll' || !el) return;
    let raf = 0;
    let last = performance.now();
    let position = el.scrollTop;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (Math.abs(el.scrollTop - position) > 4) position = el.scrollTop; // l'utilisateur a fait défiler à la main
      position += scrollSpeed(speed) * dt;
      el.scrollTop = position;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        setPlaying(false);
        setFinished(true);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, mode, speed]);

  // Une phrase à la fois : passage à la suivante au rythme choisi, sans animation.
  useEffect(() => {
    if (!playing || mode !== 'lines') return;
    const t = window.setTimeout(() => {
      if (line >= lines.length - 1) {
        setPlaying(false);
        setFinished(true);
      } else setLine(line + 1);
    }, lineDuration(lines[line] ?? '', speed));
    return () => window.clearTimeout(t);
  }, [playing, mode, line, speed, lines]);

  const restart = useCallback(() => {
    setPlaying(false);
    setCountdown(null);
    setFinished(false);
    setLine(0);
    if (scroller.current) scroller.current.scrollTop = 0;
  }, []);

  const toggle = useCallback(() => {
    if (countdown !== null) {
      setCountdown(null);
      return;
    }
    if (playing) {
      setPlaying(false);
      return;
    }
    if (finished) restart();
    const atStart = mode === 'lines' ? line === 0 : (scroller.current?.scrollTop ?? 0) < 4;
    if (atStart) setCountdown(3);
    else setPlaying(true);
  }, [countdown, playing, finished, mode, line, restart]);

  const move = useCallback(
    (delta: number) => {
      setFinished(false);
      setLine((l) => Math.min(lines.length - 1, Math.max(0, l + delta)));
    },
    [lines.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowUp') setSpeed((s) => Math.min(MAX_SPEED, s + 1));
      else if (e.key === 'ArrowDown') setSpeed((s) => Math.max(MIN_SPEED, s - 1));
      else if (e.key === 'ArrowRight' && mode === 'lines') move(1);
      else if (e.key === 'ArrowLeft' && mode === 'lines') move(-1);
      else if (e.key === '+') setSizeIndex((i) => Math.min(SIZES.length - 1, i + 1));
      else if (e.key === '-') setSizeIndex((i) => Math.max(0, i - 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, toggle, move, mode]);

  const size = SIZES[sizeIndex];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Téléprompteur : ${title}`}
      className="fixed inset-0 z-[100] flex h-[100dvh] flex-col bg-black text-white"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
          Fermer
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm text-white/60">{title}</p>
        <button
          type="button"
          onClick={restart}
          className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Recommencer</span>
          <span className="sr-only sm:hidden">Recommencer</span>
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {mode === 'scroll' ? (
          <>
            {/* Repère de lecture : la ligne à dire passe dans cette bande. */}
            <div
              className="pointer-events-none absolute inset-x-0 z-10 border-y border-cyan/40 bg-cyan/[0.06]"
              style={{ top: GUIDE_TOP, height: size * 1.4 }}
              aria-hidden="true"
            />
            <div
              ref={scroller}
              onClick={toggle}
              className="scrollbar-none h-full overflow-y-auto px-5 sm:px-10"
              style={{ paddingTop: GUIDE_TOP, paddingBottom: '75vh' }}
            >
              <div className="mx-auto max-w-3xl space-y-[0.9em] font-semibold" style={{ fontSize: size, lineHeight: 1.4 }}>
                {lines.map((text, i) => (
                  <p key={i}>{text}</p>
                ))}
                <p className="text-[#25F4EE]" aria-hidden="true">
                  ■
                </p>
              </div>
            </div>
          </>
        ) : (
          <div onClick={() => move(1)} className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
            <p className="num text-sm font-semibold text-white/50" aria-live="polite">
              Phrase {line + 1} sur {lines.length}
            </p>
            <p className="mx-auto max-w-3xl font-semibold" style={{ fontSize: size, lineHeight: 1.35 }} aria-live="polite">
              {lines[line]}
            </p>
            {lines[line + 1] ? <p className="mx-auto max-w-2xl text-lg text-white/40">Ensuite : {lines[line + 1]}</p> : null}
          </div>
        )}

        {countdown !== null ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70" aria-live="assertive">
            <span className="num text-8xl font-bold text-[#25F4EE]">{countdown}</span>
          </div>
        ) : null}
        {finished && countdown === null ? (
          <p className="absolute inset-x-0 bottom-4 z-20 text-center text-sm font-semibold text-white/70" role="status">
            Fin du script. Appuie sur Recommencer pour une autre prise.
          </p>
        ) : null}
      </div>

      <div className="border-t border-white/10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <div className="flex items-center gap-1" role="group" aria-label="Vitesse">
            <RoundButton label="Moins vite" onClick={() => setSpeed((s) => Math.max(MIN_SPEED, s - 1))} disabled={speed <= MIN_SPEED}>
              <Minus className="h-4 w-4" aria-hidden="true" />
            </RoundButton>
            <span className="num w-14 text-center text-xs leading-tight text-white/70">
              Vitesse
              <br />
              <strong className="text-sm text-white">{speed}</strong>
            </span>
            <RoundButton label="Plus vite" onClick={() => setSpeed((s) => Math.min(MAX_SPEED, s + 1))} disabled={speed >= MAX_SPEED}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </RoundButton>
          </div>

          <div className="flex items-center gap-2">
            {mode === 'lines' ? (
              <RoundButton label="Phrase précédente" onClick={() => move(-1)} disabled={line === 0}>
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </RoundButton>
            ) : null}
            <button
              type="button"
              onClick={toggle}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-fill text-on-primary shadow-[var(--glow-pink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
              aria-label={playing || countdown !== null ? 'Pause' : 'Lancer'}
            >
              {playing || countdown !== null ? <Pause className="h-6 w-6" aria-hidden="true" /> : <Play className="h-6 w-6 translate-x-0.5" aria-hidden="true" />}
            </button>
            {mode === 'lines' ? (
              <RoundButton label="Phrase suivante" onClick={() => move(1)} disabled={line >= lines.length - 1}>
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </RoundButton>
            ) : null}
          </div>

          <div className="flex items-center gap-1" role="group" aria-label="Taille du texte">
            <RoundButton label="Texte plus petit" onClick={() => setSizeIndex((i) => Math.max(0, i - 1))} disabled={sizeIndex === 0}>
              <span className="text-xs font-bold">A</span>
            </RoundButton>
            <RoundButton label="Texte plus grand" onClick={() => setSizeIndex((i) => Math.min(SIZES.length - 1, i + 1))} disabled={sizeIndex === SIZES.length - 1}>
              <span className="text-lg font-bold">A</span>
            </RoundButton>
          </div>
        </div>
        <div className="mx-auto mt-2 flex max-w-3xl items-center justify-center">
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setCountdown(null);
              setMode(mode === 'scroll' ? 'lines' : 'scroll');
            }}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10 hover:text-white"
          >
            {mode === 'scroll' ? 'Passer en « une phrase à la fois »' : reduced ? 'Activer le défilement continu (animations réduites)' : 'Revenir au défilement continu'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoundButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:bg-white/10 disabled:opacity-30',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan',
      )}
    >
      {children}
    </button>
  );
}
