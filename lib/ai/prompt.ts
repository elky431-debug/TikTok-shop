import { nicheLabel } from '@/lib/niches';
import { videoStyleLabel } from '@/lib/profile-rules';
import type { TopVideo } from '@/lib/db/types';
import { formatEuros, formatInt } from '@/lib/utils';
import { ANGLES, angleLabel, DEFAULT_SETTINGS, durationBounds, formatLabel, SCRIPT_FORMATS, shotRange, TONES, type ScriptSettings } from './formats';
import type { Feedback, ScriptInput, SeriesAngleInput, StyleProfile } from './types';

/**
 * Prompt système : un expert des vidéos TikTok Shop françaises.
 * Stable d'un appel à l'autre (aucune donnée variable) pour profiter du cache de prompt : les réglages, le style
 * personnel et les retours de l'utilisateur vont dans le message.
 */
export const SYSTEM_PROMPT = `Tu es un expert des vidéos TikTok Shop en France. Tu écris des scripts courts pour des créateurs affiliés qui vendent des produits via le panier orange de TikTok.

Ce qui fait vendre une vidéo TikTok Shop :
- L'accroche tient dans les 2 premières secondes. Elle arrête le pouce : une phrase parlée de 8 mots maximum, moins de 3 secondes à l'oral. Pas de « Salut tout le monde ».
- La démonstration est concrète : on voit le produit utilisé, en vrai, en une prise si possible.
- Il y a une preuve visuelle : un résultat, un avant-après, une texture, un détail filmé en gros plan.
- L'appel à l'action renvoie vers le panier orange, simplement (« C'est dans le panier orange, juste en dessous »). C'est le produit qui est dans le panier orange : ne parle pas de « lien ».
- Le ton est naturel, parlé, au tutoiement, comme un ami qui conseille. Phrases courtes. Français de France, pas de traduction de l'anglais.
- Le créateur parle comme dans une vraie vidéo, pas comme une fiche : il ne dit jamais « la fiche indique », « il est présenté comme » ou « d'après la description ». Il reprend les caractéristiques avec ses mots, simplement (« Il a un filtre », « 8 programmes, sur écran tactile »).

Règles strictes, sans exception :
- Aucune promesse médicale ou de santé : jamais « guérit », « soigne », « fait disparaître », « fait maigrir », pas de maladie citée.
- Aucune fausse affirmation : n'invente ni caractéristique, ni chiffre, ni test, ni certification, ni avis client. Utilise seulement les informations de la fiche produit.
- Aucun superlatif non prouvé : pas de « le meilleur », « n°1 », « miracle », « révolutionnaire », « 100 % efficace », « résultat garanti ».
- Aucune mention d'argent gagné : ni pour le créateur (pas de commission, pas de revenus), ni pour le spectateur.
- Une comparaison ne nomme aucune marque concurrente et ne la dénigre pas : on compare avec « ce que j'utilisais avant » ou « la version classique », sur des critères qu'on voit à l'écran.
- Ne fais pas dire au créateur qu'il utilise le produit depuis longtemps s'il ne l'a pas encore reçu : formule les ressentis au présent, à vérifier par lui.
- Reste dans le style de vidéo du créateur (face caméra, voix off, mains seulement ou avant-après) et imite son ton (phrase d'exemple, style personnel), sans recopier ses phrases partout.
- La collaboration commerciale est toujours signalée : ne la cache pas, ne la tourne pas en dérision.

Ce que tu produis :
- 10 accroches différentes (angles variés : curiosité, problème, résultat, question, objection, prix), chacune avec sa durée parlée estimée en secondes. Au plus 3 accroches sur 10 sont des questions : les autres sont des affirmations directes qui donnent envie de voir la suite.
- 3 scripts complets, de la durée demandée dans les réglages (15, 30 ou 60 secondes), avec le ton demandé. Si un angle est imposé, les 3 scripts le traitent chacun d'une façon différente ; sinon chaque script a son propre angle. Chaque script est découpé en plans (3 ou 4 pour 15 s, 4 à 6 pour 30 s, 6 à 9 pour 60 s) ; pour chaque plan : la plage de temps, ce qu'on voit, ce que dit le créateur mot pour mot, et le texte à l'écran (court, lisible en une seconde). Le premier plan reprend une accroche. Le dernier plan est l'appel à l'action vers le panier orange.
- Pour chaque script : 2 à 4 idées de plans de coupe (gestes, détails, gros plans à filmer en plus pour le montage), une légende courte et 3 à 5 hashtags pertinents, en mots français (pas de #skincare, #airfryer ou #kbeauty : #soinvisage, #friteusesanshuile, #soinscoreens ; seul #tiktokshop reste tel quel).`;

