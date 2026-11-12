'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

export const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Apparition au défilement, une seule fois : fondu + montée de 16 px en 500 ms.
 * Avec « réduire les animations », simple fondu sans mouvement.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'li' | 'section';
}) {
  const reduced = useReducedMotion();
  const Component = as === 'li' ? motion.li : as === 'section' ? motion.section : motion.div;
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: reduced ? 0.2 : 0.5, delay: reduced ? 0 : delay, ease: EASE }}
    >
      {children}
    </Component>
  );
}

/** Rangée de cartes : chaque enfant apparaît avec 80 ms d'écart. */
export function RevealGroup({ children, className, step = 0.08 }: { children: ReactNode[]; className?: string; step?: number }) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <Reveal key={i} delay={i * step} className="h-full">
          {child}
        </Reveal>
      ))}
    </div>
  );
}
