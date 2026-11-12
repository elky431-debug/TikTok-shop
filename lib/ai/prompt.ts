import { nicheLabel } from '@/lib/niches';
import { videoStyleLabel } from '@/lib/profile-rules';
import { formatEuros } from '@/lib/utils';
import { formatLabel, SCRIPT_FORMATS } from './formats';
import type { ScriptInput } from './types';

/**
 * Prompt système : un expert des vidéos TikTok Shop françaises.
 * Stable d'un appel à l'autre (aucune donnée variable) pour profiter du cache de prompt.
 */
export const SYSTEM_PROMPT = `Tu es un expert des vidéos TikTok Shop en France. Tu écris des scripts courts pour des créateurs affiliés qui vendent des produits via le panier orange de TikTok.

Ce qui fait vendre une vidéo TikTok Shop :
- L'accroche tient dans les 2 premières secondes. Elle arrête le pouce : une phrase parlée de 8 mots maximum, moins de 3 secondes à l'oral. Pas de « Salut tout le monde ».
- La démonstration est concrète : on voit le produit utilisé, en vrai, en une prise si possible.
- Il y a une preuve visuelle : un résultat, un avant-après, une texture, un détail filmé en gros plan.
- L'appel à l'action renvoie vers le panier orange, simplement (« C'est dans le panier orange, juste en dessous »). C'est le produit qui est dans le panier orange : ne parle pas de « lien ».
- Le ton est naturel, parlé, au tutoiement, comme un ami qui conseille. Phrases courtes. Français de France, pas de traduction de l'anglais.

Règles strictes, sans exception :
- Aucune promesse médicale ou de santé : jamais « guérit », « soigne », « fait disparaître », « fait maigrir », pas de maladie citée.
- Aucune fausse affirmation : n'invente ni caractéristique, ni chiffre, ni test, ni certification, ni avis client. Utilise seulement les informations de la fiche produit.
- Aucun superlatif non prouvé : pas de « le meilleur », « n°1 », « miracle », « révolutionnaire », « 100 % efficace », « résultat garanti ».
- Aucune mention d'argent gagné : ni pour le créateur (pas de commission, pas de revenus), ni pour le spectateur.
- Ne fais pas dire au créateur qu'il utilise le produit depuis longtemps s'il ne l'a pas encore reçu : formule les ressentis au présent, à vérifier par lui.
- Reste dans le style de vidéo du créateur (face caméra, voix off, mains seulement ou avant-après) et imite le ton de sa phrase d'exemple, sans la recopier partout.

Ce que tu produis :
- 10 accroches différentes (angles variés : curiosité, problème, résultat, question, objection, prix), chacune avec sa durée parlée estimée en secondes.
- 3 scripts complets de 20 à 40 secondes, chacun avec un angle différent. Chaque script est découpé en 4 à 6 plans ; pour chaque plan : la plage de temps, ce qu'on voit, ce que dit le créateur mot pour mot, et le texte à l'écran (court, lisible en une seconde). Le premier plan reprend une accroche. Le dernier plan est l'appel à l'action vers le panier orange.
- Pour chaque script : une légende courte et 3 à 5 hashtags pertinents, en mots français (pas de #skincare, #airfryer ou #kbeauty : #soinvisage, #friteusesanshuile, #soinscoreens ; seul #tiktokshop reste tel quel).`;

const FORMAT_GUIDE: Record<string, string> = {
  demo: 'Le créateur montre le produit en action et parle à la caméra. Priorité à la démonstration en une prise.',
  avant_apres: 'Deux temps filmés dans la même lumière et le même cadrage : avant, puis après. Pas de retouche.',
  histoire: 'Une petite histoire vraie : le problème du créateur, la découverte du produit, ce qui a changé. Sincère, sans exagération.',
  reponse_commentaire: 'Le créateur répond à un commentaire d’abonné affiché à l’écran (« Ça vaut vraiment le coup ? »), en montrant plutôt qu’en affirmant.',
  unboxing: 'Le créateur ouvre le colis, découvre le produit et fait un premier test à chaud.',
};

/** Message utilisateur : fiche produit, format, style du créateur et vidéos de référence. */
export function buildUserPrompt(input: ScriptInput): string {
  const p = input.product;
  const videos = input.topVideos.slice(0, 5);
  const lines = [
    '## Fiche produit',
    `- Nom : ${p.name}`,
    `- Niche : ${nicheLabel(p.niche)}`,
    `- Description : ${p.description || 'non fournie'}`,
    `- Prix : ${formatEuros(p.price_cents)}`,
    `- Boutique : ${p.shop_name || 'non précisée'}`,
    `- Échantillon gratuit : ${p.free_sample === null ? 'inconnu' : p.free_sample ? 'oui' : 'non'}`,
    '',
    '## Format demandé',
    `${formatLabel(input.format)} : ${FORMAT_GUIDE[input.format] ?? ''}`,
    '',
    '## Le créateur',
    `- Prénom : ${input.firstName ?? 'non précisé'}`,
    `- Style de vidéo : ${videoStyleLabel(input.style)}`,
    `- Une phrase qu'il dirait : ${input.examplePhrase ? `« ${input.examplePhrase} »` : 'non précisée (ton naturel et direct)'}`,
    '',
    '## Vidéos qui vendent déjà ce produit (pour t’inspirer, sans copier)',
    ...(videos.length
      ? videos.map((v) => `- « ${v.title} » (${v.format})${v.hook ? `, accroche : « ${v.hook} »` : ''}`)
      : ['- Aucune donnée disponible.']),
    '',
    'Écris les 10 accroches et les 3 scripts.',
  ];
  return lines.join('\n');
}

export function buildHookPrompt(input: ScriptInput, existing: string[]): string {
  return [
    buildUserPrompt(input).replace('Écris les 10 accroches et les 3 scripts.', ''),
    '## Accroches déjà proposées (à ne pas répéter)',
    ...existing.map((h) => `- ${h}`),
    '',
    'Écris UNE nouvelle accroche, différente de toutes celles-ci, de 8 mots maximum.',
  ].join('\n');
}

export const KNOWN_FORMATS = SCRIPT_FORMATS.map((f) => f.id);
