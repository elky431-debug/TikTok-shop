'use client';

import { PartyPopper } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const MESSAGES: Record<string, string> = {
  produit: 'Produit choisi : c’est parti !',
  echantillon: 'Échantillon : c’est noté.',
  scripts: 'Scripts prêts à tourner !',
  planifier: 'Vidéos planifiées : rappel le jour J.',
  tourner: 'Tournage validé !',
  publier: 'Publication validée !',
  resultats: 'Lancement à jour.',
  premiere: 'Ta première vidéo est en ligne, bravo !',
};

const COLORS = ['rgb(var(--cyan))', 'rgb(var(--rose))', 'rgb(var(--gain))', 'rgb(var(--warn))'];

/**
 * Petite célébration quand une étape est validée (`?bravo=<étape>`) ou que la première vidéo est en ligne
 * (`?bravo=premiere`) : des confettis qui partent du haut de l'écran et un message, puis l'adresse redevient propre.
 * Sans animation si la personne les réduit (le message reste, annoncé aux lecteurs d'écran).
 */
export function Celebration() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const key = params.get('bravo');
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!key || !MESSAGES[key]) return;
    setShown(key);
    const next = new URLSearchParams(params.toString());
    next.delete('bravo');
    const timer = window.setTimeout(() => setShown(null), key === 'premiere' ? 3200 : 2200);
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois par célébration
  }, [key]);

  const big = shown === 'premiere';
  const pieces = big ? 36 : 18;
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {shown ? MESSAGES[shown] : ''}
      </p>
      <AnimatePresence>
        {shown ? (
          <motion.div
            key={shown}
            className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center overflow-hidden pt-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden="true"
          >
            {!reduce
              ? Array.from({ length: pieces }, (_, i) => {
                  const angle = (i / pieces) * Math.PI * 2;
                  const distance = (big ? 220 : 140) + (i % 3) * 30;
                  return (
                    <motion.span
                      key={i}
                      className="absolute top-24 h-2.5 w-2.5 rounded-sm"
                      style={{ background: COLORS[i % COLORS.length] }}
                      initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
                      animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.7 + 120, rotate: 360, opacity: 0, scale: 0.6 }}
                      transition={{ duration: big ? 1.6 : 1.1, ease: 'easeOut' }}
                    />
                  );
                })
              : null}
            <motion.div
              className="flex items-center gap-2 rounded-2xl border border-line bg-raised px-5 py-3 text-sm font-semibold shadow-lg"
              initial={reduce ? false : { y: -16, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            >
              <PartyPopper className="h-5 w-5 text-rose-ink" aria-hidden="true" />
              {MESSAGES[shown]}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
