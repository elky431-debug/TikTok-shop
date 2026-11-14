import type { Hook, Product, Shot } from '@/lib/db/types';
import { Rng } from '@/lib/data/random';
import type { NicheId } from '@/lib/niches';
import { formatEuros } from '@/lib/utils';
import { DEFAULT_SETTINGS, DISCLOSURE_LINE, FIXED_ANGLES, type Duration, type FixedAngle, type StudioFormat, type Tone } from './formats';
import { isClean } from './guard';
import type { ScriptInput, ScriptOutput, StudioScript } from './types';
import { displayName } from '@/lib/product-name';

/**
 * Générateur de scripts simulé, sans appel d'API : utilisé quand aucune clé d'IA n'est configurée,
 * et pour le récap du matin. Déterministe pour une même entrée (graine), mais varie avec `variant`.
 * Suit les réglages (durée, ton, angle), le style personnel et les retours de l'utilisateur, comme la vraie
 * génération, et respecte les mêmes interdits : pas de promesse médicale, pas de gains, pas de superlatif.
 */

const NICHE_WORDS: Record<NicheId, { usage: string; moment: string; tag: string; viewer: string }> = {
  beaute: { usage: 'ma routine', moment: 'le matin devant le miroir', tag: '#beauté', viewer: 'les filles' },
  maison: { usage: 'ma cuisine', moment: 'au moment du ménage', tag: '#astucemaison', viewer: 'les amis' },
  mode: { usage: 'mes tenues', moment: 'quand je m’habille le matin', tag: '#mode', viewer: 'les filles' },
  tech: { usage: 'mon bureau', moment: 'au quotidien', tag: '#tech', viewer: 'les amis' },
  sport: { usage: 'mes séances', moment: 'pendant ma séance', tag: '#sport', viewer: 'la team' },
  animaux: { usage: 'le quotidien avec mon animal', moment: 'à l’heure du repas', tag: '#animaux', viewer: 'les amis des bêtes' },
  bebe: { usage: 'le quotidien avec bébé', moment: 'au moment du coucher', tag: '#maman', viewer: 'les parents' },
};

const GENERIC_HOOKS = [
  'Stop. Regarde ça avant ta prochaine commande.',
  'Je ne m’attendais pas à ça.',
  'Personne n’en parle, alors je le fais.',
  'Test honnête, sans filtre.',
  'Tu le fais sûrement mal. Regarde.',
  'Le produit qu’on me demande tout le temps.',
  'Trois secondes pour te montrer pourquoi.',
  'Arrivé ce matin, testé tout de suite.',
  'Franchement ? Je ne pensais pas le garder.',
  'Si tu hésites encore, regarde ça.',
  'Petit prix, je te montre ce que ça donne.',
  'Mon avis après une semaine.',
];

const FORMAT_HOOKS: Record<StudioFormat, string[]> = {
  demo: ['Je te montre en dix secondes.', 'Regarde comment ça marche.', 'Démo rapide, sans blabla.'],
  avant_apres: ['Avant… et après. Sans retouche.', 'Regarde bien la différence.', 'Gauche, avant. Droite, après.'],
  histoire: ['Il y a deux semaines, j’avais un souci.', 'Je vais être honnête avec toi.', 'Petite histoire, ça vaut le coup.'],
  reponse_commentaire: [
    'Tu m’as demandé si ça valait le coup.',
    'Réponse à ton commentaire : je teste.',
    'Vous êtes nombreux à me le demander.',
  ],
  unboxing: ['Il vient d’arriver, on l’ouvre ensemble.', 'Colis du jour, je l’attendais.', 'Déballage en direct, premier avis.'],
  comparaison: ['Ancien contre nouveau, on compare.', 'Lequel tu gardes ? Regarde.', 'Même geste, deux produits.'],
  routine: ['Ma routine en trente secondes.', 'Viens, je te montre ma routine.', 'La petite étape que j’ai ajoutée.'],
  top3: ['Trois raisons de le regarder de près.', 'Mon top 3, et le dernier m’a surpris.', 'Trois usages, en trente secondes.'],
};

