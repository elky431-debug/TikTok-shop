/**
 * Chiffres de marché affichés sur l'accueil. Règle du projet : chiffres réels et sourcés, ou absents.
 * Rien d'autre que ces trois chiffres, et aucune promesse de gains autour (voir DECISIONS.md, étape 4).
 */
export interface MarketFigure {
  value: string;
  label: string;
  /** Précision affichée sous le chiffre (périmètre de l'étude). */
  scope: string;
  source: { name: string; url: string; date: string };
}

const LENGOW = {
  name: 'Lengow',
  url: 'https://www.lengow.com/fr/aller-plus-loin/est-ce-que-tiktok-shop-est-un-succes',
  date: '9 juillet 2026',
};

export const MARKET_FIGURES: MarketFigure[] = [
  {
    value: '132,8 M€',
    label: 'de ventes TikTok Shop en France sur 90 jours',
    scope: 'Estimations de Kalodata, publiées par Lengow.',
    source: LENGOW,
  },
  {
    value: '69,9 %',
    label: 'des ventes faites par des créateurs affiliés',
    scope: 'France, Allemagne, Espagne et Italie réunies.',
    source: LENGOW,
  },
  {
    value: '7,19 $ → 74,07 $',
    label: 'de ventes moyennes par vidéo, avec une seule vidéo sur un produit, puis à partir de 20 vidéos',
    scope: 'Étude américaine de Flywheel et Reacher, sur 1,5 million d’échantillons.',
    source: {
      name: 'Digiday',
      url: 'https://digiday.com/future-of-tv/future-of-tv-briefing-tiktok-shop-success-small-creators-more-videos/',
      date: '14 octobre 2026',
    },
  },
];