/** Retouches (une ligne, raccourcir, plus percutant, traduction, série d'angles) : mêmes règles, autre tâche. */
export const EDIT_SYSTEM_PROMPT = `${SYSTEM_PROMPT.split('Ce que tu produis :')[0].trim()}

Ta tâche : retoucher un script existant, ou proposer des angles de vidéo, exactement comme le demande le message, en gardant ces règles.`;

export const FORMAT_GUIDE: Record<string, string> = {
  demo: 'Le créateur montre le produit en action et parle à la caméra. Priorité à la démonstration en une prise.',
  avant_apres: 'Deux temps filmés dans la même lumière et le même cadrage : avant, puis après. Pas de retouche.',
  histoire: 'Une petite histoire vraie : le problème du créateur, la découverte du produit, ce qui a changé. Sincère, sans exagération.',
  reponse_commentaire: 'Le créateur répond à un commentaire d’abonné affiché à l’écran (« Ça vaut vraiment le coup ? »), en montrant plutôt qu’en affirmant.',
  unboxing: 'Le créateur ouvre le colis, découvre le produit et fait un premier test à chaud.',
  comparaison:
    'Le produit face à ce que le créateur utilisait avant (ou la version classique), critère par critère, filmés côte à côte. Aucune marque citée, aucun chiffre inventé.',
  routine: 'Le produit à sa place dans une routine du créateur (matin, ménage, séance, coucher…), étape par étape, en plans courts.',
  top3: 'Trois raisons, trois usages ou trois détails du produit, comptés à l’écran (3, 2, 1), du plus simple au plus fort. Ne dis jamais « n°1 » ni « numéro un » : on croirait un classement.',
};

const TONE_GUIDE: Record<string, string> = {
  energique: 'rythme rapide, phrases très courtes, verbes d’action, quelques exclamations (pas à chaque phrase)',
  calme: 'posé et doux, phrases un peu plus longues, on prend le temps de montrer les gestes et les textures',
  humour: 'autodérision légère et situations du quotidien, sans se moquer de personne ni du produit, la démonstration reste sérieuse',
  expert: 'précis et pédagogique : comment c’est fait, comment ça s’utilise, ce qu’il faut savoir, sans jargon inutile',
};

const ANGLE_GUIDE: Record<string, string> = {
  probleme: 'un souci concret du quotidien, puis comment le produit s’en occupe (sans promesse de résultat)',
  transformation: 'le changement visible : avant, pendant, après, filmé honnêtement',
  objection: 'la question qui fait hésiter (prix, efficacité, utilité, taille…) et la réponse montrée en images',
  prix: 'ce qu’on a pour ce prix, concrètement, sans dire que c’est « donné » ni comparer à un prix inventé',
};

/**
 * Une vidéo de référence en une ligne : son texte, et seulement les chiffres que la source donne (ventes, vues,
 * durée). La durée des vidéos qui vendent guide la longueur du script.
 */
export function describeVideo(v: TopVideo): string {
  const facts = [
    v.estimated_sales !== null ? `${formatInt(v.estimated_sales)} ventes estimées` : null,
    v.views !== null ? `${formatInt(v.views)} vues` : null,
    v.duration_s != null ? `${v.duration_s} secondes` : null,
  ].filter(Boolean);
  const text = v.title === 'Vidéo sans description' ? 'vidéo sans description' : `« ${v.title} »`;
  return `${text}${facts.length ? ` (${facts.join(', ')})` : ''}${v.hook ? `, accroche : « ${v.hook} »` : ''}`;
}

/** Réglages en clair pour le message : durée (et bornes), ton, angle. */
export function describeSettings(settings: ScriptSettings, seriesAngle?: SeriesAngleInput | null): string[] {
  const { accept } = durationBounds(settings.duration);
  const [minShots, maxShots] = shotRange(settings.duration);
  const tone = TONES.find((t) => t.id === settings.tone);
  const lines = [
    '## Réglages',
    `- Durée de chaque script : ${settings.duration} secondes (entre ${accept[0]} et ${accept[1]} s), ${minShots} à ${maxShots} plans.`,
    `- Ton : ${tone?.label ?? 'naturel'} — ${TONE_GUIDE[settings.tone] ?? 'naturel et direct'}.`,
  ];
  if (seriesAngle) {
    lines.push(`- Angle : imposé par la série (voir plus bas), de type « ${angleLabel(seriesAngle.angle)} ».`);
  } else if (settings.angle === 'varie') {
    lines.push(`- Angle : varié, un angle différent par script parmi : ${ANGLES.filter((a) => a.id !== 'varie').map((a) => a.label.toLowerCase()).join(', ')}.`);
  } else {
    lines.push(`- Angle : ${angleLabel(settings.angle)} — ${ANGLE_GUIDE[settings.angle]}. Les 3 scripts suivent cet angle, chacun raconté autrement.`);
  }
  return lines;
}

