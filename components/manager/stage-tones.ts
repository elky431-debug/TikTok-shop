import type { ProductStage } from '@/lib/v2/manager';

/** Couleurs des pastilles de statut (module sans 'use client' : lisible par les pages serveur). */
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