const TONE_HOOKS: Record<Tone, string[]> = {
  energique: ['Stop, regarde ça tout de suite !', 'Trois secondes, et tu vas comprendre.', 'On teste, maintenant !'],
  calme: ['Prends deux secondes, je te montre.', 'On regarde ça ensemble, tranquillement.', 'Doucement, regarde bien ce détail.'],
  humour: ['J’ai craqué. Encore.', 'Mon colocataire me l’a déjà piqué.', 'Je ne devais rien acheter ce mois-ci.'],
  expert: ['Voilà ce qu’il faut regarder avant d’acheter.', 'Je t’explique comment il s’utilise.', 'Trois choses à savoir sur ce produit.'],
};

const ANGLE_HOOKS: Record<FixedAngle, string[]> = {
  probleme: ['Ce petit problème, tu le connais ?', 'J’en avais marre de galérer avec ça.'],
  transformation: ['Regarde la différence, sans filtre.', 'Le début, puis maintenant.'],
  objection: ['« C’est trop cher » ? Regarde d’abord.', 'Tu doutes ? Moi aussi, au début.'],
  prix: ['Voilà ce que tu as pour ce prix.', 'Petit prix, je te montre en vrai.'],
};

const TITLES: Record<StudioFormat, [string, string, string]> = {
  demo: ['La démo express', 'Le test en vrai', 'Les 3 détails qui comptent'],
  avant_apres: ['Le résultat en deux temps', 'L’avant-après en vrai', 'Avant-après et mon avis'],
  histoire: ['Mon problème, ma solution', 'Ce qui a changé', 'Le conseil que j’aurais aimé avoir'],
  reponse_commentaire: ['Je réponds en montrant', 'Oui, mais regarde', 'Les questions qu’on me pose'],
  unboxing: ['Déballage et premier test', 'Ce qu’il y a dans la boîte', 'Premières impressions'],
  comparaison: ['Avant, maintenant', 'Le match en trois critères', 'Lequel je garde'],
  routine: ['Ma routine du matin', 'L’étape que j’ai ajoutée', 'Routine express'],
  top3: ['Mon top 3', 'Trois usages malins', 'Le dernier va te surprendre'],
};

const ANGLE_TITLES: Record<FixedAngle, string> = {
  probleme: 'Le problème réglé simplement',
  transformation: 'La transformation en vrai',
  objection: 'La question qu’on me pose',
  prix: 'Ce que tu as pour ce prix',
};

const BROLL: Record<StudioFormat, string[]> = {
  demo: ['Gros plan sur le geste principal, au ralenti si possible.', 'Le produit posé, filmé en tournant autour.', 'Ta réaction, sans parler.'],
  avant_apres: ['La même zone filmée avant, au même cadrage.', 'Le geste d’application, en gros plan.', 'Le résultat en plan fixe, trois secondes.'],
  histoire: ['Toi dans la situation du problème, sans le produit.', 'Le produit sorti du sac ou du placard.', 'Un détail de ton quotidien (tasse, bureau, salle de bain).'],
  reponse_commentaire: ['Le commentaire en plein écran.', 'Le produit montré sous plusieurs angles.', 'Le détail qui répond à la question.'],
  unboxing: ['Le colis fermé, posé sur la table.', 'Le contenu étalé, vu du dessus.', 'L’étiquette ou la notice, en gros plan.'],
  comparaison: ['Les deux produits côte à côte, même lumière.', 'Le même geste avec l’un puis l’autre.', 'Le résultat des deux, en plan fixe.'],
  routine: ['Chaque étape de ta routine en plan court (2 s).', 'Le produit à sa place (étagère, sac, plan de travail).', 'Le moment de la journée à l’écran (réveil, lumière).'],
  top3: ['Chaque chiffre en grand, avec le geste qui va avec.', 'Le produit en main pour passer d’un point à l’autre.', 'Le détail du dernier point en très gros plan.'],
};

const TONE_OPENERS: Record<Tone, string> = {
  energique: 'Allez, je te montre !',
  calme: 'Je te montre tranquillement.',
  humour: 'Petite confession : j’ai failli ne pas le commander.',
  expert: 'D’abord, comment il s’utilise.',
};

/** Formats où l'entrée en matière du ton se place naturellement avant le premier plan du milieu. */
const OPENER_FORMATS: StudioFormat[] = ['demo', 'unboxing', 'comparaison', 'routine'];
/** Formats dont les temps se suivent dans un ordre précis. */
const NARRATIVE_FORMATS: StudioFormat[] = ['histoire', 'avant_apres', 'comparaison', 'routine', 'top3'];

