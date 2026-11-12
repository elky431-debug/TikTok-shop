'use client';

import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/** Comptage de 0 à la valeur finale en 1,2 s, une seule fois, quand le chiffre entre à l'écran. */
export function CountUp({ value, suffix = '', className }: { value: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  // Valeur finale au rendu serveur (lisible sans JavaScript), remise à 0 avant le comptage.
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!reduced) setDisplay(0);
  }, [reduced]);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduced, value]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true">
        {display}
        {suffix}
      </span>
      <span className="sr-only">
        {value}
        {suffix}
      </span>
    </span>
  );
}
