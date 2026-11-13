'use client';

import { useEffect, useState } from 'react';

/**
 * Couleurs des graphiques, lues dans les variables CSS du thème (blanc par défaut, noir en option) : une valeur écrite
 * en dur dans un attribut SVG ne suivrait pas le thème. Valeurs de départ = thème blanc.
 */
export interface ChartColors {
  /** Courbe principale (cyan). */
  line: string;
  /** Seconde série (rose). */
  second: string;
  /** Graduations et légendes. */
  axis: string;
  /** Lignes de la grille (utilisées avec une faible opacité). */
  grid: string;
  /** Fond de la page (contour des points actifs). */
  page: string;
}

const LIGHT: ChartColors = { line: '#00777a', second: '#c8103f', axis: '#5f6068', grid: '#161823', page: '#ffffff' };

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(LIGHT);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    setColors({
      line: read('--cyan-hex', LIGHT.line),
      second: read('--chart-2', LIGHT.second),
      axis: read('--text-muted', LIGHT.axis),
      grid: read('--text', LIGHT.grid),
      page: read('--bg-page', LIGHT.page),
    });
  }, []);
  return colors;
}

/** Info-bulle des graphiques Recharts, aux couleurs du thème (les styles en ligne acceptent les variables CSS). */
export const tooltipStyle = {
  background: 'rgb(var(--raised))',
  border: '1px solid var(--border-strong)',
  borderRadius: 12,
  color: 'rgb(var(--fg))',
} as const;