const CTA_LINES = [
  'Si tu veux le tester, c’est dans le panier orange, juste en dessous.',
  'C’est dans le panier orange, juste en dessous. Fais-toi ton avis.',
  'Il est dans le panier orange. Dis-moi en commentaire ce que t’en penses.',
];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Durée parlée approximative (environ 3 mots par seconde). */
export function hookSeconds(text: string): number {
  return Math.min(2.9, Math.max(1, Math.round(countWords(text) * 0.33 * 10) / 10));
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function firstSentence(text: string): string {
  return (text.split('.')[0] ?? '').trim();
}

function short(text: string, max = 38): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Plages de temps des plans pour une durée : accroche courte au début, appel à l'action à la fin. */
export function timeline(total: number, shots: number): string[] {
  const hook = total <= 15 ? 2 : 3;
  const cta = total <= 15 ? 3 : total <= 30 ? 5 : 7;
  const middle = Math.max(0, shots - 2);
  const bounds = [0, hook];
  for (let i = 1; i <= middle; i++) bounds.push(Math.round(hook + ((total - hook - cta) * i) / middle));
  bounds.push(total);
  const labels: string[] = [];
  for (let i = 0; i < shots; i++) labels.push(`${bounds[i]}–${bounds[i + 1] ?? total} s`);
  return labels;
}

function styleVisual(style: string | null, faceCam: string, other: { voix_off: string; mains: string; avant_apres: string }) {
  if (style === 'voix_off') return other.voix_off;
  if (style === 'mains') return other.mains;
  if (style === 'avant_apres') return other.avant_apres;
  return faceCam;
}

type Beat = Omit<Shot, 'time'>;

function beatsFor(input: ScriptInput): Beat[] {
  const { product } = input;
  const words = NICHE_WORDS[product.niche] ?? NICHE_WORDS.maison;
  const price = formatEuros(product.price_cents);
  const name = displayName(product);
  const d = firstSentence(product.description);
  const withDesc = d ? ` ${d}.` : '';
  const beats: Record<StudioFormat, Beat[]> = {
    demo: [
      { visual: 'Tu utilises le produit devant la caméra, sans couper.', voice: `Je te présente ${name}.${withDesc}`, on_screen_text: short(name) },
      { visual: 'Plan rapproché sur le détail qui fait la différence.', voice: `Ce que j’aime : c’est simple à utiliser, ${words.moment}. Regarde ce détail.`, on_screen_text: 'Le détail qui compte' },
      { visual: 'Tu refais le geste, filmé de côté.', voice: 'Je le refais une fois, pour que tu voies bien le geste.', on_screen_text: 'Le geste, en vrai' },
      { visual: 'Le produit rangé à sa place, puis ressorti.', voice: `Et au quotidien, il trouve vite sa place dans ${words.usage}.`, on_screen_text: 'Au quotidien' },
    ],
    avant_apres: [
      { visual: 'L’avant, filmé dans la même lumière que l’après.', voice: 'Voilà où j’en étais avant. Même lumière, pas de filtre.', on_screen_text: 'Avant' },
      { visual: 'Transition (claquement de doigts), puis l’après au même cadrage.', voice: `Et après avoir utilisé ${name}. Je te laisse juger.`, on_screen_text: 'Après · sans retouche' },
      { visual: 'Le geste d’application, en gros plan.', voice: 'Voilà exactement ce que j’ai fait entre les deux.', on_screen_text: 'Ce que j’ai fait' },
      { visual: 'Avant et après côte à côte, écran partagé.', voice: 'Les deux côte à côte, pour comparer en vrai.', on_screen_text: 'Côte à côte' },
    ],
    histoire: [
      { visual: 'Toi, assis, ton naturel, le produit posé à côté.', voice: `Mon souci, c’était ${words.usage}. J’avais tout essayé, rien de simple.`, on_screen_text: 'Mon problème' },
      { visual: 'Tu montres le produit, puis tu l’utilises.', voice: `Puis j’ai testé ${name}. Ce qui a changé pour moi : c’est devenu facile.`, on_screen_text: 'Ce qui a changé' },
      { visual: 'Le moment de la découverte : le produit dans tes mains.', voice: 'Je l’ai trouvé en cherchant une solution simple, sans y croire plus que ça.', on_screen_text: 'La découverte' },
      { visual: 'Toi, aujourd’hui, dans la même situation.', voice: `Aujourd’hui, ${words.moment}, je fais comme ça.`, on_screen_text: 'Aujourd’hui' },
    ],
    reponse_commentaire: [
      { visual: 'Bulle du commentaire affichée à l’écran, toi derrière.', voice: `On m’a demandé si ${name} valait ${price}. Je te montre au lieu de te le dire.`, on_screen_text: '« Ça vaut vraiment le coup ? »' },
      { visual: 'Démonstration en une prise.', voice: 'Voilà comment je l’utilise, au quotidien, en vrai.', on_screen_text: 'En vrai, au quotidien' },
      { visual: 'Gros plan sur le détail dont parle le commentaire.', voice: 'Et pour ta question précise, regarde ce détail.', on_screen_text: 'Ta question' },
      { visual: 'Toi face caméra, ton posé.', voice: 'Si tu as d’autres questions, pose-les, je réponds en vidéo.', on_screen_text: 'D’autres questions ?' },
    ],
    unboxing: [
      { visual: 'Tu ouvres le colis, plan du dessus.', voice: `Dedans : ${name}.${withDesc}`, on_screen_text: 'Ce qu’il y a dans la boîte' },
      { visual: 'Premier test, sans couper.', voice: 'Premier test tout de suite, je te donne mon avis à chaud.', on_screen_text: 'Premier test' },
      { visual: 'Tout le contenu étalé sur la table.', voice: 'Voilà tout ce qu’il y a dedans, rien de caché.', on_screen_text: 'Tout le contenu' },
      { visual: 'Gros plan sur la finition.', voice: 'Regarde la finition de près.', on_screen_text: 'La finition' },
    ],
    comparaison: [
      { visual: 'Les deux côte à côte : ce que tu utilisais avant, et le nouveau.', voice: `À gauche, ce que j’utilisais avant. À droite, ${name}.`, on_screen_text: 'Avant · maintenant' },
      { visual: 'Le même geste avec l’un, puis avec l’autre.', voice: 'Même geste, même lumière. Regarde la différence de prise en main.', on_screen_text: 'Critère 1 : la prise en main' },
      { visual: 'Gros plan sur le résultat des deux.', voice: 'Et le résultat, côte à côte. Je te laisse comparer.', on_screen_text: 'Critère 2 : le résultat' },
      { visual: 'Les deux rangés : la place qu’ils prennent.', voice: `Côté prix, il est à ${price}. À toi de voir.`, on_screen_text: 'Critère 3 : le prix' },
    ],
    routine: [
      { visual: `Plan court : le début de ta routine, ${words.moment}.`, voice: `Ma routine, ${words.moment}. Étape un, je prépare tout.`, on_screen_text: 'Ma routine' },
      { visual: 'Le produit entre en scène, en gros plan.', voice: `Étape deux : ${name}. Je l’utilise comme ça.`, on_screen_text: 'Étape 2' },
      { visual: 'L’étape suivante, plan court.', voice: 'Étape trois, je termine, et c’est tout.', on_screen_text: 'Étape 3' },
      { visual: 'Le résultat final de la routine.', voice: 'Voilà, routine bouclée, sans prise de tête.', on_screen_text: 'Routine bouclée' },
    ],
    top3: [
      { visual: 'Le chiffre 3 à l’écran, puis le premier geste.', voice: 'Trois : il se prend en main tout de suite.', on_screen_text: '3 · en main' },
      { visual: 'Le chiffre 2, gros plan sur le produit.', voice: `Deux : ${d ? d.charAt(0).toLowerCase() + d.slice(1) : 'le détail qu’on remarque tout de suite'}.`, on_screen_text: '2 · le détail' },
      { visual: 'Le chiffre 1, le produit en action.', voice: `Et un : il trouve vite sa place, ${words.moment}.`, on_screen_text: '1 · au quotidien' },
      { visual: 'Bonus : un usage auquel on ne pense pas.', voice: 'Et un bonus : regarde cet usage auquel on ne pense pas.', on_screen_text: 'Bonus' },
    ],
  };
  return beats[input.format] ?? beats.demo;
}

function middleCount(format: StudioFormat, duration: Duration): number {
  if (format === 'top3') return duration === 60 ? 4 : 3;
  return duration === 15 ? 1 : duration === 30 ? 2 : 4;
}

function proofLine(angle: FixedAngle, price: string, tone: Tone, index: number): string {
  const lines: Record<FixedAngle, string> = {
    probleme: 'Mon souci de départ ? Voilà comment je fais maintenant.',
    transformation: 'Regarde la différence entre le début et maintenant.',
    objection: 'Tu te demandes si ça vaut le coup ? Regarde par toi-même.',
    prix: `Pour ${price}, voilà ce que tu as.`,
  };
  const tail: Record<Tone, string[]> = {
    energique: ['Je te montre en vrai, pas de montage !', 'Regarde bien !'],
    calme: ['Je te montre en vrai, sans montage.', 'Prends le temps de regarder.'],
    humour: ['Pas de trucage, juré.', 'Même mon chat est d’accord.'],
    expert: ['Regarde la texture, regarde le rendu.', 'C’est ce détail qu’il faut regarder.'],
  };
  return `${lines[angle]} ${tail[tone][index % 2]}`;
}

/** Une expression du style personnel, si elle est propre et courte (sinon rien). */
function usable(text: string | undefined, maxWords = 9): string | null {
  const t = text?.trim();
  return t && countWords(t) <= maxWords && isClean(t) && !/\blien\b/i.test(t) ? t : null;
}

function buildShots(input: ScriptInput, scriptIndex: number, duration: number, angle: FixedAngle, rng: Rng, hook: string): Shot[] {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const price = formatEuros(input.product.price_cents);
  const intro: Beat = {
    visual: styleVisual(input.style, 'Gros plan sur ton visage, le produit tenu à côté de la joue.', {
      voix_off: 'Gros plan sur le produit posé, lumière naturelle.',
      mains: 'Tes mains attrapent le produit au premier plan.',
      avant_apres: 'Écran coupé en deux : à gauche l’avant, à droite l’après.',
    }),
    voice: hook,
    on_screen_text: hook.length > 38 ? `${hook.split(/[.?!…]/)[0]}…` : hook,
  };

  const all = beatsFor(input);
  const count = middleCount(input.format, settings.duration);
  // Formats racontés (ordre important) : les premiers temps, dans l'ordre ; les autres : le premier, puis un tirage.
  const picked = NARRATIVE_FORMATS.includes(input.format)
    ? all.slice(0, count)
    : [all[0], ...rng.shuffle([1, 2, 3]).slice(0, count - 1).sort((a, b) => a - b).map((i) => all[i])];
  const middle = picked.map((b) => ({ ...b }));
  if (OPENER_FORMATS.includes(input.format) && middle[0]) middle[0].voice = `${TONE_OPENERS[settings.tone]} ${middle[0].voice}`;

  const expressions = input.personalStyle?.expressions ?? [];
  const expression = expressions.length ? usable(expressions[scriptIndex % expressions.length]) : null;
  const proof: Beat = {
    visual: 'Preuve visuelle : le résultat ou le produit en usage, en plan fixe.',
    voice: `${expression ? `${capitalize(expression.replace(/[.!?…]+$/, ''))}. ` : ''}${proofLine(angle, price, settings.tone, scriptIndex + rng.int(0, 1))}`,
    on_screen_text: `${price} · panier orange`,
  };
  // Une fin qui parle déjà du panier ferait doublon avec l'appel à l'action : on prend la suivante.
  const closing = usable(input.personalStyle?.closings.find((c) => !/panier/i.test(c)), 8);
  const cta: Beat = {
    visual: 'Tu pointes vers le bas de l’écran, vers le panier orange.',
    voice: `${closing ? `${capitalize(closing.replace(/[.!?…]+$/, ''))}. ` : ''}${CTA_LINES[scriptIndex % CTA_LINES.length]}`,
    on_screen_text: 'Panier orange, juste en dessous',
  };

  const withProof = !(input.format === 'top3' && settings.duration === 15);
  const beats = [intro, ...middle, ...(withProof ? [proof] : []), cta];
  const times = timeline(duration, beats.length);
  return beats.map((b, i) => ({ time: times[i], ...b }));
}

function buildHooks(input: ScriptInput, rng: Rng, angles: FixedAngle[]): Hook[] {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const priority = [
    usable(input.seriesAngle?.hook, 10),
    usable(input.examplePhrase ?? undefined),
    usable(input.personalStyle?.openings[0]),
    usable(input.feedback?.best[0]?.hook, 10),
  ].filter((h): h is string => Boolean(h));
  const themed = [...FORMAT_HOOKS[input.format], ...TONE_HOOKS[settings.tone], ...angles.flatMap((a) => ANGLE_HOOKS[a])];
  const pool = [...priority, ...rng.shuffle([...rng.shuffle(themed).slice(0, 6), ...rng.shuffle(GENERIC_HOOKS)])];
  const hooks: string[] = [];
  for (const text of pool) {
    if (hooks.length >= 10) break;
    if (!hooks.includes(text)) hooks.push(text);
  }
  return hooks.slice(0, 10).map((text) => ({ text, seconds: hookSeconds(text) }));
}

/** Idées de plans de coupe par défaut d'un format. */
export function defaultBroll(format: StudioFormat): string[] {
  return [...(BROLL[format] ?? BROLL.demo)];
}

function scriptDuration(target: Duration, index: number): number {
  if (target === 15) return 15;
  if (target === 60) return 60 - index * 3;
  return 30 + index * 2;
}

export function generateMockScripts(input: ScriptInput, variant = 0): ScriptOutput {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const rng = new Rng(`${input.product.id}|${input.format}|${input.style}|${settings.duration}|${settings.tone}|${settings.angle}|${variant}`);
  const fixed = input.seriesAngle?.angle ?? (settings.angle === 'varie' ? null : settings.angle);
  const start = rng.int(0, FIXED_ANGLES.length - 1);
  const angles: FixedAngle[] = [0, 1, 2].map((i) => fixed ?? FIXED_ANGLES[(start + i) % FIXED_ANGLES.length]);
  const hooks = buildHooks(input, rng, [...new Set(angles)]);
  const words = NICHE_WORDS[input.product.niche] ?? NICHE_WORDS.maison;
  const titles = TITLES[input.format] ?? TITLES.demo;
  const scripts: StudioScript[] = angles.map((angle, index) => {
    const duration = scriptDuration(settings.duration, index);
    const shots = buildShots(input, index, duration, angle, rng, hooks[index % hooks.length].text);
    const title = input.seriesAngle
      ? `${input.seriesAngle.title}${index ? ` · variante ${'ABC'[index]}` : ''}`
      : fixed
        ? `${titles[index]} · ${ANGLE_TITLES[angle].toLowerCase()}`
        : titles[index];
    return {
      title,
      angle: input.seriesAngle ? input.seriesAngle.pitch : `${ANGLE_TITLES[angle]} : ${displayName(input.product)}`,
      duration_seconds: duration,
      shots,
      call_to_action: 'Clique sur le panier orange pour voir le produit.',
      caption: `${hooks[index % hooks.length].text} ${displayName(input.product)}, testé pour toi.`,
      hashtags: ['#tiktokshop', words.tag, '#avis', '#test'],
      disclosure: DISCLOSURE_LINE,
      broll: rng.shuffle(defaultBroll(input.format)),
    };
  });
  return { hooks, scripts };
}

/** Une nouvelle accroche, différente de celles déjà proposées. */
export function regenerateMockHook(input: ScriptInput, existing: string[], attempt: number, salt = ''): Hook {
  const rng = new Rng(`${input.product.id}|${input.format}|regen|${attempt}|${salt}`);
  const pool = rng.shuffle([...GENERIC_HOOKS, ...Object.values(FORMAT_HOOKS).flat(), ...Object.values(TONE_HOOKS).flat()]);
  const text = pool.find((h) => !existing.includes(h)) ?? `${pool[0]} (${attempt + 1})`;
  return { text, seconds: hookSeconds(text) };
}

/** Accroche courte pour le récap du matin. */
export function quickHook(product: Pick<Product, 'id' | 'niche'>, day: string): string {
  const rng = new Rng(`${product.id}|${day}|recap`);
  return rng.pick(GENERIC_HOOKS);
}
