'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ProductStage } from '@/lib/v2/manager';
import { cn } from '@/lib/utils';

/**
 * Briques visuelles du gestionnaire, reprises d'EtSmart (DashboardStoreManager) aux couleurs de Tracktout :
 * carte en dégradé léger, carte de chiffre, onglets en pilule, pastille de statut, fenêtre modale à en-tête teinté.
 */

/** Carte d'EtSmart : bordure fine, dégradé du haut vers transparent, ombre douce. */
export const panelClass = 'rounded-2xl border border-line bg-gradient-to-b from-fg/[0.035] to-transparent p-5 shadow-[0_12px_30px_-20px_rgb(0_0_0/0.25)]';

export function KpiCard({ title, value, sub, tone, locked }: { title: string; value: ReactNode; sub?: ReactNode; tone?: 'gain'; locked?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-gradient-to-b from-fg/[0.035] to-transparent p-5 shadow-[0_12px_30px_-20px_rgb(0_0_0/0.25)] transition hover:border-line-strong">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{title}</p>
      {locked ?? <p className={cn('num mt-2 text-2xl font-bold tracking-tight', tone === 'gain' ? 'text-gain' : 'text-fg')}>{value}</p>}
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

/** Onglets en pilule (Gestion, Échantillons…) et choix de période. */
export function Pills<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: Array<{ id: T; label: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 rounded-full border border-line bg-fg/[0.04] p-1', className)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-center text-xs transition-colors sm:text-sm',
            value === item.id ? 'bg-raised font-semibold text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export const STAGE_TONES: Record<ProductStage, string> = {
  a_lancer: 'bg-fg/[0.06] text-muted',
  echantillon_demande: 'bg-warn-soft text-warn',
  echantillon_recu: 'bg-cyan-soft text-cyan-ink',
  scripts_prets: 'bg-cyan-soft text-cyan-ink',
  en_tournage: 'bg-rose-soft text-rose-ink',
  en_ligne: 'bg-gain-soft text-gain',
  termine: 'bg-gain-soft text-gain',
  arrete: 'bg-fg/[0.06] text-subtle',
};

/** Variable CSS (triplet RVB) de chaque statut, pour les graphiques. */
const STAGE_VARS: Record<ProductStage, string> = {
  a_lancer: '--subtle',
  echantillon_demande: '--warn',
  echantillon_recu: '--cyan-ink',
  scripts_prets: '--cyan-ink',
  en_tournage: '--rose-ink',
  en_ligne: '--gain',
  termine: '--gain',
  arrete: '--muted',
};

/** Couleurs des statuts lues dans le thème (un attribut SVG ne lit pas les variables CSS). */
export function useStageColors(): Record<ProductStage, string> {
  const [colors, setColors] = useState<Record<ProductStage, string>>({
    a_lancer: '#8a8b91',
    echantillon_demande: '#b45309',
    echantillon_recu: '#00777a',
    scripts_prets: '#00777a',
    en_tournage: '#c8103f',
    en_ligne: '#0e7a43',
    termine: '#0e7a43',
    arrete: '#5f6068',
  });
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const next = { ...colors };
    for (const [stage, name] of Object.entries(STAGE_VARS) as Array<[ProductStage, string]>) {
      const value = css.getPropertyValue(name).trim();
      if (value) next[stage] = `rgb(${value.replace(/\s+/g, ' ')})`;
    }
    setColors(next);
    // Lecture unique au montage : le thème ne change pas sans recharger la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return colors;
}

/**
 * Fenêtre modale d'EtSmart : fond flouté, carte arrondie à 24 px, en-tête teinté avec halo, pied à deux boutons.
 * Se ferme au clic dehors, avec Échap ou la croix ; le focus revient au bouton qui l'a ouverte.
 */
export function Modal({
  open,
  onClose,
  icon,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const id = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-md sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-titre`}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-raised shadow-2xl ring-1 ring-cyan-ink/10 sm:rounded-3xl"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="relative overflow-hidden rounded-t-3xl p-6 pb-5">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-ink/15 via-rose-ink/5 to-transparent" aria-hidden="true" />
              <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/2 rounded-full bg-cyan-ink/10 blur-3xl" aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl border border-cyan-ink/30 bg-cyan-ink/15 p-3 text-cyan-ink [&_svg]:h-6 [&_svg]:w-6">{icon}</div>
                  <div>
                    <h2 id={`${id}-titre`} className="text-xl font-bold tracking-tight">
                      {title}
                    </h2>
                    {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2.5 text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
                  aria-label="Fermer"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/** Champs des fenêtres modales (style EtSmart : 12 px d'arrondi, focus cyan). */
export const fieldClass =
  'w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm text-fg placeholder:text-subtle transition-all focus:border-cyan-ink/50 focus:outline-none focus:ring-2 focus:ring-cyan-ink/20';
export const labelClass = 'mb-2 block text-xs font-medium text-muted';

/** Pied de fenêtre : Annuler à gauche, l'action à droite. */
export function ModalFooter({ onCancel, children }: { onCancel: () => void; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-b-3xl border-t border-line bg-fg/[0.03] p-6 pt-4">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded-xl border border-line-strong py-3.5 font-medium text-muted transition-all hover:bg-fg/[0.05] hover:text-fg"
      >
        Annuler
      </button>
      {children}
    </div>
  );
}
