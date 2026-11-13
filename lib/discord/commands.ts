import { BRAND } from '@/lib/brand';
import { NICHES } from '@/lib/niches';

/**
 * Commandes du serveur (doc Discord : interactions/application-commands). Types d'options : 3 STRING, 4 INTEGER,
 * 10 NUMBER ; `choices` (25 au plus, seules valeurs permises) ; `autocomplete` (incompatible avec `choices`).
 * Noms en minuscules, 32 caractères au plus ; descriptions de 100 caractères au plus. Les options obligatoires
 * passent avant les facultatives.
 */
const NICHE_CHOICES = NICHES.map((n) => ({ name: n.label, value: n.id }));

export const DISCORD_COMMANDS = [
  {
    name: 'lier',
    type: 1,
    description: `Lie ton compte Discord à ton compte ${BRAND}`,
    options: [{ type: 3, name: 'code', description: 'Le code affiché dans l’appli (page Récap)', required: true }],
  },
  { name: 'delier', type: 1, description: `Retire la liaison avec ton compte ${BRAND}` },
  {
    name: 'produits',
    type: 1,
    description: 'Le top du jour dans une niche (selon ton plan)',
    options: [{ type: 3, name: 'niche', description: 'La niche', required: true, choices: NICHE_CHOICES }],
  },
  {
    name: 'score',
    type: 1,
    description: 'Le score d’un produit du jour, expliqué',
    options: [{ type: 3, name: 'produit', description: 'Tape quelques lettres du nom', required: true, autocomplete: true, max_length: 100 }],
  },
  {
    name: 'script',
    type: 1,
    description: 'Une accroche rapide pour un produit du jour',
    options: [{ type: 3, name: 'produit', description: 'Tape quelques lettres du nom', required: true, autocomplete: true, max_length: 100 }],
  },
  {
    name: 'alerte',
    type: 1,
    description: 'Crée une alerte : niche et commission minimale',
    options: [
      { type: 3, name: 'niche', description: 'La niche à surveiller', required: true, choices: [...NICHE_CHOICES, { name: 'Toutes les niches', value: 'toutes' }] },
      { type: 10, name: 'commission', description: 'Commission minimale, en % du prix (ex. 15)', required: true, min_value: 0, max_value: 80 },
      { type: 4, name: 'ventes_7j', description: 'Ventes minimales sur 7 jours (facultatif)', required: false, min_value: 0, max_value: 1_000_000 },
      { type: 4, name: 'croissance', description: 'Croissance minimale sur 7 jours, en % (facultatif)', required: false, min_value: -100, max_value: 1000 },
    ],
  },
  {
    name: 'classement',
    type: 1,
    description: 'Le classement des séries de jours, sur inscription',
    options: [
      {
        type: 3,
        name: 'choix',
        description: 'Ce que tu veux faire',
        required: true,
        choices: [
          { name: 'Voir ma série', value: 'voir' },
          { name: 'Rejoindre le classement de la semaine', value: 'rejoindre' },
          { name: 'Quitter le classement', value: 'quitter' },
        ],
      },
    ],
  },
] as const;

export type DiscordCommandName = (typeof DISCORD_COMMANDS)[number]['name'];
