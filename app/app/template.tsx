'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Entrée de chaque page de l'appli, comme les sections d'EtSmart : fondu et montée de 20 px en 300 ms. Avec « moins
 * d'animations », `MotionConfig reducedMotion="user"` (coque) retire la montée et ne garde qu'un fondu.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {children}
    </motion.div>
  );
}