export function describeStyle(style: StyleProfile): string[] {
  const list = (items: string[]) => items.map((x) => `« ${x} »`).join(', ');
  return [
    '## Style personnel du créateur (tiré de ses propres vidéos)',
    `- En bref : ${style.summary}`,
    `- Ton : ${style.tone} ; phrases ${style.sentence_length} ; ${style.address}.`,
    ...(style.expressions.length ? [`- Expressions à reprendre naturellement (une ou deux par script, pas plus) : ${list(style.expressions)}`] : []),
    ...(style.openings.length ? [`- Ses façons de commencer : ${list(style.openings)}`] : []),
    ...(style.closings.length ? [`- Ses façons de conclure : ${list(style.closings)}`] : []),
    ...(style.do.length ? [`- À faire : ${style.do.join(' ; ')}`] : []),
    ...(style.avoid.length ? [`- À éviter : ${style.avoid.join(' ; ')}`] : []),
    'Garde le tutoiement face au spectateur, même si le créateur vouvoie parfois.',
  ];
}

export function describeFeedback(feedback: Feedback): string[] {
  const lines: string[] = [];
  if (feedback.best.length) {
    lines.push('## Ses scripts qui ont le mieux marché (d’après ses notes)');
    for (const ex of feedback.best) {
      const verdict = [ex.stars ? `${ex.stars}/5` : null, ex.sold ? 'a vendu' : null].filter(Boolean).join(', ');
      lines.push(
        `- « ${ex.title} » (${formatLabel(ex.format)}${verdict ? `, ${verdict}` : ''}) : accroche « ${ex.hook} » ; déroulé : ${ex.lines.map((l) => `« ${l} »`).join(' / ')}`,
      );
    }
    lines.push('Reprends ce qui a marché (type d’accroche, rythme, structure) sans recopier ces phrases.');
  }
  if (feedback.weak.length) {
    lines.push('## Ce qui lui a moins plu', ...feedback.weak.map((w) => `- « ${w.title} » (${w.stars}/5) : ne refais pas ce déroulé.`));
  }
  return lines;
}

/** Message utilisateur : fiche produit, format, réglages, style du créateur, retours et vidéos de référence. */
export function buildUserPrompt(input: ScriptInput): string {
  const p = input.product;
  const videos = input.topVideos.slice(0, 5);
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const lines = [
    '## Fiche produit',
    `- Nom : ${p.name}`,
    `- Niche : ${nicheLabel(p.niche)}`,
    `- Description : ${p.description || 'non fournie'}`,
    `- Prix : ${formatEuros(p.price_cents)}`,
    `- Boutique : ${p.shop_name || 'non précisée'}`,
    '',
    '## Format demandé',
    `${formatLabel(input.format)} : ${FORMAT_GUIDE[input.format] ?? ''}`,
    '',
    ...describeSettings(settings, input.seriesAngle),
    '',
    ...(input.seriesAngle
      ? [
          '## Angle imposé (série de 20 vidéos sur ce produit)',
          `« ${input.seriesAngle.title} » : ${input.seriesAngle.pitch}`,
          `Accroche de départ : « ${input.seriesAngle.hook} » (à reprendre ou à varier).`,
          '',
        ]
      : []),
    '## Le créateur',
    `- Prénom : ${input.firstName ?? 'non précisé'}`,
    `- Style de vidéo : ${videoStyleLabel(input.style)}`,
    `- Une phrase qu'il dirait : ${input.examplePhrase ? `« ${input.examplePhrase} »` : 'non précisée (ton naturel et direct)'}`,
    '',
    ...(input.personalStyle ? [...describeStyle(input.personalStyle), ''] : []),
    ...(input.inspiration ? [input.inspiration, ''] : []),
    ...(input.feedback && (input.feedback.best.length || input.feedback.weak.length) ? [...describeFeedback(input.feedback), ''] : []),
    '## Vidéos qui vendent déjà ce produit (pour t’inspirer, sans copier)',
    ...(videos.length ? videos.map((v) => `- ${describeVideo(v)}`) : ['- Aucune donnée disponible.']),
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
