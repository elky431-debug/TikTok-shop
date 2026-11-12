'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE } from '@/components/motion/reveal';
import { AnnouncementPill } from '@/components/ui/announcement-pill';

/**
 * Chargement du héros, en séquence (moins de 1,4 s, courbe [0.22, 1, 0.36, 1]) :
 * pastille → titre mot par mot → partie en dégradé qui glisse depuis la gauche en se défloutant
 * → sous-titre → boutons → mention. Sans mouvement si « réduire les animations ».
 */
export function HeroIntro({
  pill,
  title,
  accent,
  subtitle,
  actions,
  footnote,
  children,
}: {
  pill: string;
  title: string;
  accent: string;
  subtitle: string;
  actions: ReactNode;
  footnote: string;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const words = title.split(' ');
  const wordsStart = 0.15;
  const step = 0.06;
  const accentStart = wordsStart + words.length * step + 0.04;

  const fade = (delay: number, y = 20, duration = 0.5) =>
    reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25 } }
      : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration, delay, ease: EASE } };

  return (
    <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6">
      <motion.div {...fade(0, 8, 0.4)}>
        <AnnouncementPill className="mb-10">{pill}</AnnouncementPill>
      </motion.div>

      <h1 className="mb-8 text-[2.6rem]/[1.05] font-bold tracking-tight min-[400px]:text-5xl/[1.05] sm:text-6xl/[1.05] md:text-8xl/[1.05]">
        <span className="sr-only">
          {title} {accent}
        </span>
        <span aria-hidden="true">
          {words.map((word, i) => (
            <span key={`${word}-${i}`}>
              <motion.span
                className="inline-block text-fg"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0.25 } : { duration: 0.5, delay: wordsStart + i * step, ease: EASE }}
              >
                {word}
              </motion.span>{' '}
            </span>
          ))}
          <br />
          <motion.span
            className="text-gradient-live inline-block pr-[0.12em] italic"
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: -32, filter: 'blur(8px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            transition={reduced ? { duration: 0.25 } : { duration: 0.55, delay: accentStart, ease: EASE }}
          >
            {accent}
          </motion.span>
        </span>
      </h1>

      <motion.p className="mx-auto mb-10 max-w-xl text-base leading-relaxed text-muted sm:text-lg" {...fade(0.7)}>
        {subtitle}
      </motion.p>

      <motion.div className="flex flex-col items-center justify-center gap-3 sm:flex-row" {...fade(0.8)}>
        {actions}
      </motion.div>

      <motion.p
        className="mt-6 text-xs text-subtle"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0.25 : 0.4, delay: reduced ? 0 : 0.95 }}
      >
        {footnote}
      </motion.p>

      {children ? <motion.div {...fade(1, 24, 0.45)}>{children}</motion.div> : null}
    </div>
  );
}
