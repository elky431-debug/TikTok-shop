'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/** Respecte « moins d'animations » du système : Motion retire les déplacements et ne garde que les fondus. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
